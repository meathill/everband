import { defineConfig } from "drizzle-kit";

// 迁移产物输出到 apps/app/migrations，由 wrangler d1 migrations apply 执行
//（本地 --local，生产 --remote）。不使用 drizzle-kit push。
export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema/index.ts",
  out: "../../apps/app/migrations",
});
