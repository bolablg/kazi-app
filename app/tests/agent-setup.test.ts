import { expect, it } from "vitest";
import {
  agentSetupInstructions,
  mcpClientConfiguration,
} from "../shared/agentSetup";

const endpoint = "https://kazi.iyanju.com/mcp";
const applicationUrl = "https://kazi.example.test/";
it("provides a usable setup guide without inventing a missing credential", () => {
  const guide = agentSetupInstructions({ endpoint, applicationUrl });
  expect(guide).toContain(endpoint);
  expect(guide).toContain("https://kazi.example.test/connections?tab=mcp");
  expect(guide).toContain("YOUR_KAZI_TOKEN");
  expect(guide).toContain("ask for it instead of inventing one");
  expect(guide).toContain("without replacing other MCP servers");
  expect(guide).toContain("Clerk, Convex, Google, or other service-admin keys");
});
it("includes only the issued key and permissions in the explicit copy pack", () => {
  const credential = {
    token: "kazi_synthetic_test_key",
    label: "My client",
    scopes: ["read", "tasks:write"],
  };
  const guide = agentSetupInstructions({
    endpoint,
    applicationUrl,
    credential,
  });
  expect(guide).toContain("Bearer kazi_synthetic_test_key");
  expect(guide).toContain("tasks:write: Create, edit");
  expect(guide).not.toContain("credentials:manage:");
  expect(guide).toContain("read-only request");
  expect(guide).toContain("Do not create, edit, schedule, or delete work");
  expect(
    JSON.parse(mcpClientConfiguration(endpoint, credential.token)).mcpServers
      .kazi,
  ).toEqual({
    type: "http",
    url: endpoint,
    headers: { Authorization: "Bearer kazi_synthetic_test_key" },
  });
});
it("does not suggest a read request when the credential has no read scope", () => {
  const guide = agentSetupInstructions({
    endpoint,
    applicationUrl,
    credential: {
      token: "synthetic",
      label: "Writer",
      scopes: ["tasks:write"],
    },
  });
  expect(guide).toContain("initialization and tool discovery only");
  expect(guide).not.toContain("Verify access with a read-only request");
});
