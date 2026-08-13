import type { D1Database, D1DatabaseSession } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "./schema/index.ts";

export type Database = ReturnType<typeof createDb>;

// 每请求创建，不得在模块初始化阶段缓存（PRD §8.3）。
// 支持传入 D1DatabaseSession（D1 Sessions API，read replication 下保证顺序一致）；
// drizzle 的 D1 driver 运行时只依赖 prepare/batch，二者签名兼容，故类型断言即可。
export function createDb(d1: D1Database | D1DatabaseSession) {
  return drizzle(d1 as D1Database, { schema });
}

export * as schema from "./schema/index.ts";
