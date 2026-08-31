// 后台任务 Worker：Queues 消费者宿主。
// everband-import-jobs（CSV 导入）+ everband-email-sends（邮件 fan-out）。

import {
  chooseEmailSender,
  processEmailRecipient,
  processImportJob,
  type SendEmailBinding,
} from "@everband/core";
import { createDb } from "@everband/db";

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
  EMAIL_MODE?: string;
  EMAIL?: SendEmailBinding;
  EMAIL_FROM_ADDRESS?: string;
  EMAIL_FROM_NAME?: string;
  // 生产显式标记 production（wrangler.jsonc vars），启用 D1 read replication session
  ENVIRONMENT?: string;
}

export interface ImportJobMessage {
  importJobId: string;
  r2Key: string;
}

export interface EmailSendMessage {
  sendId: string;
  recipientId: string;
}

type TaskMessage = ImportJobMessage | EmailSendMessage;

export default {
  fetch(): Response {
    // 本 Worker 不对外提供 HTTP 服务
    return new Response("everband-tasks", { status: 200 });
  },

  async queue(batch: MessageBatch<TaskMessage>, env: Env): Promise<void> {
    // 生产走 D1 Sessions API（read replication 顺序一致）；本地 dev/miniflare 不支持 withSession
    const db = createDb(
      env.ENVIRONMENT === "production" ? env.DB.withSession("first-primary") : env.DB,
    );

    if (batch.queue === "everband-email-sends") {
      const sender = chooseEmailSender(
        db,
        env.EMAIL_MODE,
        env.EMAIL
          ? {
              binding: env.EMAIL,
              fromEmail: env.EMAIL_FROM_ADDRESS ?? "no-reply@meathill.com",
              fromName: env.EMAIL_FROM_NAME ?? "Everband",
            }
          : undefined,
      );
        for (const message of batch.messages) {
        // queue 消息 = 一封邮件；platform 负责并行调度（max_concurrency）
        // 与重投（max_retries=1）。幂等与错误分级在 core 内完成。
        const { sendId, recipientId } = message.body as EmailSendMessage;
        try {
          console.log("[tasks] processEmailRecipient start", { sendId, recipientId, attempts: message.attempts });
          const { outcome, error } = await processEmailRecipient(db, sender, {
            sendId,
            recipientId,
            attempts: message.attempts,
            now: Date.now(),
          });
          console.log("[tasks] processEmailRecipient done", { sendId, recipientId, outcome, error: error ?? null });
          if (outcome === "retryable") {
            console.warn("email send retryable, will retry", { sendId, recipientId, error });
            message.retry();
          } else if (outcome === "failed") {
            console.error("email send failed", { sendId, recipientId, error });
            message.ack();
          } else {
            message.ack();
          }
        } catch (cause) {
          console.error("email send failed unexpectedly, will retry", {
            sendId,
            recipientId,
            cause,
          });
          message.retry();
        }
      }
      return;
    }

    // everband-import-jobs
    for (const message of batch.messages) {
      const { importJobId, r2Key } = message.body as ImportJobMessage;
      const object = await env.FILES.get(r2Key);
      if (!object) {
        // 文件缺失属于不可重试错误：标记失败，ack 掉避免死循环
        console.error("import job source file missing", { importJobId, r2Key });
        message.ack();
        continue;
      }
      const csvText = await object.text();
      try {
        await processImportJob(db, importJobId, csvText, Date.now());
        message.ack();
      } catch (cause) {
        // 抛错触发重试；超过 max_retries 进入 DLQ
        console.error("import job failed, will retry", { importJobId, cause });
        message.retry();
      }
    }
  },
} satisfies ExportedHandler<Env, TaskMessage>;
