import { Readable } from "node:stream";
import type { Plugin } from "vite";
import { createMcpProxy } from "../server/mcp-proxy";

export function developmentMcpTarget(env: Record<string, string>) {
  if (!env.VITE_CONVEX_URL) return undefined;
  const backend = new URL(env.VITE_CONVEX_URL);
  if (backend.username || backend.password || backend.search || backend.hash)
    throw new Error("Invalid development Convex URL.");
  if (
    backend.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(backend.hostname)
  ) {
    backend.port = "3211";
  } else {
    // A cloud development connection must explicitly identify this same dev
    // deployment. A copied production or preview URL fails closed here.
    const name = /^dev:([a-z0-9-]+)$/.exec(env.CONVEX_DEPLOYMENT ?? "")?.[1];
    if (
      !name ||
      backend.protocol !== "https:" ||
      backend.port ||
      backend.pathname !== "/" ||
      backend.hostname !== `${name}.convex.cloud`
    )
      throw new Error(
        "Development MCP requires VITE_CONVEX_URL to match CONVEX_DEPLOYMENT=dev:<deployment>.",
      );
    backend.hostname = `${name}.convex.site`;
  }
  return new URL("/mcp", backend).href;
}

/** Adapt Vite's Node HTTP server to the same streaming Web handler as Vercel. */
export function developmentMcpPlugin(
  enabled: boolean,
  env: Record<string, string>,
): Plugin {
  const target = enabled ? developmentMcpTarget(env) : undefined;
  return {
    name: "kazi-development-mcp",
    apply: "serve",
    configureServer(server) {
      // Demo/e2e never acquire a real backend, even with populated local files.
      const proxy = target ? createMcpProxy(target) : undefined;
      server.middlewares.use(async (incoming, outgoing, next) => {
        if (incoming.url?.split("?", 1)[0] !== "/mcp") return next();
        if (!proxy) {
          outgoing.writeHead(503, { "Cache-Control": "private, no-store" });
          outgoing.end("MCP is unavailable in this local environment");
          return;
        }
        const controller = new AbortController();
        const abort = () => controller.abort();
        incoming.once("aborted", abort);
        outgoing.once("close", abort);
        try {
          const headers = new Headers();
          for (const [name, value] of Object.entries(incoming.headers))
            if (value !== undefined)
              headers.set(
                name,
                Array.isArray(value) ? value.join(", ") : value,
              );
          const method = incoming.method ?? "GET";
          const init: RequestInit & { duplex?: "half" } = {
            method,
            headers,
            signal: controller.signal,
          };
          if (!["GET", "HEAD"].includes(method)) {
            init.body = Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
            init.duplex = "half";
          }
          const response = await proxy(
            new Request("http://127.0.0.1/mcp", init),
          );
          if (outgoing.destroyed) {
            await response.body?.cancel();
            return;
          }
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
          );
          if (response.body) {
            const stream = Readable.fromWeb(
              response.body as import("node:stream/web").ReadableStream<Uint8Array>,
            );
            outgoing.once("close", () => stream.destroy());
            stream.once("error", () => outgoing.destroy());
            stream.pipe(outgoing);
          } else outgoing.end();
        } catch {
          if (!outgoing.headersSent)
            outgoing.writeHead(502, { "Cache-Control": "private, no-store" });
          outgoing.end("MCP service unavailable");
        }
      });
    },
  };
}
