// @vitest-environment edge-runtime
import { expect, it } from "vitest";
import { convexTest } from "convex-test";
import schema from "../convex/schema";
import { api, internal } from "../convex/_generated/api";
import { sha256 } from "../convex/crypto";

const modules = import.meta.glob("../convex/**/*.ts");
const identity = {
  subject: "user_transport_fixture",
  name: "Transport Fixture",
  email: "transport@example.test",
  emailVerified: true,
};
const initialize = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "native-transport-fixture", version: "1" },
  },
};

async function protocolMessage(response: Response) {
  if (response.headers.get("Content-Type")?.startsWith("text/event-stream")) {
    const frames = (await response.text()).replace(/\r\n/g, "\n").split("\n\n");
    const messages = frames.flatMap((frame) => {
      const data = frame
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trimStart())
        .join("\n");
      return data ? [JSON.parse(data)] : [];
    });
    expect(messages.length).toBeGreaterThan(0);
    return messages.find((message) => message.id !== undefined);
  }
  return response.json();
}

it.each([
  ["application/json, text/event-stream", "application/json"],
  ["text/event-stream, application/json", "text/event-stream"],
  ["application/json;q=0.5, text/event-stream;q=0.9", "text/event-stream"],
  ["text/event-stream;q=0.5, application/json;q=0.9", "application/json"],
])(
  "authenticates MCP initialize and tool calls with Accept %s",
  async (accept, contentType) => {
    const t = convexTest(schema, modules);
    const actor = t.withIdentity(identity);
    await actor.mutation(api.commands.bootstrap, {});
    await t.mutation(internal.tokens.save, {
      subject: identity.subject,
      hash: await sha256("synthetic_transport_credential"),
      label: "Transport credential",
      scopes: ["read"],
    });
    const headers = {
      "Content-Type": "application/json",
      Accept: accept,
      Authorization: "Bearer synthetic_transport_credential",
    };
    const initialized = await t.fetch("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify(initialize),
    });
    expect(initialized.status).toBe(200);
    expect(initialized.headers.get("Content-Type")).toContain(contentType);
    expect(await protocolMessage(initialized)).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: { serverInfo: { name: "kazi" } },
    });
    const called = await t.fetch("/mcp", {
      method: "POST",
      headers,
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "list_workspaces", arguments: {} },
      }),
    });
    expect(called.status).toBe(200);
    expect(called.headers.get("Content-Type")).toContain(contentType);
    const result = await protocolMessage(called);
    expect(result).toMatchObject({ jsonrpc: "2.0", id: 2 });
    expect(result.result.isError).not.toBe(true);
    expect(result.result.content[0].type).toBe("text");
    const tokens = await actor.query(api.tokens.list, {});
    expect(tokens[0].lastTool).toBe("list_workspaces");
    await actor.mutation(api.tokens.revoke, { id: tokens[0].id });
    expect(
      (
        await t.fetch("/mcp", {
          method: "POST",
          headers,
          body: JSON.stringify(initialize),
        })
      ).status,
    ).toBe(401);
  },
);

it.each(["application/json", "text/event-stream"])(
  "keeps SDK validation of both required media types for Accept %s",
  async (accept) => {
    const t = convexTest(schema, modules);
    await t.withIdentity(identity).mutation(api.commands.bootstrap, {});
    await t.mutation(internal.tokens.save, {
      subject: identity.subject,
      hash: await sha256("synthetic_validation_credential"),
      label: "Validation credential",
      scopes: ["read"],
    });
    const response = await t.fetch("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: accept,
        Authorization: "Bearer synthetic_validation_credential",
      },
      body: JSON.stringify(initialize),
    });
    expect(response.status).toBe(406);
  },
);
