import { env } from "cloudflare:workers";
import { createDb, type Database } from "@everband/db";

// 每请求调用，不在模块级缓存实例（PRD §8.3）
export function getDb(): Database {
  return createDb(env.DB);
}

export function getEmailMode(): "dev" | "mock" | "cloudflare" {
  const mode = env.EMAIL_MODE;
  if (mode === "cloudflare" || mode === "mock") {
    return mode;
  }
  return "dev";
}
