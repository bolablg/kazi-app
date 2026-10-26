import { taskDate } from "./overview";
import { Temporal } from "@js-temporal/polyfill";
import type { State } from "./model";
import { isArchivedTask } from "./workflow";

export const icalText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
export function foldIcalLine(line: string) {
  const encoder = new TextEncoder();
  const result: string[] = [];
  let current = "",
    size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    if (size + bytes > 75) {
      result.push(current);
      current = " ";
      size = 1;
    }
    current += char;
    size += bytes;
  }
  result.push(current);
  return result.join("\r\n");
}
const utc = (at: number) =>
  new Date(at)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
const date = (value: string) => value.replace(/-/g, "");
/** Receives an already-authorized visible state; never exports external busy details. */
export function buildIcal(
  state: State,
  subject: string,
  options: {
    projectId?: string;
    includeDeadlines?: boolean;
    appOrigin?: string;
  } = {},
) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Kazi//Agenda//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:Kazi agenda",
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const previouslyAssigned = new Set(
    (state.calendarSessions ?? [])
      .filter((session) => session.assigneeId === subject)
      .map((session) => session.taskId),
  );
  const tasks = new Map(
    state.tasks
      .filter(
        (t) =>
          (t.assigneeId === subject || previouslyAssigned.has(t.id)) &&
          (!options.projectId || t.projectId === options.projectId),
      )
      .map((t) => [t.id, t]),
  );
  const projects = new Map(state.projects.map((p) => [p.id, p]));
  const seen = new Set<string>();
  const receipts = [
    { createdAt: 0, sessions: state.calendarSessions ?? [] },
    ...state.proposals
      .filter((p) => ["applied", "partial", "applying"].includes(p.status))
      .map((p) => ({
        createdAt: p.createdAt,
        sessions: p.alternatives[p.selected]?.sessions ?? [],
      })),
    ...state.versions
      .filter(
        (version) => !state.proposals.some((p) => p.id === version.proposalId),
      )
      .map((version) => ({
        createdAt: version.createdAt,
        sessions: version.sessions,
      })),
  ];
  for (const receipt of receipts) {
    for (const session of receipt.sessions) {
      const task = tasks.get(session.taskId);
      if (
        !task ||
        session.assigneeId !== subject ||
        !["scheduled", "released"].includes(session.status) ||
        seen.has(session.id)
      )
        continue;
      seen.add(session.id);
      const project = projects.get(task.projectId),
        modifiedAt = Math.max(
          session.updatedAt ?? receipt.createdAt,
          task.updatedAt,
          project?.updatedAt ?? 0,
        );
      const canceled =
        session.status === "released" ||
        task.assigneeId !== subject ||
        isArchivedTask(task) ||
        task.status === "done" ||
        projects.get(task.projectId)?.archived;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${session.id}@agenda.kazi`,
        `DTSTAMP:${utc(modifiedAt)}`,
        `LAST-MODIFIED:${utc(modifiedAt)}`,
        `DTSTART:${utc(session.start)}`,
        `DTEND:${utc(session.end)}`,
        `SUMMARY:${icalText(task.title)}`,
        `DESCRIPTION:${icalText("Focus session · " + (projects.get(task.projectId)?.title ?? "Kazi"))}`,
        `STATUS:${canceled ? "CANCELLED" : "CONFIRMED"}`,
        `TRANSP:${canceled ? "TRANSPARENT" : "OPAQUE"}`,
        `SEQUENCE:${2 * (task.revision + (project?.revision ?? 0) + ("revision" in session ? Number(session.revision) : 1)) + (canceled ? 1 : 0)}`,
      );
      if (options.appOrigin)
        lines.push(
          `URL:${options.appOrigin.replace(/\/$/, "")}/task/${task.id}`,
        );
      lines.push("END:VEVENT");
    }
  }
  if (options.includeDeadlines)
    for (const task of tasks.values()) {
      if (!task.deadline) continue;
      const canceled =
        isArchivedTask(task) ||
        task.status === "done" ||
        projects.get(task.projectId)?.archived;
      const due = taskDate(
        task,
        state.members.find((m) => m.id === subject)?.preferences.timezone ??
          "UTC",
      )!;
      const project = projects.get(task.projectId),
        modifiedAt = Math.max(task.updatedAt, project?.updatedAt ?? 0);
      lines.push(
        "BEGIN:VEVENT",
        `UID:deadline-${task.id}@agenda.kazi`,
        `DTSTAMP:${utc(modifiedAt)}`,
        `LAST-MODIFIED:${utc(modifiedAt)}`,
        `DTSTART;VALUE=DATE:${date(due)}`,
        `DTEND;VALUE=DATE:${date(Temporal.PlainDate.from(due).add({ days: 1 }).toString())}`,
        `SUMMARY:${icalText("Due: " + task.title)}`,
        `STATUS:${canceled ? "CANCELLED" : "CONFIRMED"}`,
        "TRANSP:TRANSPARENT",
        `SEQUENCE:${2 * (task.revision + (project?.revision ?? 0)) + (canceled ? 1 : 0)}`,
        "END:VEVENT",
      );
    }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcalLine).join("\r\n") + "\r\n";
}
