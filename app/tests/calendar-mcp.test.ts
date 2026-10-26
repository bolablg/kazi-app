// @vitest-environment edge-runtime
import { afterEach, expect, it, vi } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sha256 } from "../convex/crypto";

const modules = import.meta.glob("../convex/**/*.ts");
const user = {
  subject: "calendar-mcp-owner",
  name: "Calendar owner",
  email: "calendar@example.test",
  emailVerified: true,
};
afterEach(() => vi.useRealTimers());
async function protocol(response: Response) {
  if (response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
    const frames = (await response.text()).replace(/\r\n/g, "\n").split("\n\n");
    const data = frames.flatMap((frame) => {
      const value = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return value ? [JSON.parse(value)] : [];
    });
    return data.find((value) => value.id !== undefined);
  }
  return response.json();
}

it.each([
  "application/json, text/event-stream",
  "text/event-stream, application/json",
])(
  "calendar commands share real authorization, persistence, and retry semantics over %s",
  async (accept) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-26T13:00:00Z"));
    const t = convexTest(schema, modules),
      owner = t.withIdentity(user);
    const workspaceId = (await owner.mutation(api.commands.bootstrap, {}))!;
    await owner.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify({ type: "use_kazi_agenda" }),
      requestId: "calendar-native-setup",
    });
    const taskId = await owner.mutation(api.commands.execute, {
      workspaceId,
      command: JSON.stringify({
        type: "create_task",
        title: "Prepare a useful launch",
        description: "",
        status: "todo",
        priority: "medium",
        estimatedMinutes: 180,
        dependencies: [],
        labels: ["Delivery"],
      }),
      requestId: "calendar-mcp-create-task",
    });
    const readCredential = "synthetic_calendar_feed_permission";
    const writeCredential = "synthetic_calendar_reservation_permission";
    for (const [credential, scopes] of [
      [readCredential, ["read", "agenda:write"]],
      [writeCredential, ["read", "calendar:write"]],
    ] as const) {
      await t.mutation(internal.tokens.save, {
        subject: user.subject,
        hash: await sha256(credential),
        label: credential,
        scopes: [...scopes],
      });
    }
    let sequence = 0;
    const call = async (
      credential: string,
      name: string,
      fields: Record<string, unknown>,
    ) => {
      const response = await t.fetch("/mcp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: accept,
          Authorization: "Bearer " + credential,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: ++sequence,
          method: "tools/call",
          params: { name, arguments: { workspaceId, ...fields } },
        }),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toContain(
        accept.startsWith("text/event-stream")
          ? "text/event-stream"
          : "application/json",
      );
      return (await protocol(response)).result;
    };
    const create = {
      taskId,
      start: Date.parse("2026-10-26T14:00:00Z"),
      end: Date.parse("2026-10-26T15:00:00Z"),
      requestId: "calendar-reserve-retry",
    };
    const denied = await call(
      readCredential,
      "schedule_calendar_session",
      create,
    );
    expect(denied.isError).toBe(true);
    expect(JSON.stringify(denied)).toContain("calendar:write");
    expect(
      (await owner.query(api.commands.snapshot, { workspaceId }))
        .calendarSessions ?? [],
    ).toHaveLength(0);
    const saved = await call(
      writeCredential,
      "schedule_calendar_session",
      create,
    );
    expect(saved.isError).not.toBe(true);
    expect(
      await call(writeCredential, "schedule_calendar_session", create),
    ).toEqual(saved);
    let state = await owner.query(api.commands.snapshot, { workspaceId });
    expect(state.calendarSessions).toHaveLength(1);
    const session = state.calendarSessions![0];
    const agenda = await call(readCredential, "get_agenda", {
      from: "2026-10-26",
      to: "2026-10-26",
    });
    expect(agenda.structuredContent.result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          taskId,
          kind: "scheduled",
          sessionId: session.id,
          sessionRevision: session.revision,
        }),
      ]),
    );
    const moved = await call(writeCredential, "update_calendar_session", {
      sessionId: session.id,
      revision: session.revision,
      start: Date.parse("2026-10-26T15:30:00Z"),
      end: Date.parse("2026-10-26T16:30:00Z"),
      requestId: "calendar-move-once",
    });
    expect(moved.isError).not.toBe(true);
    const stale = await call(writeCredential, "update_calendar_session", {
      sessionId: session.id,
      revision: session.revision,
      start: Date.parse("2026-10-26T17:00:00Z"),
      end: Date.parse("2026-10-26T18:00:00Z"),
      requestId: "calendar-move-stale",
    });
    expect(stale.isError).toBe(true);
    state = await owner.query(api.commands.snapshot, { workspaceId });
    expect(state.tasks.find((task) => task.id === taskId)).toMatchObject({
      status: "todo",
    });
    expect(
      state.tasks.find((task) => task.id === taskId)!.deadline,
    ).toBeUndefined();
    // Convex freezes each transaction at the next millisecond; advance the HTTP clock before reporting.
    vi.setSystemTime(Date.now() + 10);
    const insight = await call(readCredential, "get_calendar_insights", {
      from: "2026-10-26",
      to: "2026-10-26",
      person: user.subject,
      project: "all",
    });
    expect(insight.isError).not.toBe(true);
    expect(insight.structuredContent.result).toMatchObject({
      reservedMinutes: 60,
      recordedReschedules: 1,
    });
    const capacity = await call(readCredential, "get_calendar_capacity", {
      from: "2026-10-26",
      to: "2026-10-26",
    });
    expect(capacity.isError).not.toBe(true);
    expect(capacity.structuredContent.result.days).toEqual([
      expect.objectContaining({
        date: "2026-10-26",
        scheduledMinutes: 60,
        availabilityFresh: true,
      }),
    ]);
    const tooWide = await call(readCredential, "get_calendar_capacity", {
      from: "2026-10-26",
      to: "2026-11-26",
    });
    expect(tooWide.isError).toBe(true);
    const latest = state.calendarSessions![0];
    const canceled = await call(writeCredential, "cancel_calendar_session", {
      sessionId: latest.id,
      revision: latest.revision,
      requestId: "calendar-cancel-once",
    });
    expect(canceled.isError).not.toBe(true);
    const canceledState = await owner.query(api.commands.snapshot, {
      workspaceId,
    });
    expect(canceledState.calendarSessions![0].status).toBe("released");
    const hash = await sha256(writeCredential);
    const token = await t.run((ctx) =>
      ctx.db
        .query("mcpTokens")
        .withIndex("by_hash", (q) => q.eq("hash", hash))
        .unique(),
    );
    await owner.mutation(api.tokens.revoke, { id: token!._id });
    const revoked = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: accept,
        Authorization: "Bearer " + writeCredential,
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 99, method: "tools/list" }),
    });
    expect(revoked.status).toBe(401);
  },
);
