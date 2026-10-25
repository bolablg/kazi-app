import { describe, expect, it } from "vitest";
import { fixtureState, DEMO_USER } from "../shared/fixtures";
import { execute, visibleState } from "../shared/domain";
import { favoriteItems } from "../shared/favorites";
import { mergeTeamStates } from "../shared/teams";
import type { Context } from "../shared/model";
const context = (now: number, actorId = DEMO_USER): Context => ({
  actorId,
  now,
  id: () => "favorite-op",
});
describe("personal mixed favorites", () => {
  it("stores a team star only for the actor, is idempotent, and changes no shared work", () => {
    const initial = fixtureState(1000);
    const first = execute(
      initial,
      { type: "favorite_team", favorite: true },
      context(1000),
    ).state;
    const again = execute(
      first,
      { type: "favorite_team", favorite: true },
      context(2000),
    ).state;
    expect(again).toEqual(first);
    expect(first.members[0].favoriteTeamAt).toBe(1000);
    expect(first.members[1].favoriteTeamAt).toBeUndefined();
    expect(first.tasks).toEqual(initial.tasks);
    expect(first.projects).toEqual(initial.projects);
    expect(first.activities).toEqual(initial.activities);
    expect(first.lifecycleEvents).toEqual(initial.lifecycleEvents);
    expect(
      visibleState(first, "demo-amira").members[0].favoriteTeamAt,
    ).toBeUndefined();
    expect(
      execute(first, { type: "favorite_team", favorite: false }, context(3000))
        .state.members[0].favoriteTeamAt,
    ).toBeUndefined();
    expect(() =>
      execute(
        first,
        { type: "favorite_team", favorite: true },
        context(3000, "outsider"),
      ),
    ).toThrow("access");
    const personal = structuredClone(initial);
    personal.workspace.kind = "personal";
    expect(() =>
      execute(
        personal,
        { type: "favorite_team", favorite: true },
        context(3000),
      ),
    ).toThrow("shared team");
  });
  it("mixes project and team stars in saved order and retains older project favorites", () => {
    let state = fixtureState(1000);
    state.members[0].favoriteProjectIds = ["brand"];
    state = execute(
      state,
      { type: "favorite_project", projectId: "website", favorite: true },
      context(1000),
    ).state;
    state = execute(
      state,
      { type: "favorite_team", favorite: true },
      context(2000),
    ).state;
    expect(
      favoriteItems(state, DEMO_USER).map((item) => [item.kind, item.id]),
    ).toEqual([
      ["team", "demo-workspace"],
      ["project", "website"],
      ["project", "brand"],
    ]);
    const repeated = execute(
      state,
      { type: "favorite_project", projectId: "website", favorite: true },
      context(5000),
    ).state;
    expect(repeated.members[0].favoriteProjectAt?.website).toBe(1000);
    const removed = execute(
      state,
      { type: "favorite_project", projectId: "website", favorite: false },
      context(5000),
    ).state;
    expect(removed.members[0].favoriteProjectAt?.website).toBeUndefined();
  });
  it("uses each team's membership and removes inaccessible or archived projects from shortcuts", () => {
    const a = fixtureState(1000),
      b = fixtureState(1000);
    a.members[0].favoriteProjectIds = ["website"];
    a.members[0].favoriteProjectAt = { website: 1000 };
    b.members[0].role = "guest";
    b.members[0].favoriteTeamAt = 2000;
    b.members[0].favoriteProjectIds = ["secret"];
    b.projects = [
      {
        ...b.projects[1],
        id: "secret",
        private: true,
        memberIds: ["demo-amira"],
        ownerId: "demo-amira",
      },
    ];
    b.tasks = [];
    const merged = mergeTeamStates(
      [
        { id: "a", state: a },
        { id: "b", state: b },
      ],
      DEMO_USER,
    );
    expect(favoriteItems(merged, DEMO_USER).map((item) => item.id)).toEqual([
      "b",
      "website",
    ]);
    a.projects.find((p) => p.id === "website")!.archived = true;
    expect(favoriteItems(a, DEMO_USER)).toEqual([]);
    expect(
      visibleState(a, "demo-amira").members[0].favoriteProjectAt,
    ).toBeUndefined();
  });
});
