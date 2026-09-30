import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 3001,
  },
  resolve: {
    alias: {
      "~": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    // Landing 以静态内容为主：全量 prerender，产物即纯静态 assets；
    // 仅 Contact 表单（M9）走 Worker server route。
    // autoSubfolderIndex:false → about.html（非 about/index.html），配合
    // wrangler assets.html_handling=drop-trailing-slash，让 /about 直接 200，
    // 与 canonical/sitemap/内链的无尾斜杠约定一致（issue #7）。
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
        autoSubfolderIndex: false,
      },
    }),
    react(),
  ],
});
