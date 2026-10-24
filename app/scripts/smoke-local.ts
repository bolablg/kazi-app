import { ConvexHttpClient } from "convex/browser";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { api } from "../convex/_generated/api";
import type { Id } from "../convex/_generated/dataModel";

// Restricted to the loopback development identity. No user task data is changed.
const session = (await (
  await fetch("http://127.0.0.1:5173/__kazi_local_session")
).json()) as { token: string };
const claims = JSON.parse(
  Buffer.from(session.token.split(".")[1], "base64url").toString(),
);
if (claims.sub !== "local-kazi-owner" || claims.iss !== "http://127.0.0.1:5173")
  throw new Error("Local development identity required.");
const backend = new ConvexHttpClient("http://127.0.0.1:3210");
backend.setAuth(session.token);
const workspaceId = (await backend.mutation(api.commands.bootstrap, {}))!;
const state = await backend.query(api.commands.snapshot, { workspaceId });
const privateToken = await backend.action(api.tokens.mint, {
  label: "Temporary local smoke verification",
  scopes: ["read"],
});
let feedId: string | undefined;
const client = new Client({ name: "kazi-local-verification", version: "1" });
try {
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://127.0.0.1:3211/mcp"), {
      requestInit: { headers: { Authorization: "Bearer " + privateToken } },
    }),
  );
  const tools = await client.listTools();
  const read = await client.callTool({
    name: "get_calendar",
    arguments: { workspaceId },
  });
  if (read.isError) throw new Error("Local MCP calendar read failed.");
  const link = await backend.action(api.calendar.createFeed, {
    workspaceId,
    label: "Temporary local smoke verification",
    includeDeadlines: false,
  });
  feedId = link.id;
  const response = await fetch(link.url);
  const ics = await response.text();
  if (!response.ok || !ics.startsWith("BEGIN:VCALENDAR\r\n"))
    throw new Error("Local ICS route failed.");
  await backend.mutation(api.calendar.revokeFeed, {
    id: feedId as Id<"calendarFeeds">,
  });
  if ((await fetch(link.url)).status !== 404)
    throw new Error("Revoked feed still accessible.");
  console.log(
    JSON.stringify({
      service: "local Convex",
      projects: state.projects.length,
      tasks: state.tasks.length,
      defaultProject: state.projects.find(
        (p) => p.id === state.workspace.inboxId,
      )?.title,
      agenda: state.calendars.find((c) => c.ownerId === claims.sub)?.status,
      mcpTools: tools.tools.length,
      calendarFeed: "rendered and revoked",
      taskDataChanged: false,
    }),
  );
} finally {
  await client.close();
  if (feedId)
    await backend.mutation(api.calendar.revokeFeed, {
      id: feedId as Id<"calendarFeeds">,
    });
  const tokens = await backend.query(api.tokens.list, {});
  for (const token of tokens.filter(
    (t) => t.label === "Temporary local smoke verification" && !t.revoked,
  ))
    await backend.mutation(api.tokens.revoke, { id: token.id });
}
