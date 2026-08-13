import { env } from "cloudflare:workers";
import { createDb, type Database } from "@everband/db";

// 每请求调用，不在模块级缓存实例（PRD §8.3）。
// 生产启用 D1 read replication：用 Sessions API（"first-primary" 保证首个查询走主库，
// 请求内顺序一致，后续查询可路由到就近副本）；本地 dev/miniflare 不支持 withSession，回退普通绑定。
export function getDb(): Database {
  const d1 = import.meta.env.DEV ? env.DB : env.DB.withSession("first-primary");
  return createDb(d1);
}

export function getEmailMode(): "dev" | "mock" | "cloudflare" {
  const mode = env.EMAIL_MODE;
  if (mode === "cloudflare" || mode === "mock") {
    return mode;
  }
  return "dev";
}
