import { mergeTeamStates } from "../shared/teams";
import { searchPeople, taskPeople } from "../shared/people";
import { buildStageReport } from "../shared/lifecycle";
import {
  isArchivedTask,
  isOpenTask,
  isSchedulableTask,
  isCommittedTask,
} from "../shared/workflow";
import { planPath } from "../shared/ids";
import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { sha256, encrypt } from "./crypto";
import { createKaziServer } from "../mcp/server";
import { prefersMcpEventStream } from "../shared/mcpTransport";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { visibleState, taskFor, projectFor, sprintFor } from "../shared/domain";
import {
  commandSchema,
  type Command,
  type LifecycleEvent,
  type ReportEvent,
} from "../shared/model";
import { commandScopes, tokenScopes } from "../shared/capabilities";
import { overviewEvents } from "../shared/overview";
import { buildTodayOverview } from "../shared/today";
import { buildCalendarInsights } from "../shared/calendarInsights";
import { calendarDayCapacity } from "../shared/calendarPlanning";
import { buildReport, reportBounds, reportCsv } from "../shared/reports";
import { invitationToken } from "./crypto";
import { MAX_FILE_BYTES } from "../shared/artifacts";
import {
  addDays,
  workingIntervals,
  subtractIntervals,
  dateInZone,
  MINUTE,
} from "../shared/scheduler";
const http = httpRouter();
const fileTransfer = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin"),
    allowedOrigin = process.env.APP_ORIGIN ?? "";
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    Vary: "Origin",
  };
  if (origin && origin !== allowedOrigin)
    return new Response("Origin is not allowed.", { status: 403 });
  if (request.method === "OPTIONS")
    return new Response(null, { status: 204, headers });
  const token = request.headers
    .get("Authorization")
    ?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!token)
    return new Response("A file transfer credential is required.", {
      status: 401,
      headers,
    });
  try {
    const ticket = await ctx.runMutation(internal.files.claim, {
      hash: await sha256(token),
      kind: request.method === "POST" ? "upload" : "download",
    });
    if (request.method === "GET") {
      if (!ticket.storageId) throw new Error("File unavailable.");
      const blob = await ctx.storage.get(ticket.storageId as Id<"_storage">);
      if (!blob) throw new Error("File unavailable.");
      return new Response(blob, {
        headers: {
          ...headers,
          "Content-Type": "application/octet-stream",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(ticket.name)}`,
        },
      });
    }
    const declaredSize = Number(
      request.headers.get("Content-Length") ?? ticket.size,
    );
    if (
      declaredSize > MAX_FILE_BYTES ||
      declaredSize !== ticket.size ||
      !request.body
    )
      throw new Error("File size does not match the upload.");
    const reader = request.body.getReader(),
      parts: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > MAX_FILE_BYTES || size > ticket.size) {
        await reader.cancel();
        throw new Error("Choose a file up to 20 MB.");
      }
      parts.push(new Uint8Array(next.value));
    }
    if (size !== ticket.size)
      throw new Error("File size does not match the upload.");
    const storageId = await ctx.storage.store(
      new Blob(parts, { type: ticket.contentType }),
    );
    try {
      const artifactId = await ctx.runMutation(internal.files.finish, {
        ticketId: ticket._id,
        storageId,
      });
      return Response.json({ artifactId }, { headers });
    } catch (error) {
      await ctx.storage.delete(storageId);
      throw error;
    }
  } catch {
    return new Response(
      "Transfer unavailable or expired. Check task access and try again.",
      { status: 400, headers },
    );
  }
});
for (const method of ["OPTIONS", "POST", "GET"] as const)
  http.route({ path: "/task-files", method, handler: fileTransfer });
http.route({
  pathPrefix: "/agenda/",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const token = new URL(request.url).pathname.match(
      /^\/agenda\/([a-f0-9]{64})\.ics$/,
    )?.[1];
    const body = token
      ? await ctx.runQuery(internal.calendar.feedContent, {
          hash: await sha256(token),
        })
      : null;
    const headers = {
      "Content-Type": "text/calendar; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Disposition": 'inline; filename="kazi-agenda.ics"',
    };
    return body === null
      ? new Response("Calendar link unavailable.", {
          status: 404,
          headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
        })
      : new Response(body, { headers });
  }),
});
http.route({
  path: "/health",
  method: "GET",
  handler: httpAction(async () =>
    Response.json({ service: "kazi", status: "ok", version: "0.1.0" }),
  ),
});
http.route({
  path: "/google/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url),
      state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    try {
      if (!state || !code || url.searchParams.has("error"))
        throw new Error("Calendar consent was not completed.");
      const link = await ctx.runMutation(internal.calendar.consumeState, {
        hash: await sha256(state),
      });
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: process.env.GOOGLE_CLIENT_ID ?? "",
          client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
          redirect_uri: process.env.CONVEX_SITE_URL + "/google/callback",
          grant_type: "authorization_code",
        }),
      });
      if (!response.ok)
        throw new Error("Google could not complete the connection.");
      const body = await response.json();
      if (!body.refresh_token)
        throw new Error(
          "Google did not provide offline consent. Reconnect and grant access.",
        );
      const encrypted = await encrypt(body.refresh_token);
      await ctx.runMutation(internal.calendar.storeSecret, {
        ...link,
        ...encrypted,
      });
      return Response.redirect(
        process.env.APP_ORIGIN + "/connections?calendar=connected",
        303,
      );
    } catch {
      return Response.redirect(
        process.env.APP_ORIGIN + "/connections?calendar=error",
        303,
      );
    }
  }),
});
const mcp = httpAction(async (ctx, request) => {
  const origin = request.headers.get("Origin");
  if (origin && origin !== process.env.APP_ORIGIN)
    return new Response("Origin is not allowed.", { status: 403 });
  if (Number(request.headers.get("Content-Length") ?? 0) > 65536)
    return new Response("Request is too large.", { status: 413 });
  const authorization = request.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer "))
    return new Response("Create a scoped MCP token in Kazi Connections.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="kazi"' },
    });
  const principal = await ctx.runQuery(internal.tokens.authenticate, {
    hash: await sha256(authorization.slice(7)),
  });
  if (!principal)
    return new Response(
      "Token expired or revoked. Create a new token in Kazi Connections.",
      { status: 401 },
    );
  const server = createKaziServer(
    async (operation, input) => {
      const requireScope = (scope: string) => {
        if (!principal.scopes.includes(scope))
          throw new Error("This token needs " + scope + " scope.");
      };
      if (operation === "list_capabilities")
        return {
          scopes: tokenScopes,
          commands: commandScopes,
          additionalScopeRules: {
            start_sprint: "tasks:write",
            update_sprint: "tasks:write when patch.taskIds is supplied",
            close_sprint: "tasks:write for a backlog closeout decision",
          },
          sprintActivation:
            "Started sprints promote Backlog tasks to To do on their start date in their timezone; draft selection preserves stages.",
          taskStages: ["backlog", "todo", "in_progress", "to_validate", "done"],
          archived:
            "Blocked, rejected, and discontinued work; restore to backlog",
          projectStages: {
            planned: "Planned",
            active: "In progress",
            on_hold: "On hold",
            done: "Delivered",
          },
          sharedRecords: true,
          browserRequired: [
            "Identity/password verification",
            "Provider OAuth consent",
            "Verified-email invitation acceptance",
          ],
          calendarPublishing:
            "Private subscribable ICS feed; refresh timing controlled by subscriber",
        };
      if (operation === "get_invitation_accept_link") {
        requireScope("read");
        return {
          url:
            process.env.APP_ORIGIN +
            "/join?token=" +
            encodeURIComponent(String(input.token)),
          requiresVerifiedEmail: true,
        };
      }
      if (operation === "list_workspaces") {
        if (!principal.scopes.includes("read"))
          throw new Error("This token needs read scope.");
        return ctx.runQuery(internal.tokens.workspacesFor, {
          subject: principal.subject,
        });
      }
      const workspaceId = String(input.workspaceId) as Id<"workspaces">;
      let state = visibleState(
        await ctx.runQuery(internal.commands.stateForActor, {
          workspaceId,
          subject: principal.subject,
        }),
        principal.subject,
      );
      const teamIds = (
        Array.isArray(input.teamIds) && input.teamIds.length
          ? input.teamIds
          : [workspaceId]
      ) as Id<"workspaces">[];
      if (
        Array.isArray(input.teamIds) &&
        [
          "list_projects",
          "list_sprints",
          "list_tasks",
          "get_agenda",
          "get_today_overview",
          "get_plan_history",
          "get_report",
          "get_workflow_report",
          "get_calendar_insights",
          "export_data",
        ].includes(operation)
      ) {
        requireScope("read");
        state = mergeTeamStates(
          await ctx.runQuery(internal.commands.statesForActor, {
            teamIds,
            subject: principal.subject,
          }),
          principal.subject,
        );
      }
      const page = (items: unknown[]) => {
        const offset = Number(input.cursor ?? 0),
          limit = Number(input.limit ?? 50);
        return {
          items: items.slice(offset, offset + limit),
          nextCursor: items.length > offset + limit ? offset + limit : null,
        };
      };
      const reads = [
        "list_members",
        "list_projects",
        "get_project",
        "list_sprints",
        "get_sprint",
        "list_tasks",
        "get_task",
        "get_proposal",
        "get_plan_history",
        "list_notifications",
        "get_preferences",
        "weekly_workload",
        "review",
        "settings",
        "availability",
        "get_calendar",
        "get_agenda",
        "get_today_overview",
        "get_project_timeline",
        "list_invitations",
        "export_data",
        "get_report",
        "list_report_events",
        "export_agenda",
        "list_calendar_links",
        "list_credentials",
        "list_mcp_activity",
        "calendar_list",
        "list_lifecycle_events",
        "get_workflow_report",
        "get_calendar_insights",
        "get_calendar_capacity",
      ];
      if (reads.includes(operation) && !principal.scopes.includes("read"))
        throw new Error("This token needs read scope.");
      switch (operation) {
        case "prepare_task_upload":
        case "prepare_artifact_download":
          requireScope(
            operation === "prepare_task_upload" ? "tasks:write" : "read",
          );
          return ctx.runAction(internal.files.prepareFor, {
            workspaceId,
            subject: principal.subject,
            mcpTokenId: principal.tokenId,
            taskId: String(input.taskId),
            kind: operation === "prepare_task_upload" ? "upload" : "download",
            ...(input.artifactId
              ? { artifactId: String(input.artifactId) }
              : {}),
            ...(input.name ? { name: String(input.name) } : {}),
            ...(input.size !== undefined ? { size: Number(input.size) } : {}),
            ...(input.contentType
              ? { contentType: String(input.contentType) }
              : {}),
            ...(input.placement
              ? { placement: input.placement as "task" | "description" }
              : {}),
          });
        case "list_task_activity":
          requireScope("read");
          return ctx.runQuery(internal.files.activityFor, {
            workspaceId,
            subject: principal.subject,
            taskId: String(input.taskId),
            paginationOpts: {
              cursor: input.cursor as string | null,
              numItems: Number(input.limit ?? 50),
            },
          });
        case "list_task_artifacts":
          requireScope("read");
          taskFor(state, String(input.taskId), principal.subject);
          return page(
            (state.artifacts ?? []).filter(
              (a) => a.taskId === input.taskId && !a.removedAt,
            ),
          );
        case "create_team":
          requireScope("people:manage");
          return ctx.runMutation(internal.commands.createTeamFor, {
            subject: principal.subject,
            name: String(input.name),
          });
        case "list_lifecycle_events":
          return ctx.runQuery(internal.reports.lifecycleFor, {
            workspaceId,
            subject: principal.subject,
            ...(input.entityId ? { entityId: String(input.entityId) } : {}),
            paginationOpts: {
              cursor: input.cursor as string | null,
              numItems: Number(input.limit ?? 100),
            },
          });
        case "get_workflow_report": {
          const zone = state.members.find((m) => m.id === principal.subject)!
            .preferences.timezone;
          const history: LifecycleEvent[] = [];
          let cursor: string | null = null;
          let done = false;
          while (!done) {
            const result: {
              page: LifecycleEvent[];
              continueCursor: string;
              isDone: boolean;
            } = await ctx.runQuery(internal.reports.allLifecycleFor, {
              teamIds,
              subject: principal.subject,
              paginationOpts: { cursor, numItems: 100 },
            });
            history.push(...result.page);
            cursor = result.continueCursor;
            done = result.isDone;
          }
          return buildStageReport(state, history, {
            from: String(input.from),
            to: String(input.to),
            zone,
            actorId: principal.subject,
            person: String(input.person ?? "all"),
            project: String(input.project ?? "all"),
            now: Date.now(),
          });
        }

        case "get_today_overview": {
          if (input.projectId && input.projectId !== "all")
            projectFor(state, String(input.projectId), principal.subject);
          const person = String(input.person ?? principal.subject);
          if (
            person !== "all" &&
            !state.members.some((member) => member.id === person)
          )
            throw new Error("Select an available person.");
          return buildTodayOverview(state, {
            actorId: principal.subject,
            now: Date.now(),
            person,
            project: String(input.projectId ?? "all"),
            attentionPage:
              input.attentionPage === undefined
                ? undefined
                : Number(input.attentionPage),
            focusPage:
              input.focusPage === undefined
                ? undefined
                : Number(input.focusPage),
            activityPage:
              input.activityPage === undefined
                ? undefined
                : Number(input.activityPage),
          });
        }
        case "get_calendar":
          return (
            state.calendars.find((cal) => cal.ownerId === principal.subject) ??
            null
          );
        case "get_agenda": {
          if (input.projectId && input.projectId !== "all")
            projectFor(state, String(input.projectId), principal.subject);
          const person = String(input.person ?? principal.subject);
          if (
            person !== "all" &&
            !state.members.some((member) => member.id === person)
          )
            throw new Error("Select an available person.");
          reportBounds(
            String(input.from),
            String(input.to),
            state.members.find((m) => m.id === principal.subject)!.preferences
              .timezone,
          );
          return page(
            overviewEvents(state, {
              actorId: principal.subject,
              assigneeId: person,
              projectId: String(input.projectId ?? "all"),
              zone: state.members.find((m) => m.id === principal.subject)!
                .preferences.timezone,
              from: String(input.from),
              to: String(input.to),
              showProposed: Boolean(input.showProposed),
            }),
          );
        }
        case "get_project_timeline": {
          const project = projectFor(
            state,
            String(input.projectId),
            principal.subject,
          );
          return {
            project,
            ...page(
              state.tasks
                .filter((t) => t.projectId === project.id && !isArchivedTask(t))
                .map((t) => ({
                  id: t.id,
                  title: t.title,
                  status: t.status,
                  startDate: t.startDate ?? null,
                  deadline: t.deadline ?? null,
                  milestone: t.milestone ?? false,
                  dependencies: t.dependencies,
                })),
            ),
          };
        }
        case "list_invitations":
          return page(state.invitations);
        case "export_data":
          return {
            format: "kazi-export/1",
            exportedAt: Date.now(),
            accountIdentity: await ctx.runQuery(internal.identity.exportFor, {
              actorId: principal.subject,
            }),
            data: state,
          };
        case "list_report_events":
          return ctx.runQuery(internal.reports.eventsFor, {
            workspaceId,
            subject: principal.subject,
            from: Number(input.from),
            to: Number(input.to),
            paginationOpts: {
              cursor: input.cursor as string | null,
              numItems: Number(input.limit ?? 100),
            },
          });
        case "get_calendar_capacity": {
          const member = state.members.find(
            (item) => item.id === principal.subject,
          )!;
          const zone = member.preferences.timezone;
          const from = String(input.from),
            to = String(input.to);
          reportBounds(from, to, zone);
          const days: string[] = [];
          for (
            let day = from;
            day <= to && days.length < 32;
            day = addDays(day, 1)
          )
            days.push(day);
          if (days.length > 31)
            throw new Error("Choose at most 31 dates for calendar capacity.");
          const now = Date.now(),
            calendar = state.calendars.find(
              (item) => item.ownerId === principal.subject,
            );
          return {
            timezone: zone,
            asOf: now,
            availabilityMode: calendar?.selectedIds.length
              ? "external"
              : "kazi_only",
            externalLastSync: calendar?.lastSync ?? null,
            days: days.map((date) => ({
              date,
              ...calendarDayCapacity(state, principal.subject, date, now),
            })),
          };
        }
        case "get_calendar_insights": {
          const zone = state.members.find(
            (member) => member.id === principal.subject,
          )!.preferences.timezone;
          if (input.project && input.project !== "all")
            projectFor(state, String(input.project), principal.subject);
          const person = String(input.person ?? "all");
          if (
            person !== "all" &&
            !state.members.some((member) => member.id === person)
          )
            throw new Error("Select an available person.");
          return buildCalendarInsights(state, {
            from: String(input.from),
            to: String(input.to),
            zone,
            actorId: principal.subject,
            person,
            project: String(input.project ?? "all"),
            now: Date.now(),
          });
        }
        case "get_report": {
          const zone = state.members.find((m) => m.id === principal.subject)!
            .preferences.timezone;
          const filter = {
            from: String(input.from),
            to: String(input.to),
            zone,
            actorId: principal.subject,
            person: String(input.person ?? "all"),
            project: String(input.project ?? "all"),
            now: Date.now(),
          };
          const bounds = reportBounds(filter.from, filter.to, zone);
          const history: ReportEvent[] = [];
          let cursor: string | null = null;
          let done = false;
          while (!done) {
            const result: {
              page: ReportEvent[];
              continueCursor: string;
              isDone: boolean;
            } = await ctx.runQuery(internal.reports.allEventsFor, {
              teamIds,
              subject: principal.subject,
              ...bounds,
              paginationOpts: { cursor, numItems: 100 },
            });
            history.push(...result.page);
            cursor = result.continueCursor;
            done = result.isDone;
          }
          const report = buildReport(state, history, filter);
          return input.format === "csv"
            ? {
                filename: `kazi-report-${filter.from}-${filter.to}.csv`,
                contentType: "text/csv",
                content: reportCsv(report),
              }
            : {
                filter,
                report,
                definitions: {
                  scheduledMinutes:
                    "Confirmed planned focus; not logged or measured work",
                  cycleTime: "Elapsed from first In progress to completion",
                  leadTime: "Elapsed from capture to completion",
                },
              };
        }
        case "export_agenda":
          return {
            contentType: "text/calendar",
            filename: "kazi-agenda.ics",
            content: await ctx.runQuery(internal.calendar.exportAgendaFor, {
              workspaceId,
              subject: principal.subject,
              ...(input.projectId
                ? { projectId: String(input.projectId) }
                : {}),
              includeDeadlines: Boolean(input.includeDeadlines),
              allTeams: Boolean(input.allTeams),
            }),
          };
        case "list_calendar_links":
          return ctx.runQuery(internal.calendar.feedsFor, {
            workspaceId,
            subject: principal.subject,
          });
        case "create_calendar_link":
          requireScope("agenda:write");
          return ctx.runAction(internal.calendar.createFeedFor, {
            workspaceId,
            subject: principal.subject,
            label: String(input.label),
            ...(input.projectId ? { projectId: String(input.projectId) } : {}),
            includeDeadlines: Boolean(input.includeDeadlines),
            allTeams: Boolean(input.allTeams),
          });
        case "revoke_calendar_link":
          requireScope("agenda:write");
          return ctx.runMutation(internal.calendar.revokeFeedFor, {
            id: String(input.id) as Id<"calendarFeeds">,
            subject: principal.subject,
          });
        case "list_credentials":
          return ctx.runQuery(internal.tokens.listFor, {
            subject: principal.subject,
          });
        case "list_mcp_activity":
          return page(
            await ctx.runQuery(internal.tokens.activityFor, {
              subject: principal.subject,
            }),
          );
        case "create_credential":
          requireScope("credentials:manage");
          return {
            token: await ctx.runAction(internal.tokens.mintFor, {
              subject: principal.subject,
              parentId: principal.tokenId,
              label: String(input.label),
              scopes: input.scopes as string[],
            }),
          };
        case "revoke_credential":
          requireScope("credentials:manage");
          return ctx.runMutation(internal.tokens.revokeFor, {
            id: String(input.id) as Id<"mcpTokens">,
            subject: principal.subject,
          });
        case "enable_collaboration":
          requireScope("people:manage");
          return ctx.runMutation(internal.commands.enableFor, {
            workspaceId,
            subject: principal.subject,
          });
        case "calendar_list":
          return ctx.runAction(internal.calendar.listFor, {
            workspaceId,
            subject: principal.subject,
          });
        case "calendar_connect":
          requireScope("connections:manage");
          return {
            url: await ctx.runAction(internal.calendar.connectFor, {
              workspaceId,
              subject: principal.subject,
            }),
            requiresBrowserConsent: true,
          };
        case "calendar_choose":
          requireScope("connections:manage");
          return ctx.runAction(internal.calendar.chooseFor, {
            workspaceId,
            subject: principal.subject,
            selectedIds: input.selectedIds as string[],
            destinationId: "kazi",
            shareAvailability: Boolean(input.shareAvailability),
          });
        case "calendar_disconnect":
          requireScope("connections:manage");
          return ctx.runAction(internal.calendar.disconnectFor, {
            workspaceId,
            subject: principal.subject,
          });
        case "calendar_refresh":
          requireScope("connections:manage");
          return ctx.runAction(internal.calendar.refreshFor, {
            workspaceId,
            subject: principal.subject,
          });
        case "list_members":
          if (input.projectId)
            projectFor(state, String(input.projectId), principal.subject);
          return page(
            searchPeople(
              input.projectId
                ? taskPeople(state, String(input.projectId))
                : state.members,
              String(input.search ?? ""),
            ).map(({ id, name, username, email, role }) => ({
              id,
              name,
              username,
              email,
              role,
            })),
          );
        case "list_projects":
          return page(
            state.projects
              .filter(
                (p) =>
                  p.archived === Boolean(input.archived) &&
                  (!input.favorite ||
                    state.members
                      .find((m) => m.id === principal.subject)
                      ?.favoriteProjectIds?.includes(p.id)),
              )
              .map((project) => ({
                ...project,
                teamId:
                  state.resourceTeams?.[project.id] ?? String(workspaceId),
              })),
          );
        case "get_project":
          return projectFor(state, String(input.id), principal.subject);
        case "list_sprints":
          return page(
            (state.sprints ?? [])
              .filter(
                (sprint) => !input.status || sprint.status === input.status,
              )
              .map((sprint) => ({
                ...sprint,
                teamId: state.resourceTeams?.[sprint.id] ?? String(workspaceId),
              })),
          );
        case "get_sprint":
          return sprintFor(state, String(input.id), principal.subject);
        case "list_tasks":
          return page(
            state.tasks
              .filter(
                (t) =>
                  (!input.projectId || t.projectId === input.projectId) &&
                  (!input.sprintId ||
                    sprintFor(
                      state,
                      String(input.sprintId),
                      principal.subject,
                    ).taskIds.includes(t.id)) &&
                  isArchivedTask(t) === Boolean(input.archived) &&
                  (!input.status || t.status === input.status) &&
                  (!input.assigneeId ||
                    (input.assigneeId === "unassigned"
                      ? !t.assigneeId
                      : t.assigneeId === input.assigneeId)) &&
                  (!input.label ||
                    t.labels.some(
                      (label) =>
                        label.toLowerCase() ===
                        String(input.label).toLowerCase(),
                    )) &&
                  (!input.search ||
                    (t.title + " " + t.description)
                      .toLowerCase()
                      .includes(String(input.search).toLowerCase())),
              )
              .map((task) => ({
                ...task,
                teamId: state.resourceTeams?.[task.id] ?? String(workspaceId),
              })),
          );
        case "get_task":
          return {
            task: taskFor(state, String(input.id), principal.subject),
            activity: state.activities.filter((a) => a.taskId === input.id),
            artifacts: (state.artifacts ?? []).filter(
              (a) => a.taskId === input.id && !a.removedAt,
            ),
          };
        case "get_proposal":
          return state.proposals.find((p) => p.id === input.id) ?? null;
        case "get_plan_history":
          return page(
            state.versions.filter(
              (v) => !input.projectId || v.projectId === input.projectId,
            ),
          );
        case "list_notifications":
          return page(state.notifications);
        case "get_preferences":
          return state.members.find((m) => m.id === principal.subject)
            ?.preferences;
        case "weekly_workload":
          return {
            remainingMinutes: state.tasks
              .filter(
                (t) =>
                  t.assigneeId === principal.subject &&
                  isOpenTask(t) &&
                  !state.tasks.some((c) => c.parentId === t.id),
              )
              .reduce(
                (n, t) => n + (t.remainingMinutes ?? t.estimatedMinutes ?? 0),
                0,
              ),
            unknownEstimates: state.tasks
              .filter(
                (t) =>
                  t.assigneeId === principal.subject &&
                  t.remainingMinutes === undefined &&
                  t.estimatedMinutes === undefined,
              )
              .map((t) => t.id),
          };
        case "settings":
          return {
            url: process.env.APP_ORIGIN + "/settings",
            message:
              "Change personal approval policy in the authenticated app.",
          };
        case "review": {
          const p = state.proposals.find(
            (p) => p.id === input.id && p.revision === input.revision,
          );
          if (!p) throw new Error("Proposal revision is unavailable.");
          return {
            url: `${process.env.APP_ORIGIN}${planPath(p.id, p.revision)}`,
            revision: p.revision,
            message:
              "Open this authenticated link to review and approve. No sessions have been scheduled by this tool.",
          };
        }
        case "availability": {
          await ctx.runAction(internal.calendar.refreshFor, {
            workspaceId,
            subject: principal.subject,
          });
          const current = visibleState(
            await ctx.runQuery(internal.commands.stateForActor, {
              workspaceId,
              subject: principal.subject,
            }),
            principal.subject,
          );
          const prefs = current.members.find(
              (m) => m.id === principal.subject,
            )!.preferences,
            now = Date.now();
          return {
            asOf: now,
            timezone: prefs.timezone,
            busy: [
              ...current.busy,
              ...(current.calendarSessions ?? [])
                .filter(
                  (session) =>
                    session.assigneeId === principal.subject &&
                    session.status === "scheduled",
                )
                .map((session) => ({
                  start: session.start,
                  end: session.end,
                  ownerId: session.assigneeId,
                })),
              ...current.proposals
                .filter((p) =>
                  ["applying", "applied", "partial"].includes(p.status),
                )
                .flatMap((p) =>
                  p.alternatives[p.selected].sessions
                    .filter(
                      (session) =>
                        session.assigneeId === principal.subject &&
                        ["scheduled", "pending"].includes(session.status),
                    )
                    .map((session) => ({
                      start: session.start,
                      end: session.end,
                      ownerId: session.assigneeId,
                    })),
                ),
            ],
            available: subtractIntervals(
              workingIntervals(dateInZone(now, prefs.timezone), 7, prefs, now),
              [
                ...current.busy,
                ...current.proposals
                  .filter((p) =>
                    ["applying", "applied", "partial"].includes(p.status),
                  )
                  .flatMap((p) =>
                    p.alternatives[p.selected].sessions.filter(
                      (session) =>
                        session.assigneeId === principal.subject &&
                        ["scheduled", "pending"].includes(session.status),
                    ),
                  ),
              ],
              prefs.bufferMinutes * MINUTE,
            ),
          };
        }
      }
      const { workspaceId: _, requestId, ...fields } = input;
      let candidate: Record<string, unknown> =
        operation === "execute_action"
          ? (input.command as Record<string, unknown>)
          : { ...fields, type: operation };
      if (operation === "complete")
        candidate = {
          type: "update_task",
          id: input.id,
          patch: { status: "done" },
        };
      if (operation === "assign")
        candidate = {
          type: "update_task",
          id: input.id,
          patch: { assigneeId: input.assigneeId },
        };
      if (operation === "recovery")
        candidate = { ...fields, type: "propose", trigger: "recovery" };
      const command = commandSchema.parse(candidate);
      requireScope(commandScopes[command.type]);
      if (
        command.type === "start_sprint" ||
        (command.type === "update_sprint" &&
          command.patch.taskIds !== undefined) ||
        (command.type === "close_sprint" &&
          command.decisions.some((decision) => decision.action === "backlog"))
      )
        requireScope("tasks:write");
      const args = {
        workspaceId,
        subject: principal.subject,
        command: JSON.stringify(command),
        requestId: String(requestId),
      };
      if (
        [
          "schedule_calendar_session",
          "update_calendar_session",
          "cancel_calendar_session",
          "restore_calendar_sessions",
        ].includes(command.type)
      )
        return ctx.runAction(internal.commands.calendarFor, args);
      if (command.type === "release_sessions")
        return ctx.runMutation(internal.commands.queueRelease, args);
      if (command.type === "invite")
        return ctx.runAction(internal.commands.inviteFor, args);
      if (["propose", "approve"].includes(command.type))
        await ctx.runAction(internal.calendar.refreshScope, {
          workspaceId,
          subject: principal.subject,
          ...(command.type === "propose" && command.projectId
            ? { projectId: command.projectId }
            : {}),
          ...(command.type === "propose" && command.sprintId
            ? { sprintId: command.sprintId }
            : {}),
          ...(command.type === "approve" ? { proposalId: command.id } : {}),
        });
      return ctx.runMutation(internal.commands.verified, args);
    },
    async (tool, outcome) => {
      await ctx.runMutation(internal.tokens.seen, {
        id: principal.tokenId,
        tool,
        outcome,
      });
    },
  );
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: !prefersMcpEventStream(request.headers.get("Accept")),
    maxRequestBodySize: 65536,
  });
  await server.connect(transport);
  const response = await transport.handleRequest(request);
  if (response.ok) {
    const client = server.server.getClientVersion();
    try {
      await ctx.runMutation(internal.tokens.seen, {
        id: principal.tokenId,
        ...(client
          ? { clientName: client.name, clientVersion: client.version }
          : {}),
      });
    } catch {
      /* A metadata write must not change an already completed MCP response. */
    }
  }
  return response;
});
http.route({ path: "/mcp", method: "POST", handler: mcp });
http.route({ path: "/mcp", method: "GET", handler: mcp });
http.route({ path: "/mcp", method: "DELETE", handler: mcp });
export default http;
