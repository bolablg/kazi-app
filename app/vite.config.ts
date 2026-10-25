import { localAuthPlugin } from "./scripts/local-auth.ts";
import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
function developmentReload(enabled: boolean): Plugin {
  return {
    name: "kazi-development-reload",
    apply: "serve",
    configureServer(server) {
      if (!enabled) return;
      let timer: ReturnType<typeof setTimeout> | undefined;
      const changed = (file: string) => {
        if (
          !/\/(src|shared|convex)\//.test(file) ||
          !/\.(tsx?|css)$/.test(file)
        )
          return;
        clearTimeout(timer);
        timer = setTimeout(() => server.ws.send({ type: "full-reload" }), 900);
      };
      server.watcher.on("change", changed);
      server.httpServer?.on("close", () => {
        clearTimeout(timer);
        server.watcher.off("change", changed);
      });
    },
  };
}
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    developmentReload(mode === "development"),
    localAuthPlugin(
      mode === "development" &&
        loadEnv(mode, process.cwd()).VITE_KAZI_LOCAL_DEV === "true",
    ),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "brand/*.svg",
        "momentum-*.svg",
        "momentum-*.png",
        "favicon.ico",
      ],
      manifest: {
        name: "Kazi — Tasks & projects",
        short_name: "Kazi",
        description: "Tasks, projects, and work schedules.",
        theme_color: "#ff8a32",
        background_color: "#ffffff",
        display: "standalone",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/momentum-192.png", sizes: "192x192", type: "image/png" },
          {
            src: "/momentum-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/momentum-maskable.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 950 },
  server: { port: 5173, strictPort: true },
}));
