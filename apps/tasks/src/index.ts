// 后台任务 Worker：Queues 消费者与 Workflows 的宿主。
// M1 只是空壳，M4（CSV 导入）、M7（邮件 fan-out）、M8（排练展开）逐步接入。

interface Env {
  DB: D1Database;
}

export default {
  fetch(): Response {
    // 本 Worker 不对外提供 HTTP 服务
    return new Response("everband-tasks", { status: 200 });
  },
} satisfies ExportedHandler<Env>;
