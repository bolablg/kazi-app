import { describe, expect, it, vi } from "vitest";
import { createMcpProxy } from "../server/mcp-proxy";

const target = "https://branch-fixture.convex.site/mcp";
const request = (method = "POST", headers?: HeadersInit) =>
  new Request("https://kazi.example/mcp?target=https://attacker.example", {
    method,
    headers: {
      Authorization: "Bearer SYNTHETIC_KAZI_TOKEN",
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json",
      "MCP-Protocol-Version": "2025-11-25",
      "MCP-Session-Id": "session-fixture",
      "Last-Event-ID": "event-fixture",
      Origin: "https://kazi.example",
      Cookie: "private-browser-cookie",
      "X-Forwarded-Host": "attacker.example",
      ...headers,
    },
    ...(method === "POST" ? { body: '{"jsonrpc":"2.0","id":1}' } : {}),
  });

describe("branded MCP proxy", () => {
  it.each(["POST", "GET", "DELETE"])(
    "forwards %s to the fixed backend with bearer and MCP headers",
    async (method) => {
      const fetchUpstream = vi.fn<typeof fetch>().mockResolvedValue(
        new Response('{"result":{}}', {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "MCP-Session-Id": "returned-session",
            "MCP-Protocol-Version": "2025-11-25",
          },
        }),
      );
      const incoming = request(method);
      const response = await createMcpProxy(target, fetchUpstream)(incoming);
      const [url, init] = fetchUpstream.mock.calls[0];
      expect(url).toBe(target);
      expect(init?.method).toBe(method);
      expect(init?.body).toBe(incoming.body ?? undefined);
      expect(init?.signal).toBe(incoming.signal);
      expect(init?.redirect).toBe("manual");
      expect(init?.cache).toBe("no-store");
      const forwarded = new Headers(init?.headers);
      expect(forwarded.get("Authorization")).toBe(
        "Bearer SYNTHETIC_KAZI_TOKEN",
      );
      expect(forwarded.get("Accept")).toBe(
        "application/json, text/event-stream",
      );
      expect(forwarded.get("MCP-Protocol-Version")).toBe("2025-11-25");
      expect(forwarded.get("MCP-Session-Id")).toBe("session-fixture");
      expect(forwarded.get("Last-Event-ID")).toBe("event-fixture");
      expect(forwarded.get("Origin")).toBe("https://kazi.example");
      expect(forwarded.has("Cookie")).toBe(false);
      expect(forwarded.has("X-Forwarded-Host")).toBe(false);
      expect(response.headers.get("MCP-Session-Id")).toBe("returned-session");
      expect(response.headers.get("MCP-Protocol-Version")).toBe("2025-11-25");
      expect(await response.text()).toBe('{"result":{}}');
    },
  );

  it.each([202, 204, 400, 401, 403, 404, 405, 429, 500])(
    "preserves backend status %i, errors and protocol headers without caching",
    async (status) => {
      const body = [204, 202].includes(status) ? null : '{"error":"fixture"}';
      const fetchUpstream = vi.fn<typeof fetch>().mockResolvedValue(
        new Response(body, {
          status,
          headers: {
            "Content-Type": "application/json",
            "WWW-Authenticate": 'Bearer realm="kazi"',
            "Retry-After": "30",
            "Cache-Control": "public, max-age=3600",
            "Set-Cookie": "must-not-cross-proxy=1",
          },
        }),
      );
      const response = await createMcpProxy(target, fetchUpstream)(request());
      expect(response.status).toBe(status);
      expect(await response.text()).toBe(body ?? "");
      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Bearer realm="kazi"',
      );
      expect(response.headers.get("Retry-After")).toBe("30");
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
      expect(response.headers.get("Vercel-CDN-Cache-Control")).toBe("no-store");
      expect(response.headers.has("Set-Cookie")).toBe(false);
    },
  );

  it("passes missing credentials through for the backend to reject", async () => {
    const fetchUpstream = vi
      .fn<typeof fetch>()
      .mockImplementation(async (_, init) => {
        expect(new Headers(init?.headers).has("Authorization")).toBe(false);
        return new Response("Unauthorized", { status: 401 });
      });
    const response = await createMcpProxy(
      target,
      fetchUpstream,
    )(new Request("https://kazi.example/mcp"));
    expect(response.status).toBe(401);
  });

  it("returns SSE before the stream finishes and propagates cancellation", async () => {
    let writer!: ReadableStreamDefaultController<Uint8Array>;
    const cancel = vi.fn();
    const upstream = new ReadableStream<Uint8Array>({
      start(controller) {
        writer = controller;
      },
      cancel,
    });
    const fetchUpstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(upstream, {
        headers: { "Content-Type": "text/event-stream" },
      }),
    );
    const response = await createMcpProxy(
      target,
      fetchUpstream,
    )(request("GET"));
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    const reader = response.body!.getReader();
    writer.enqueue(new TextEncoder().encode("event: message\ndata: first\n\n"));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "data: first",
    );
    writer.enqueue(new TextEncoder().encode("data: second\n\n"));
    expect(new TextDecoder().decode((await reader.read()).value)).toContain(
      "data: second",
    );
    await reader.cancel("client disconnected");
    expect(cancel).toHaveBeenCalledWith("client disconnected");
  });

  it("propagates the client's abort to the upstream request", async () => {
    const controller = new AbortController();
    const fetchUpstream = vi.fn<typeof fetch>().mockImplementation(
      (_, init) =>
        new Promise((_, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("aborted")),
            { once: true },
          );
        }),
    );
    const response = createMcpProxy(
      target,
      fetchUpstream,
    )(new Request("https://kazi.example/mcp", { signal: controller.signal }));
    controller.abort();
    expect((await response).status).toBe(499);
    expect(fetchUpstream.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });

  it("never follows or exposes a redirect carrying a credential to another host", async () => {
    const fetchUpstream = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 307,
        headers: { Location: "https://attacker.example/mcp" },
      }),
    );
    const response = await createMcpProxy(target, fetchUpstream)(request());
    expect(response.status).toBe(502);
    expect(response.headers.has("Location")).toBe(false);
    expect(fetchUpstream).toHaveBeenCalledOnce();
    expect(fetchUpstream.mock.calls[0][1]?.redirect).toBe("manual");
  });

  it("does not expose fetch failures or accept arbitrary proxy targets", async () => {
    const fetchUpstream = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("private backend detail"));
    const response = await createMcpProxy(target, fetchUpstream)(request());
    expect(response.status).toBe(502);
    expect(await response.text()).toBe("MCP service unavailable");
    for (const invalid of [
      "https://attacker.example/mcp",
      `${target}?next=x`,
      "https://user@branch-fixture.convex.site/mcp",
      "https://branch-fixture.convex.site/other",
    ])
      expect(() => createMcpProxy(invalid, fetchUpstream)).toThrow();
    const unsupported = await createMcpProxy(
      target,
      fetchUpstream,
    )(request("PUT"));
    expect(unsupported.status).toBe(405);
    expect(unsupported.headers.get("Allow")).toBe("POST, GET, DELETE");
    expect(fetchUpstream).toHaveBeenCalledOnce();
  });
});
