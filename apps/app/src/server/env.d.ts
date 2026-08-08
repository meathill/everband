// cloudflare:workers 的 env 类型：手工声明绑定面。
// 不引入 @cloudflare/workers-types 全局声明（与 DOM lib 冲突），
// 需要的类型用命名 import。绑定变更时同步更新这里与 wrangler.jsonc。
declare module "cloudflare:workers" {
  import type { D1Database, Queue, R2Bucket } from "@cloudflare/workers-types";

  export const env: {
    DB: D1Database;
    FILES: R2Bucket;
    IMPORT_QUEUE: Queue<{ importJobId: string; r2Key: string }>;
    EMAIL_QUEUE: Queue<{ sendId: string }>;
    // dev（本地 .dev.vars）| mock（CI）| cloudflare（生产真实发送）
    EMAIL_MODE?: string;
    // Email Service send_email binding（结构化最小面，见 core/email-sender.ts）
    EMAIL?: {
      send(message: {
        to: string;
        from: { email: string; name?: string };
        subject: string;
        text: string;
        html?: string;
      }): Promise<unknown>;
    };
    EMAIL_FROM_ADDRESS?: string;
    EMAIL_FROM_NAME?: string;
    // mock | dyqr；dyqr 模式需要 DYQR_TOKEN（Secrets Store）
    DYQR_MODE?: string;
    DYQR_TOKEN?: string;
  };
}
