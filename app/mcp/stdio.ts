import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
if (!process.env.KAZI_MCP_URL || !process.env.KAZI_MCP_TOKEN)
  throw new Error("Set KAZI_MCP_URL and KAZI_MCP_TOKEN from Kazi Settings.");
const client = new Client({ name: "kazi-stdio-bridge", version: "0.1.0" });
await client.connect(
  new StreamableHTTPClientTransport(new URL(process.env.KAZI_MCP_URL), {
    requestInit: {
      headers: { Authorization: "Bearer " + process.env.KAZI_MCP_TOKEN },
    },
  }),
);
const server = new Server(
  { name: "kazi", version: "0.1.0" },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, () => client.listTools());
server.setRequestHandler(CallToolRequestSchema, (request) =>
  client.callTool(request.params),
);
await server.connect(new StdioServerTransport());
