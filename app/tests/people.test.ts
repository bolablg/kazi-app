import { describe, it, expect } from "vitest";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { execute } from "../shared/domain";
import { searchPeople, taskPeople, moveMentions } from "../shared/people";
import { mergeTeamStates } from "../shared/teams";
import type { Context, Mention } from "../shared/model";
const now = Date.parse("2026-10-26T16:00:00Z");
let id = 0;
const context = (actorId = DEMO_USER): Context => ({
  actorId,
  now,
  id: () => `people-${++id}`,
});
const reference = (
  text: string,
  label: string,
  memberId = "demo-amira",
): Mention => ({
  memberId,
  start: text.indexOf(label),
  end: text.indexOf(label) + label.length,
});
describe("people and identity-backed mentions", () => {
  it("searches names, usernames and email without mixing project/team access", () => {
    const state = fixtureState(now);
    expect(searchPeople(state.members, "@amira.chen").map((m) => m.id)).toEqual(
      ["demo-amira"],
    );
    expect(
      searchPeople(state.members, "DANIEL@EXAMPLE").map((m) => m.id),
    ).toEqual(["demo-daniel"]);
    expect(searchPeople(state.members, "chen")).toHaveLength(1);
    expect(taskPeople(state, "learning").map((m) => m.id)).toEqual([DEMO_USER]);
    const other = structuredClone(state);
    other.workspace.id = "other";
    other.members = [{ ...other.members[1], id: "outside-person" }];
    other.projects = [
      {
        ...other.projects[0],
        id: "other-project",
        ownerId: "outside-person",
        memberIds: ["outside-person"],
      },
    ];
    other.tasks = [];
    const merged = mergeTeamStates(
      [
        { id: "a", state },
        { id: "b", state: other },
      ],
      DEMO_USER,
    );
    expect(
      taskPeople(merged, "website").some((m) => m.id === "outside-person"),
    ).toBe(false);
  });
  it("keeps references through edits and drops a reference when its text is edited", () => {
    const text = "Hello @Amira Chen!",
      mentions = [reference(text, "@Amira Chen")];
    expect(moveMentions(text, "Hi " + text, mentions)).toEqual([
      { memberId: "demo-amira", start: 9, end: 20 },
    ]);
    expect(moveMentions(text, "Hello @Amira Changed!", mentions)).toEqual([]);
    expect(moveMentions(text, text + " Today", mentions)).toEqual(mentions);
  });
  it("persists comment references, adds collaborators and sends exactly one notification per person", () => {
    const text = "  Please ask @amira.chen and @amira.chen  ";
    const first = reference(text, "@amira.chen"),
      second = {
        ...first,
        start: text.lastIndexOf("@amira.chen"),
        end: text.lastIndexOf("@amira.chen") + 11,
      };
    const { state, result } = execute(
      fixtureState(now),
      { type: "comment", id: "t1", body: text, mentions: [first, second] },
      context(),
    );
    const event = state.activities.find((a) => a.id === result)!;
    expect(event.message).toBe(text.trim());
    expect(event.mentions?.[0].start).toBe(first.start - 2);
    expect(state.tasks.find((t) => t.id === "t1")?.collaborators).toContain(
      "demo-amira",
    );
    const notices = state.notifications.filter(
      (n) => n.key === "comment:" + result,
    );
    expect(notices.filter((n) => n.recipientId === "demo-amira")).toHaveLength(
      1,
    );
    expect(
      notices.find((n) => n.recipientId === "demo-amira")?.title,
    ).toContain("mentioned you");
    expect(notices.some((n) => n.recipientId === DEMO_USER)).toBe(false);
    state.members.find((m) => m.id === "demo-amira")!.username = "renamed";
    expect(event.mentions?.[0].memberId).toBe("demo-amira");
  });
  it("notifies only newly mentioned people in descriptions and retains validation ownership", () => {
    const text = "Review with @amira.chen";
    let { state, result } = execute(
      fixtureState(now),
      {
        type: "create_task",
        projectId: "website",
        title: "Mentioned brief",
        description: text,
        descriptionMentions: [reference(text, "@amira.chen")],
        priority: "medium",
        dependencies: [],
        labels: [],
        ownerId: "demo-amira",
        assigneeId: DEMO_USER,
      },
      context(),
    );
    const count = () =>
      state.notifications.filter(
        (n) => n.taskId === result && n.title.includes("mentioned you"),
      ).length;
    expect(count()).toBe(1);
    state = execute(
      state,
      {
        type: "update_task",
        id: result,
        patch: {
          description: text,
          descriptionMentions: [reference(text, "@amira.chen")],
          status: "to_validate",
        },
      },
      context(),
    ).state;
    expect(count()).toBe(1);
    expect(
      state.notifications.some(
        (n) =>
          n.taskId === result &&
          n.recipientId === "demo-amira" &&
          n.title === "Task ready for validation",
      ),
    ).toBe(true);
    state = execute(
      state,
      {
        type: "update_task",
        id: result,
        patch: { description: "Plain replacement" },
      },
      context(),
    ).state;
    expect(
      state.tasks.find((t) => t.id === result)?.descriptionMentions,
    ).toEqual([]);
  });
  it("rejects foreign, inaccessible, overlapping and malformed mention references atomically", () => {
    const state = fixtureState(now);
    for (const mentions of [
      [{ memberId: "outside", start: 0, end: 6 }],
      [{ memberId: "demo-amira", start: 0, end: 99 }],
      [{ memberId: "demo-amira", start: 1, end: 6 }],
      [
        { memberId: "demo-amira", start: 0, end: 6 },
        { memberId: "demo-daniel", start: 2, end: 6 },
      ],
    ])
      expect(() =>
        execute(
          state,
          { type: "comment", id: "t1", body: "@amira", mentions },
          context(),
        ),
      ).toThrow();
    const privateTask = state.tasks.find((t) => t.projectId === "learning")!;
    expect(() =>
      execute(
        state,
        {
          type: "comment",
          id: privateTask.id,
          body: "@amira",
          mentions: [{ memberId: "demo-amira", start: 0, end: 6 }],
        },
        context(),
      ),
    ).toThrow("access");
    expect(state.tasks.find((t) => t.id === "t1")?.collaborators).toEqual([]);
  });
  it("keeps explicit collaborators notified on later comments and rejects outsiders", () => {
    let state = fixtureState(now);
    state = execute(
      state,
      {
        type: "update_task",
        id: "t1",
        patch: { collaborators: ["demo-daniel"] },
      },
      context(),
    ).state;
    expect(
      state.notifications.some(
        (n) =>
          n.recipientId === "demo-daniel" &&
          n.title === "Added as a collaborator",
      ),
    ).toBe(true);
    const posted = execute(
      state,
      { type: "comment", id: "t1", body: "The brief is ready." },
      context("demo-amira"),
    );
    expect(
      posted.state.notifications.some(
        (n) =>
          n.key === "comment:" + posted.result &&
          n.recipientId === "demo-daniel",
      ),
    ).toBe(true);
    expect(() =>
      execute(
        state,
        {
          type: "update_task",
          id: "t1",
          patch: { collaborators: ["outside"] },
        },
        context(),
      ),
    ).toThrow();
  });
});
