const headers = {
  "Cache-Control": "private, no-store",
  "CDN-Cache-Control": "no-store",
  "Vercel-CDN-Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};

export function unavailableCalendar(status = 503) {
  return new Response("Calendar service unavailable. Please try again later.", {
    status,
    headers: { ...headers, "Content-Type": "text/plain; charset=utf-8" },
  });
}

/** Both calendar routes use the backend chosen by this build, never a client URL. */
export function createCalendarProxy(
  mcpTarget: string,
  applicationUrl: string,
  fetchUpstream: typeof fetch = fetch,
) {
  const backend = new URL(mcpTarget);
  if (
    backend.protocol !== "https:" ||
    backend.port ||
    backend.username ||
    backend.password ||
    !/^[a-z0-9-]+(?:\.[a-z0-9-]+)?\.convex\.site$/.test(backend.hostname) ||
    backend.pathname !== "/mcp" ||
    backend.search ||
    backend.hash
  )
    throw new Error("Calendar requires a fixed Convex HTTP endpoint.");
  const appOrigin = new URL(applicationUrl).origin;

  return async (request: Request): Promise<Response> => {
    const incoming = new URL(request.url);
    // Accept the original route and Vercel's rewritten API route.
    const path = incoming.pathname.replace(/^\/api\//, "/");
    const feed = /^\/agenda\/[a-f0-9]{64}\.ics$/.test(path);
    const callback = path === "/google/callback";
    if (!feed && !callback)
      return new Response("Calendar link unavailable.", {
        status: 404,
        headers,
      });
    if (request.method !== "GET" && !(feed && request.method === "HEAD"))
      return new Response("Method not allowed.", {
        status: 405,
        headers: { ...headers, Allow: feed ? "GET, HEAD" : "GET" },
      });
    const upstream = new URL(path, backend.origin);
    if (callback)
      for (const key of ["code", "state", "error"])
        if (incoming.searchParams.has(key))
          upstream.searchParams.set(key, incoming.searchParams.get(key)!);
    try {
      const response = await fetchUpstream(upstream.href, {
        method: "GET",
        headers: { "Accept-Encoding": "identity" },
        redirect: "manual",
        cache: "no-store",
        signal: request.signal,
      });
      if (callback) {
        await response.body?.cancel();
        const location = new URL(
          response.headers.get("Location") ?? "",
          backend.origin,
        );
        if (
          response.status !== 303 ||
          location.origin !== appOrigin ||
          location.pathname !== "/connections" ||
          !["connected", "error"].includes(
            location.searchParams.get("calendar") ?? "",
          )
        )
          return unavailableCalendar(502);
        // Reconstruct the return link; never relay provider codes or other data.
        return new Response(null, {
          status: 303,
          headers: {
            ...headers,
            Location: `${appOrigin}/connections?tab=calendar&calendar=${location.searchParams.get("calendar")}`,
          },
        });
      }
      if (response.status !== 200 && response.status !== 404) {
        await response.body?.cancel();
        return unavailableCalendar(502);
      }
      if (request.method === "HEAD") await response.body?.cancel();
      return new Response(request.method === "HEAD" ? null : response.body, {
        status: response.status,
        headers: {
          ...headers,
          "Content-Type":
            response.status === 200
              ? "text/calendar; charset=utf-8"
              : "text/plain; charset=utf-8",
          ...(response.status === 200
            ? { "Content-Disposition": 'inline; filename="kazi-agenda.ics"' }
            : {}),
        },
      });
    } catch {
      return unavailableCalendar(502);
    }
  };
}
