import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  type EmailSender,
  MockEmailSender,
  type OutgoingEmail,
} from "@everband/integrations/email";
import { getEmailMode } from "./context.ts";

// dev/preview：邮件落库 dev_outbox，由 /dev/outbox 查看（e2e 也从这里取链接）
class DevEmailSender implements EmailSender {
  constructor(private readonly db: Database) {}

  async send(message: OutgoingEmail): Promise<{ ok: true } | { ok: false; error: string }> {
    await this.db.insert(schema.devOutbox).values({
      id: generateId(ID_PREFIXES.emailSend),
      toEmail: message.to,
      subject: message.subject,
      body: message.text,
      kind: message.kind,
      createdAt: Date.now(),
    });
    return { ok: true };
  }
}

export function getEmailSender(db: Database): EmailSender {
  const mode = getEmailMode();
  if (mode === "mock") {
    return new MockEmailSender();
  }
  // cloudflare 模式在 M7 接入 env.EMAIL.send()；当前一律走 dev outbox
  return new DevEmailSender(db);
}
