import { mutation } from "./_generated/server";
import { identity, createWorkspace, loadState, persist } from "./store";
import { seedState, DEMO_USER } from "../shared/fixtures";
export const demo = mutation({
  args: {},
  handler: async (ctx) => {
    if (process.env.ALLOW_SYNTHETIC_SEED !== "true")
      throw new Error(
        "Set ALLOW_SYNTHETIC_SEED=true on a development deployment only.",
      );
    const user = await identity(ctx);
    const workspaceId = await createWorkspace(
      ctx,
      user.subject,
      user.name ?? "You",
      user.email ?? "",
      "team",
      "Synthetic demo",
    );
    const before = await loadState(ctx, workspaceId),
      sample = seedState();
    const replace = (value: unknown): unknown => {
      if (value === DEMO_USER) return user.subject;
      if (Array.isArray(value)) return value.map(replace);
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, replace(v)]),
        );
      return value;
    };
    const after = replace(sample) as typeof sample;
    after.workspace = {
      ...before.workspace,
      inboxId: before.workspace.inboxId,
    };
    after.projects[0].id = before.workspace.inboxId;
    after.tasks.forEach((t) => {
      if (t.projectId === sample.workspace.inboxId)
        t.projectId = before.workspace.inboxId;
    });
    after.members[0].name = user.name ?? "You";
    after.members[0].email = user.email ?? "";
    after.calendars = [];
    after.busy = [];
    after.proposals = [];
    // Synthetic teammates are fixtures, not real invitations or identities.
    await persist(ctx, workspaceId, before, after);
    const profile = await ctx.db
      .query("profiles")
      .withIndex("by_subject", (q) => q.eq("subject", user.subject))
      .unique();
    if (profile)
      await ctx.db.patch(profile._id, { activeWorkspaceId: workspaceId });
    else
      await ctx.db.insert("profiles", {
        subject: user.subject,
        name: user.name ?? "Local Developer",
        email: user.email ?? "",
        activeWorkspaceId: workspaceId,
      });
    return workspaceId;
  },
});
