const methods = new Set(["POST", "GET", "DELETE"]);
const requestHeaders = new Set([
  "accept",
  "authorization",
  "content-type",
  "last-event-id",
  "origin",
]);
const hopHeaders = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
];

function privateHeaders(source?: Headers) {
  const headers = new Headers(source);
  // A connection can nominate additional hop-by-hop headers.
  for (const name of headers.get("connection")?.split(",") ?? [])
    if (name.trim()) headers.delete(name.trim());
  for (const name of hopHeaders) headers.delete(name);
  for (const name of ["set-cookie", "content-length", "content-encoding"])
    headers.delete(name);
  headers.set("Cache-Control", "private, no-store");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Vercel-CDN-Cache-Control", "no-store");
  headers.set("X-Content-Type-Options", "nosniff");
  return headers;
}

function failure(status: number, message: string) {
  return new Response(message, {
    status,
    headers: privateHeaders(new Headers({ "Content-Type": "text/plain" })),
  });
}

/** Only a trusted deployment manifest (or the loopback dev server) sets target. */
export function createMcpProxy(
  target: string,
  fetchUpstream: typeof fetch = fetch,
) {
  const upstream = new URL(target);
  if (
    upstream.username ||
    upstream.password ||
    upstream.pathname !== "/mcp" ||
    upstream.search ||
    upstream.hash ||
    !(
      (upstream.protocol === "https:" &&
        !upstream.port &&
        /^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.site$/.test(
          upstream.hostname,
        )) ||
      (upstream.protocol === "http:" &&
        ["127.0.0.1", "localhost", "[::1]"].includes(upstream.hostname))
    )
  )
    throw new Error("MCP requires a fixed Convex HTTP endpoint.");

  return async function proxy(request: Request): Promise<Response> {
    if (!methods.has(request.method)) {
      const response = failure(405, "Method not allowed");
      response.headers.set("Allow", "POST, GET, DELETE");
      return response;
    }
    const headers = new Headers();
    for (const [name, value] of request.headers)
      if (requestHeaders.has(name) || name.startsWith("mcp-"))
        headers.set(name, value);
    // fetch returns decoded bytes. Avoid compressed event-stream buffering and
    // never copy the client's cookies, host, forwarding, or platform headers.
    headers.set("Accept-Encoding", "identity");
    const init: RequestInit & { duplex?: "half" } = {
      method: request.method,
      headers,
      signal: request.signal,
      cache: "no-store",
      redirect: "manual",
    };
    if (request.body) {
      init.body = request.body;
      init.duplex = "half";
    }
    try {
      // The incoming URL, query, and headers can never select another target.
      const response = await fetchUpstream(upstream.href, init);
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel();
        return failure(502, "MCP upstream returned an unexpected redirect");
      }
      // Passing the stream through also propagates reader cancellation. Do not
      // parse JSON or buffer SSE: the backend owns protocol and auth errors.
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: privateHeaders(response.headers),
      });
    } catch {
      // Do not log request headers, credentials, backend URLs, or response data.
      return failure(
        request.signal.aborted ? 499 : 502,
        request.signal.aborted
          ? "MCP request cancelled"
          : "MCP service unavailable",
      );
    }
  };
}

export function unavailableMcp() {
  return failure(503, "MCP deployment is not configured");
}
