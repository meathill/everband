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
      html: message.html ?? null,
      cc: message.cc ?? null,
      bcc: message.bcc ?? null,
      kind: message.kind,
      createdAt: Date.now(),
    });
    return { ok: true };
  }
}

// Cloudflare Email Service 的 send_email binding（结构化最小面，
// 避免 core 依赖 workers runtime 全局类型）
export interface SendEmailBinding {
  send(message: {
    to: string;
    from: { email: string; name?: string };
    subject: string;
    text: string;
    html?: string;
    cc?: string | string[];
    bcc?: string | string[];
  }): Promise<unknown>;
}

export interface CloudflareEmailOptions {
  binding: SendEmailBinding;
  fromEmail: string;
  fromName: string;
}

export class CloudflareEmailSender implements EmailSender {
  constructor(private readonly options: CloudflareEmailOptions) {}

  async send(message: OutgoingEmail): Promise<SendResult> {
    try {
      await this.options.binding.send({
        to: message.to,
        from: { email: this.options.fromEmail, name: this.options.fromName },
        subject: message.subject,
        text: message.text,
        html: message.html,
        cc: message.cc,
        bcc: message.bcc,
      });
      return { ok: true };
    } catch (cause) {
      // binding 抛 Error 且带 E_* code（如 E_RECIPIENT_SUPPRESSED / E_RATE_LIMIT_EXCEEDED）
      const code = (cause as { code?: string }).code;
      const detail = cause instanceof Error ? cause.message : "unknown error";
      return { ok: false, error: code ? `${code}: ${detail}` : detail };
    }
  }
}

export function chooseEmailSender(
  db: Database,
  mode: string | undefined,
  cloudflare?: CloudflareEmailOptions,
): EmailSender {
  if (mode === "mock") {
    return new MockEmailSender();
  }
  if (mode === "cloudflare" && cloudflare) {
    return new CloudflareEmailSender(cloudflare);
  }
  // 其余情况（本地 dev）走 dev outbox
  return new DevEmailSender(db);
}
