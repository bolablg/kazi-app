import { describe, expect, it } from "vitest";
import { fixtureState, seedState, DEMO_USER } from "../shared/fixtures";
import { migrateDemoIds } from "../shared/demoIds";
import {
  stableId,
  transactionId,
  isOpaqueId,
  taskPath,
  projectPath,
  planPath,
} from "../shared/ids";
import { resourceRoute } from "../shared/resourceRoutes";
import { visibleState } from "../shared/domain";
const now = Date.parse("2026-10-26T13:00:00Z");
describe("opaque resource identity", () => {
  it("uses namespaced deterministic hashes and random transactional identifiers", () => {
    expect(stableId("task", "one")).toMatch(/^[a-f0-9]{32}$/);
    expect(stableId("task", "one")).toBe(stableId("task", "one"));
    expect(stableId("task", "one")).not.toBe(stableId("project", "one"));
    const ids = Array.from({ length: 1000 }, transactionId);
    expect(new Set(ids).size).toBe(1000);
    expect(ids.every(isOpaqueId)).toBe(true);
  });
  it("migrates the entire demo reference graph once, preserving names, edits, and history", () => {
    const before = fixtureState(now);
    before.tasks[0].title = "website";
    before.tasks[0].description = "t1: website";
    before.tasks[1].dependencies = ["t1"];
    before.tasks[1].parentId = "t1";
    before.members[0].favoriteProjectIds = ["website"];
    const after = migrateDemoIds(before),
      aliases = after.legacyResourceIds!;
    expect(after.tasks[0].title).toBe("website");
    expect(after.tasks[0].description).toBe("t1: website");
    expect(before.tasks[0].id).toBe("t1");
    expect(after.tasks[1].dependencies).toEqual([aliases.tasks.t1]);
    expect(after.tasks[1].parentId).toBe(aliases.tasks.t1);
    expect(after.members[0].favoriteProjectIds).toEqual([
      aliases.projects.website,
    ]);
    expect(after.projects.every((p) => isOpaqueId(p.id))).toBe(true);
    expect(after.tasks.every((t) => isOpaqueId(t.id))).toBe(true);
    expect(after.members[0].id).toBe(DEMO_USER);
    for (const p of after.proposals) {
      expect(
        Object.keys(p.taskRevisions).every((id) =>
          after.tasks.some((t) => t.id === id),
        ),
      ).toBe(true);
      for (const a of p.alternatives)
        for (const session of a.sessions) {
          expect(isOpaqueId(session.id)).toBe(true);
          expect(after.tasks.some((t) => t.id === session.taskId)).toBe(true);
        }
      expect(
        p.inputs?.tasks.every(
          (t) => isOpaqueId(t.id) && isOpaqueId(t.projectId),
        ),
      ).toBe(true);
    }
    expect(
      after.versions[0].taskSnapshot.every(
        (t) => t.projectId === aliases.projects.website,
      ),
    ).toBe(true);
    expect(after.iterations[0].versionId).toBe(after.versions[0].id);
    expect(
      after.reportEvents?.every((e) =>
        after.tasks.some((t) => t.id === e.taskId),
      ),
    ).toBe(true);
    expect(migrateDemoIds(after)).toEqual(after);
  });
  it("fresh demos use the same opaque resource IDs as upgraded saved demos", () => {
    expect(seedState(now)).toEqual(migrateDemoIds(fixtureState(now)));
    const a = fixtureState(now),
      b = fixtureState(now);
    b.workspace.id = "another-demo";
    expect(migrateDemoIds(a).tasks[0].id).not.toBe(
      migrateDemoIds(b).tasks[0].id,
    );
  });
  it("resolves old bookmarks and task links without relying on names or project membership for identity", () => {
    const s = seedState(now),
      project = s.projects.find((p) => p.title === "Website launch")!,
      task = s.tasks[0];
    expect(resourceRoute(s, "/projects/website").redirect).toBe(
      projectPath(project.id),
    );
    expect(resourceRoute(s, "/task/t1").redirect).toBe(taskPath(task));
    const stable = taskPath(task);
    task.title = "Renamed";
    project.title = "New project title";
    expect(taskPath(task)).toBe(stable);
    task.projectId = s.projects[2].id;
    expect(resourceRoute(s, stable).redirect).toBe(taskPath(task));
    expect(resourceRoute(s, "/project/not-a-real-id").project).toBeUndefined();
    expect(
      resourceRoute(s, "/project/Website%20launch").project,
    ).toBeUndefined();
    const p = s.proposals[0];
    expect(
      resourceRoute(s, "/plans", `?proposal=${p.id}&revision=${p.revision}`)
        .redirect,
    ).toBe(planPath(p.id, p.revision));
    expect(
      resourceRoute(s, `/plan/${p.id}`, "?revision=999").staleRevision,
    ).toBe(true);
  });
  it("filters legacy aliases with the same visibility rules as their resources", () => {
    const s = visibleState(seedState(now), "demo-amira");
    expect(s.legacyResourceIds!.projects).not.toHaveProperty("learning");
    expect(s.legacyResourceIds!.tasks).not.toHaveProperty("t4");
    expect(resourceRoute(s, "/task/t4").task).toBeUndefined();
  });
});
