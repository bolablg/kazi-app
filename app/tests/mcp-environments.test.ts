import { expect, it } from "vitest";
import { developmentMcpTarget } from "../scripts/mcp-development";
import { mcpEndpoint } from "../shared/mcpEndpoint";

it("shows the branded production URL and each preview's own endpoint", () => {
  expect(
    mcpEndpoint(
      "https://production-alias.vercel.app",
      "https://kazi.iyanju.com/mcp",
    ),
  ).toBe("https://kazi.iyanju.com/mcp");
  expect(
    mcpEndpoint("https://branch.vercel.app", "https://branch.vercel.app/mcp"),
  ).toBe("https://branch.vercel.app/mcp");
  expect(mcpEndpoint("http://127.0.0.1:5173")).toBe(
    "http://127.0.0.1:5173/mcp",
  );
});

it("routes development to its explicitly selected real dev deployment", () => {
  expect(
    developmentMcpTarget({
      VITE_CONVEX_URL: "https://dev-fixture.convex.cloud",
      CONVEX_DEPLOYMENT: "dev:dev-fixture",
    }),
  ).toBe("https://dev-fixture.convex.site/mcp");
  expect(
    developmentMcpTarget({ VITE_CONVEX_URL: "http://127.0.0.1:3210" }),
  ).toBe("http://127.0.0.1:3211/mcp");
  expect(developmentMcpTarget({})).toBeUndefined();
});

it("does not silently send development credentials to a production or preview backend", () => {
  for (const CONVEX_DEPLOYMENT of [
    "prod:dev-fixture",
    "preview:dev-fixture",
    "",
    "dev:other-fixture",
  ])
    expect(() =>
      developmentMcpTarget({
        VITE_CONVEX_URL: "https://dev-fixture.convex.cloud",
        CONVEX_DEPLOYMENT,
      }),
    ).toThrow(/Development MCP/);
});
