import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
    dedupe: ["react", "react-dom"],
  },
  plugins: [
    cloudflare({
      viteEnvironment: { name: "ssr" },
      // 本地开发同时拉起 tasks worker，使 Queues 投递在 dev 环境生效
      auxiliaryWorkers: [{ configPath: "../tasks/wrangler.jsonc" }],
    }),
    tailwindcss(),
    tanstackStart(),
    react(),
  ],
});
