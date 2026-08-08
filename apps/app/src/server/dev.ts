import { schema } from "@everband/db";
import { createServerFn } from "@tanstack/react-start";
import { desc } from "drizzle-orm";
import { getDb, getEmailMode } from "./context.ts";

// 仅 dev 模式可用：查看 dev_outbox（e2e 用它取 magic link）。
// 生产模式返回 null（不抛错，避免 SSR 把状态码记为 500）。
export const listDevOutbox = createServerFn({ method: "GET" }).handler(async () => {
  if (getEmailMode() !== "dev") {
    return null;
  }
  const db = getDb();
  return db.select().from(schema.devOutbox).orderBy(desc(schema.devOutbox.createdAt)).limit(50);
});
