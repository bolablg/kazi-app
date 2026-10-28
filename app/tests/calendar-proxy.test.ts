import { expect, it, vi } from "vitest";
import { createCalendarProxy } from "../server/calendar-proxy";
const backend = "https://branch-fixture.convex.site/mcp";
const origin = "https://kazi.example.test";
const path = `/agenda/${"a".repeat(64)}.ics`;

it.each([path, `/api${path}`])(
  "serves a private feed through %s without forwarding cookies or query parameters",
  async (route) => {
    const fetchUpstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("BEGIN:VCALENDAR", {
        headers: {
          "Set-Cookie": "backend=value",
          "Cache-Control": "public, max-age=3600",
        },
      }),
    );
    const response = await createCalendarProxy(
      backend,
      origin,
      fetchUpstream,
    )(
      new Request(origin + route + "?target=https://other.example", {
        headers: { Cookie: "session=private", Authorization: "Bearer private" },
      }),
    );
    expect(fetchUpstream.mock.calls[0][0]).toBe(
      "https://branch-fixture.convex.site" + path,
    );
    const init = fetchUpstream.mock.calls[0][1]!;
    expect(new Headers(init.headers).has("cookie")).toBe(false);
    expect(new Headers(init.headers).has("authorization")).toBe(false);
    expect(init.redirect).toBe("manual");
    expect(response.headers.get("Content-Type")).toContain("text/calendar");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.has("Set-Cookie")).toBe(false);
    expect(await response.text()).toBe("BEGIN:VCALENDAR");
  },
);

it.each([404, 500, 302])(
  "handles feed upstream status %s without following redirects or serving the SPA",
  async (status) => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response("Calendar link unavailable.", {
        status,
        headers: { Location: "https://other.example" },
      }),
    );
    const response = await createCalendarProxy(
      backend,
      origin,
      upstream,
    )(new Request(origin + path));
    expect(response.status).toBe(status === 404 ? 404 : 502);
    expect(response.headers.get("Content-Type")).toContain("text/plain");
    expect(response.headers.has("Location")).toBe(false);
  },
);

it("supports feed HEAD requests and rejects invalid paths and methods before contacting Convex", async () => {
  const upstream = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response("calendar"));
  const proxy = createCalendarProxy(backend, origin, upstream);
  expect(
    await (await proxy(new Request(origin + path, { method: "HEAD" }))).text(),
  ).toBe("");
  upstream.mockClear();
  expect(
    (await proxy(new Request(origin + "/agenda/not-a-token.ics"))).status,
  ).toBe(404);
  expect(
    (await proxy(new Request(origin + path, { method: "POST" }))).status,
  ).toBe(405);
  expect(upstream).not.toHaveBeenCalled();
});

it.each(["connected", "error"])(
  "proxies Google callback and returns to the calendar tab on %s",
  async (result) => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 303,
        headers: { Location: `${origin}/connections?calendar=${result}` },
      }),
    );
    const response = await createCalendarProxy(
      backend,
      origin,
      upstream,
    )(
      new Request(
        `${origin}/google/callback?code=fixture-code&state=fixture-state&target=other`,
      ),
    );
    expect(upstream.mock.calls[0][0]).toBe(
      "https://branch-fixture.convex.site/google/callback?code=fixture-code&state=fixture-state",
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("Location")).toBe(
      `${origin}/connections?tab=calendar&calendar=${result}`,
    );
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
  },
);

it("rejects an unexpected callback redirect and network failures", async () => {
  const upstream = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(null, {
      status: 303,
      headers: {
        Location: "https://other.example/connections?calendar=connected",
      },
    }),
  );
  const proxy = createCalendarProxy(backend, origin, upstream);
  expect((await proxy(new Request(origin + "/google/callback"))).status).toBe(
    502,
  );
  upstream.mockRejectedValue(new Error("private backend details"));
  const response = await proxy(new Request(origin + path));
  expect(response.status).toBe(502);
  expect(await response.text()).not.toContain("private backend details");
});

it.each([
  "https://other.example/mcp",
  "https://user@branch-fixture.convex.site/mcp",
  "https://branch-fixture.convex.site/other",
])("rejects an invalid deployment target %s", (target) => {
  expect(() => createCalendarProxy(target, origin)).toThrow("fixed Convex");
});
