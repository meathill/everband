// 邮件发送抽象层。
// Cloudflare Email Service 处于 Beta（PRD §8.2），所有调用方只依赖
// EmailSender 接口；具体实现由 EMAIL_MODE 决定：
//   cloudflare — 生产，env.EMAIL.send()（M7 接入）
//   dev        — 本地/preview，写入 dev_outbox 由 /dev/outbox 查看（app 内实现）
//   mock       — 测试，记录调用供断言

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
  // 抄送；群发时每封邮件同一地址（例如经办 staff 留底），多地址逗号分隔
  cc?: string;
  // 密送（同 cc，多地址逗号分隔；Cloudflare binding 原生支持 cc/bcc 数组）
  bcc?: string;
  // 邮件类别（invite/magic-link/event-update/swap-result...），用于审计与偏好过滤
  kind: string;
}

export type SendResult = { ok: true } | { ok: false; error: string };

export interface EmailSender {
  send(message: OutgoingEmail): Promise<SendResult>;
}

export class MockEmailSender implements EmailSender {
  readonly sent: OutgoingEmail[] = [];
  failNext = false;

  send(message: OutgoingEmail): Promise<SendResult> {
    if (this.failNext) {
      this.failNext = false;
      return Promise.resolve({ ok: false, error: "mock failure" });
    }
    this.sent.push(message);
    return Promise.resolve({ ok: true });
  }
}
