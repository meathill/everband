import { env } from "cloudflare:workers";
import { chooseEmailSender } from "@everband/core";
import type { Database } from "@everband/db";
import type { EmailSender } from "@everband/integrations/email";
import { getEmailMode } from "./context.ts";

// EMAIL_MODE=cloudflare（生产）走 Email Service binding 真实发送；
// dev（本地，.dev.vars）落 dev_outbox；mock（CI/测试）记录调用。
export function getEmailSender(db: Database): EmailSender {
  return chooseEmailSender(
    db,
    getEmailMode(),
    env.EMAIL
      ? {
          binding: env.EMAIL,
          fromEmail: env.EMAIL_FROM_ADDRESS ?? "no-reply@meathill.com",
          fromName: env.EMAIL_FROM_NAME ?? "Everband",
        }
      : undefined,
  );
}
