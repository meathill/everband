// 后台任务 Worker：Queues 消费者宿主。
// everband-import-jobs（CSV 导入）+ everband-email-sends（邮件 fan-out）。

import {
  chooseEmailSender,
  processEmailSend,
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
}

export interface ImportJobMessage {
  importJobId: string;
  r2Key: string;
}

export interface EmailSendMessage {
  sendId: string;
}

type TaskMessage = ImportJobMessage | EmailSendMessage;

export default {
  fetch(): Response {
    // 本 Worker 不对外提供 HTTP 服务
    return new Response("everband-tasks", { status: 200 });
  },

  async queue(batch: MessageBatch<TaskMessage>, env: Env): Promise<void> {
    const db = createDb(env.DB);

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
        const { sendId } = message.body as EmailSendMessage;
        try {
          await processEmailSend(db, sender, sendId, Date.now());
          message.ack();
        } catch (cause) {
          console.error("email send failed, will retry", { sendId, cause });
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
