import { defineConfig } from "vitest/config";

// 根配置聚合各 package 的 node 环境纯函数测试。
// apps 的 Worker 集成测试（@cloudflare/vitest-pool-workers）在 M2 以独立
// project 形式加入。
export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts"],
    environment: "node",
  },
});
