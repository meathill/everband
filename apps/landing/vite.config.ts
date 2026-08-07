import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" } }),
    tailwindcss(),
    // Landing 以静态内容为主：全量 prerender，产物即纯静态 assets；
    // 仅 Contact 表单（M9）走 Worker server route。
    tanstackStart({
      prerender: {
        enabled: true,
        crawlLinks: true,
      },
    }),
    react(),
  ],
});
