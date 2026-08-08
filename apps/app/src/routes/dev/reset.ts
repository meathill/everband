import { schema } from "@everband/db";
import { createFileRoute } from "@tanstack/react-router";
import { getDb, getEmailMode } from "~/server/context.ts";

// dev 专用：清空 auth_tokens（释放限流窗口计数），供 e2e 启动时调用。
// 生产模式（EMAIL_MODE != dev）直接 404。
export const Route = createFileRoute("/dev/reset")({
  server: {
    handlers: {
      GET: async () => {
        if (getEmailMode() !== "dev") {
          return new Response("Not found", { status: 404 });
        }
        const db = getDb();
        await db.delete(schema.authTokens);
        return Response.json({ ok: true });
      },
    },
  },
});
