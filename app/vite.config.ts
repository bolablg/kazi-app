import { localAuthPlugin } from "./scripts/local-auth.ts";
import { developmentMcpPlugin } from "./scripts/mcp-development.ts";
import { developmentServiceActivationPlugin } from "./scripts/service-activation-development.ts";
import { developmentReload } from "./scripts/development-reload.ts";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";
export default defineConfig(({ mode }) => ({
  // Browser fixtures must remain local even when `convex dev` updates .env.local.
  define:
    mode === "e2e"
      ? {
          "import.meta.env.VITE_CLERK_PUBLISHABLE_KEY": JSON.stringify(""),
          "import.meta.env.VITE_CONVEX_URL": JSON.stringify(""),
          "import.meta.env.VITE_KAZI_LOCAL_DEV": JSON.stringify("false"),
          "import.meta.env.VITE_KAZI_MCP_URL": JSON.stringify(""),
          "import.meta.env.VITE_KAZI_IDENTITY_MODE": JSON.stringify("legacy"),
          "import.meta.env.VITE_IYANJU_CLERK_PUBLISHABLE_KEY":
            JSON.stringify(""),
          "import.meta.env.VITE_IYANJU_ACCOUNT_ORIGIN": JSON.stringify(""),
        }
      : mode === "development"
        ? { "import.meta.env.VITE_KAZI_MCP_URL": JSON.stringify("") }
        : undefined,
  plugins: [
    developmentReload(mode === "development"),
    react(),
    developmentMcpPlugin(
      mode === "development",
      loadEnv(mode, process.cwd(), ""),
    ),
    developmentServiceActivationPlugin(
      mode === "development",
      loadEnv(mode, process.cwd(), ""),
    ),
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
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/mcp(?:[/?]|$)/,
          /^\/agenda(?:\/|$)/,
          /^\/google\/callback(?:[/?]|$)/,
        ],
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4000000,
      },
    }),
  ],
  build: { chunkSizeWarningLimit: 950 },
  server: { port: 5173, strictPort: true },
}));
