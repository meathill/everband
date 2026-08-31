import { markEmailOpenedCore } from "@everband/core";
import { createFileRoute } from "@tanstack/react-router";
import { getDb } from "~/server/context.ts";

// 1x1 透明 GIF（43 字节，base64: R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7）
const GIF_1X1 = Uint8Array.from(
  atob("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"),
  (c) => c.charCodeAt(0),
);

function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  // 简单哈希，避免存明文 IP；用 DJB2 变体即可（非安全场景，仅去重/审计）
  let hash = 5381;
  for (let i = 0; i < ip.length; i++) hash = (hash * 33) ^ ip.charCodeAt(i);
  return (hash >>> 0).toString(16);
}

export const Route = createFileRoute("/api/track/open/$token")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const token = params.token;
        try {
          const db = getDb();
          const userAgent = request.headers.get("user-agent");
          const ip =
            request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for");
          await markEmailOpenedCore(db, token, {
            userAgent,
            ipHash: hashIp(ip),
            now: Date.now(),
          });
        } catch {
          // 像素追踪失败不影响返回图片
        }
        return new Response(GIF_1X1 as unknown as BodyInit, {
          headers: {
            "Content-Type": "image/gif",
            "Content-Length": String(GIF_1X1.length),
            "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
            Pragma: "no-cache",
            Expires: "0",
          },
        });
      },
    },
  },
});
