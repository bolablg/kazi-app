import type { Plugin } from "vite";

/** Reload once per edit batch instead of mixing Fast Refresh with a later reload. */
export function developmentReload(enabled: boolean): Plugin {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return {
    name: "kazi-development-reload",
    apply: "serve",
    enforce: "pre",
    configureServer(server) {
      server.httpServer?.once("close", () => clearTimeout(timer));
    },
    handleHotUpdate({ file, server }) {
      if (!enabled || !/\/(src|shared|convex)\/.*\.(tsx?|css)$/.test(file))
        return;
      clearTimeout(timer);
      timer = setTimeout(
        () => server.ws.send({ type: "full-reload", path: "*" }),
        200,
      );
      // Vite must not also send React updates while the full reload is pending.
      return [];
    },
  };
}
