import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
const mock = fileURLToPath(new URL("./identity-fixture.tsx", import.meta.url));
// Only this isolated test server substitutes Clerk/data. The product config never imports it.
export default defineConfig({
  cacheDir: "node_modules/.vite-account-ui-fixture",
  optimizeDeps: { entries: ["tests/fixtures/account-ui/index.html"] },
  envDir: fileURLToPath(new URL(".", import.meta.url)),
  plugins: [
    {
      name: "synthetic-account-fixture",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "@clerk/react" ||
          (source === "./data" && importer?.endsWith("/src/AccountPages.tsx"))
        )
          return mock;
      },
    },
    react(),
  ],
  server: { host: "127.0.0.1", port: 5176, strictPort: true, hmr: false },
});
