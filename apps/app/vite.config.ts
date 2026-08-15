import { execSync } from "node:child_process";
import { fileURLToPath, URL } from "node:url";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// 反馈提交时的版本标识：dev 显示 "dev"，构建时取 git 短 hash（可对应到发布点）
function appVersion(): string {
  if (process.env.NODE_ENV !== "production") {
    return "dev";
  }
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion()),
  },
  server: {
    port: 3000,
    // miniflare 的 D1/缓存状态在 .wrangler/state 下，测试写入会触发 watch 风暴、
    // 无效化 transform 缓存，导致长跑 e2e 越跑越慢（页面模块请求 10s+）
    watch: { ignored: ["**/.wrangler/**"] },
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
