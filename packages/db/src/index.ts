import type { D1Database } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof createDb>;

// 每请求创建，不得在模块初始化阶段缓存（PRD §8.3）
export function createDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export * as schema from "./schema/index.ts";
