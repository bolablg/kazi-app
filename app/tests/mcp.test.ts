import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createKaziServer } from "../mcp/server";
it("SDK client discovers real tools and performs Inbox capture with a request ID", async () => {
  const calls: { op: string; input: Record<string, unknown> }[] = [];
  const server = createKaziServer(async (op, input) => {
      calls.push({ op, input });
      return { id: "task-fixture", summary: "Captured in Inbox" };
    }),
    client = new Client({ name: "test-client", version: "1.0.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const tools = await client.listTools();
  expect(tools.tools.some((t) => t.name === "propose_recovery_plan")).toBe(
    true,
  );
  expect(tools.tools.some((t) => t.name === "approve_plan")).toBe(true);
  const result = await client.callTool({
    name: "create_task",
    arguments: {
      workspaceId: "workspace",
      title: "Renew passport",
      description: "",
      priority: "low",
      dependencies: [],
      labels: [],
      requestId: "capture-123",
    },
  });
  expect(result.isError).not.toBe(true);
  expect(calls[0].op).toBe("create_task");
  expect(calls[0].input.projectId).toBeUndefined();
  await client.close();
  await server.close();
});
it("MCP approval requires an exact revision and request ID; review links remain available", async () => {
  let op = "";
  const server = createKaziServer(async (operation) => {
      op = operation;
      return { url: "https://example.test/plans?proposal=p&revision=1" };
    }),
    client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const invalid = await client.callTool({
    name: "approve_plan",
    arguments: { workspaceId: "w", id: "p", revision: 1, confirmed: true },
  });
  expect(invalid.isError).toBe(true);
  expect(op).toBe("");
  await client.callTool({
    name: "get_plan_review_link",
    arguments: { workspaceId: "w", id: "p", revision: 1 },
  });
  expect(op).toBe("review");
  await client.callTool({
    name: "approve_plan",
    arguments: {
      workspaceId: "w",
      id: "p",
      revision: 1,
      requestId: "approval-request",
    },
  });
  expect(op).toBe("approve");
  await client.close();
  await server.close();
});
it("web-standard HTTP transport completes a protocol handshake without a Node server", async () => {
  const server = createKaziServer(async () => ({})),
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
  await server.connect(transport);
  const response = await transport.handleRequest(
    new Request("https://example.test/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-11-25",
          capabilities: {},
          clientInfo: { name: "fixture-client", version: "1" },
        },
      }),
    }),
  );
  expect(response.status).toBe(200);
  expect((await response.json()).result.serverInfo.name).toBe("kazi");
  await server.close();
});

it("records tool outcomes and identifies the client from protocol initialization", async () => {
  const reports: [string, string][] = [];
  const server = createKaziServer(
    async (op) => {
      if (op === "get_task") throw new Error("Task unavailable");
      return [];
    },
    async (tool, outcome) => {
      reports.push([tool, outcome]);
    },
  );
  const client = new Client({ name: "codex-test", version: "2.0" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  expect(server.server.getClientVersion()).toMatchObject({
    name: "codex-test",
    version: "2.0",
  });
  await client.callTool({ name: "list_workspaces", arguments: {} });
  const failed = await client.callTool({
    name: "get_task",
    arguments: { workspaceId: "w", id: "private" },
  });
  expect(failed.isError).toBe(true);
  expect(reports).toEqual([
    ["list_workspaces", "success"],
    ["get_task", "error"],
  ]);
  await client.close();
  await server.close();
});
it("activity recording failure cannot turn a completed tool call into an error", async () => {
  const server = createKaziServer(
    async () => ({ id: "created" }),
    async () => {
      throw new Error("Recording unavailable");
    },
  );
  const client = new Client({ name: "test", version: "1" });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  const result = await client.callTool({
    name: "list_workspaces",
    arguments: {},
  });
  expect(result.isError).not.toBe(true);
  expect(result.structuredContent).toEqual({ result: { id: "created" } });
  await client.close();
  await server.close();
});
