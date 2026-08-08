// 后台任务 Worker：Queues 消费者宿主。
// M4：everband-import-jobs（CSV 导入）。M7 邮件 fan-out、M8 Workflows 后续接入。

import { processImportJob } from "@everband/core";
import { createDb } from "@everband/db";

interface Env {
  DB: D1Database;
  FILES: R2Bucket;
}

export interface ImportJobMessage {
  importJobId: string;
  r2Key: string;
}

export default {
  fetch(): Response {
    // 本 Worker 不对外提供 HTTP 服务
    return new Response("everband-tasks", { status: 200 });
  },

  async queue(batch: MessageBatch<ImportJobMessage>, env: Env): Promise<void> {
    const db = createDb(env.DB);
    for (const message of batch.messages) {
      const { importJobId, r2Key } = message.body;
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
} satisfies ExportedHandler<Env, ImportJobMessage>;
