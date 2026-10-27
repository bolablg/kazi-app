import { describe, expect, it, vi } from "vitest";
import { createServiceActivationProxy } from "../server/service-activation-proxy";
const backend = "https://fixed-deployment.convex.site/mcp";
const summary = {
  version: 1,
  serviceId: "kazi",
  environment: "production",
  activation: { activatedAt: null, firstObservedAt: 123 },
};
const request = (suffix = "", method = "GET") =>
  new Request(
    "https://kazi.iyanju.com/api/account/service-activation" + suffix,
    {
      method,
      headers: {
        Authorization: "Bearer synthetic.payload.signature",
        Cookie: "private=1",
        Origin: "https://attacker.example",
        "X-Forwarded-Host": "attacker.example",
      },
    },
  );
describe("canonical Kazi activation proxy", () => {
  it("uses the selected backend only and forwards only bearer and JSON accept", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(summary, {
        headers: {
          "Set-Cookie": "must-not-pass=1",
          "Cache-Control": "public",
        },
      }),
    );
    const result = await createServiceActivationProxy(
      backend,
      "production",
      upstream,
    )(request());
    expect(upstream.mock.calls[0][0]).toBe(
      "https://fixed-deployment.convex.site/account/service-activation",
    );
    expect(upstream.mock.calls[0][1]).toMatchObject({
      method: "GET",
      credentials: "omit",
      redirect: "manual",
      cache: "no-store",
    });
    expect(
      Object.fromEntries(new Headers(upstream.mock.calls[0][1]!.headers)),
    ).toEqual({
      accept: "application/json",
      authorization: "Bearer synthetic.payload.signature",
    });
    expect(await result.json()).toEqual(summary);
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result.headers.has("Set-Cookie")).toBe(false);
  });
  it("never forwards selectors, methods or missing credentials", async () => {
    const upstream = vi.fn<typeof fetch>();
    const proxy = createServiceActivationProxy(backend, "production", upstream);
    expect(
      (await proxy(request("?target=https://attacker.example"))).status,
    ).toBe(400);
    expect((await proxy(request("", "POST"))).status).toBe(405);
    expect(
      (
        await proxy(
          new Request("https://kazi.iyanju.com/api/account/service-activation"),
        )
      ).status,
    ).toBe(401);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([401, 403, 307, 500])(
    "does not follow redirects or expose upstream details: %i",
    async (status) => {
      const upstream = vi.fn<typeof fetch>().mockResolvedValue(
        new Response("private backend detail", {
          status,
          headers: { Location: "https://attacker.example" },
        }),
      );
      const result = await createServiceActivationProxy(
        backend,
        "production",
        upstream,
      )(request());
      expect(result.status).toBe([401, 403].includes(status) ? status : 503);
      expect(await result.text()).not.toContain("private backend");
      expect(result.headers.has("Location")).toBe(false);
      expect(upstream).toHaveBeenCalledOnce();
    },
  );
  it.each([
    { ...summary, environment: "development" },
    { ...summary, serviceId: "wlan" },
    { ...summary, secret: "never expose" },
    { ...summary, activation: { activatedAt: null, firstObservedAt: -1 } },
  ])("rejects unexpected service summary schemas", async (value) => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json(value));
    expect(
      (
        await createServiceActivationProxy(
          backend,
          "production",
          upstream,
        )(request())
      ).status,
    ).toBe(503);
  });
  it("bounds response data and rejects arbitrary target origins", async () => {
    const upstream = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ padding: "x".repeat(5000) }));
    expect(
      (
        await createServiceActivationProxy(
          backend,
          "production",
          upstream,
        )(request())
      ).status,
    ).toBe(503);
    for (const target of [
      "https://attacker.example/mcp",
      backend + "?target=x",
      "https://user@fixed-deployment.convex.site/mcp",
      "http://localhost:3211/mcp",
    ])
      expect(() =>
        createServiceActivationProxy(target, "production", upstream),
      ).toThrow();
  });
});
