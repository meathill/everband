// 邮件发送器选择：app 与 tasks 共用。
// dev/preview 落 dev_outbox（/dev/outbox 查看）；mock 供测试断言；
// cloudflare 生产模式（env.EMAIL.send()）在发信域名验证后接入。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  type EmailSender,
  MockEmailSender,
  type OutgoingEmail,
  type SendResult,
} from "@everband/integrations/email";

export class DevEmailSender implements EmailSender {
  constructor(private readonly db: Database) {}

  async send(message: OutgoingEmail): Promise<SendResult> {
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

export function chooseEmailSender(db: Database, mode: string | undefined): EmailSender {
  if (mode === "mock") {
    return new MockEmailSender();
  }
  // cloudflare 模式接入前一律走 dev outbox
  return new DevEmailSender(db);
}
