import type { Plugin } from "vite";
import { developmentMcpTarget } from "./mcp-development";
import {
  createServiceActivationProxy,
  unavailableServiceActivation,
} from "../server/service-activation-proxy";
import { SERVICE_ACTIVATION_PATH } from "../shared/serviceActivation";

export function developmentServiceActivationPlugin(
  enabled: boolean,
  env: Record<string, string>,
): Plugin {
  const target = enabled ? developmentMcpTarget(env) : undefined;
  const proxy = target
    ? createServiceActivationProxy(target, "development")
    : undefined;
  return {
    name: "kazi-development-service-activation",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (incoming, outgoing, next) => {
        if (incoming.url?.split("?", 1)[0] !== SERVICE_ACTIVATION_PATH)
          return next();
        const controller = new AbortController();
        incoming.once("aborted", () => controller.abort());
        outgoing.once("close", () => controller.abort());
        try {
          const request = new Request("http://127.0.0.1" + incoming.url, {
            method: incoming.method ?? "GET",
            signal: controller.signal,
            headers: incoming.headers.authorization
              ? { Authorization: incoming.headers.authorization }
              : {},
          });
          const response = proxy
            ? await proxy(request)
            : unavailableServiceActivation();
          outgoing.writeHead(
            response.status,
            Object.fromEntries(response.headers),
          );
          outgoing.end(Buffer.from(await response.arrayBuffer()));
        } catch {
          if (!outgoing.headersSent)
            outgoing.writeHead(503, { "Cache-Control": "private, no-store" });
          outgoing.end();
        }
      });
    },
  };
}
