# 部署指南

三个 Worker 独立部署：`everband-app`（应用站）、`everband-tasks`（队列消费者）、
`everband-landing`（产品站）。共享同一个 D1 数据库和 R2 bucket。

## 当前线上环境（2026-08-08 首次部署）

- 账号：Meathill（`fdc63eeea83ae8f5234357308b9a638b`），已写入各 wrangler.jsonc
- 应用站：<https://everband-app.meathill.com>
- 产品站：<https://everband.meathill.com>
- D1：`everband`（`e1759245-2dfc-4bc4-93e5-976215432740`）
- R2：`everband-files`；Queues：`everband-import-jobs` / `everband-email-sends` / `everband-dlq`
- 已冒烟：登录（/dev/outbox 取链接）、建组织/分组、CSV 导入队列全链路 succeeded、landing 渲染

日常更新只需：改代码 → （如有新迁移）`migrations apply --remote` → 按顺序 deploy。

## 当前部署形态：演示模式

代码可以直接上线，但默认配置是**演示模式**，三个外部依赖都是替身：

| 项 | 当前状态 | 影响 |
| --- | --- | --- |
| 邮件（`EMAIL_MODE=dev`） | 不真发邮件，落库后在 `/dev/outbox` 页面查看 | ⚠️ **`/dev/outbox` 无鉴权**：任何访问者都能看到所有 magic link，等于可登录任何账号。只适合自己私下试用，绝不能在此模式下邀请真实用户 |
| 二维码（`DYQR_MODE=mock`） | 短链/二维码是内存 mock，下载的是占位 SVG | 二维码不可真实扫码跳转 |
| Turnstile（测试 key） | 联系表单人机验证恒通过 | 无反滥用保护，仅影响 landing |

转正式模式的路径见文末「生产化差距」，也可参考 [TODO.md](TODO.md)。

## 前置条件

1. Cloudflare 账号已开通 **Workers Paid 计划**（Queues 硬性要求；D1/R2 免费额度够用）。
2. 本地 `wrangler login` 完成（或配置 `CLOUDFLARE_API_TOKEN`）。
3. `pnpm install` 且 `pnpm run build` 全绿。

## 一、创建生产资源（一次性）

```bash
pnpm -C apps/app exec wrangler d1 create everband
```

记下输出的 `database_id`，替换 **两处** wrangler.jsonc（app 与 tasks 必须指同一个库）：

- `apps/app/wrangler.jsonc` → `d1_databases[0].database_id`
- `apps/tasks/wrangler.jsonc` → `d1_databases[0].database_id`

然后创建 R2 与三个队列：

```bash
pnpm -C apps/app exec wrangler r2 bucket create everband-files
```

```bash
pnpm -C apps/app exec wrangler queues create everband-import-jobs
```

```bash
pnpm -C apps/app exec wrangler queues create everband-email-sends
```

```bash
pnpm -C apps/app exec wrangler queues create everband-dlq
```

## 二、部署前的代码调整

1. **Landing 的应用站地址**：`apps/landing/src/routes/index.tsx` 顶部的
   `APP_URL`（dev 走 localhost，生产已指向 everband-app.meathill.com；换域名时同步改）。
2. 自定义域名：各 wrangler.jsonc 的 `routes`（`custom_domain: true`）已配置，
   换域名直接改 pattern 重新 deploy 即可。

## 三、应用数据库迁移

```bash
pnpm -C apps/app exec wrangler d1 migrations apply everband --remote
```

迁移是带序号的 SQL（`apps/app/migrations/`），重复执行安全；每次新增迁移后、
部署新代码前都要先跑这一步。

## 四、部署（按此顺序）

先消费者后生产者，避免消息投递到未部署的队列消费者：

```bash
pnpm -C apps/tasks run deploy
```

```bash
pnpm -C apps/app run deploy
```

```bash
pnpm -C apps/landing run deploy
```

`deploy` 脚本已包含构建步骤（tasks 是 dry-run 构建 + deploy，app/landing 是
vite build + wrangler deploy）。

## 五、部署后冒烟检查

按顺序验证一遍（对应 PRD §12.3 preview smoke test）：

1. 打开 landing URL：六板块渲染、Contact 表单可提交（测试 key 恒通过）。
2. 打开 app URL `/login`：输入邮箱 → 打开 `/dev/outbox` 取 magic link → 登录成功
   （验证 Worker 启动 + D1 读写 + 邮件落库）。
3. 创建组织 → Settings 建 group/term → Members 加一个学生。
4. Import 页上传小 CSV → 确认导入 → 刷新看任务 `succeeded`
   （验证 R2 写入 + Queues 投递 + tasks 消费者）。
5. 建活动 → 发布 → 传附件 → 点附件链接能下载（验证 R2 授权下载）。
6. 活动 update 发布 → Send email → Notifications 页看到发送记录 `succeeded`
   （验证邮件队列）。
7. Settings 开公开主页 → 生成二维码 → 无痕窗口访问 `/p/<slug>` 可见；
   关闭后显示统一"暂未开放"。

## 运维

- **日志**：三个 Worker 都开了 `observability`，Dashboard → Workers → Logs 可查；
  实时尾随用 `pnpm -C apps/app exec wrangler tail`。
- **回滚**：`wrangler rollback`（Dashboard → Deployments 也可选历史版本回滚）。
  涉及数据库结构的回滚需按迁移 PR 中的回滚说明手工执行 SQL。
- **失败队列**：进入 `everband-dlq` 的消息在 Dashboard → Queues 查看；
  导入/发送任务的业务状态在应用内（Import 历史 / Notifications 发送历史）可查。

## 生产化差距（正式面向用户前必须完成）

按优先级：

1. **真实邮件发送**（阻塞项）：Cloudflare Email Service 发信域名验证
   （SPF/DKIM），实现 `CloudflareEmailSender`（接口在
   `packages/core/src/email-sender.ts`，绑定 `env.EMAIL`），
   两处 wrangler.jsonc 把 `EMAIL_MODE` 切到 `cloudflare`。
   完成后 `/dev/outbox`、`/dev/reset` 自动失效（它们只在 dev 模式响应）。
2. **Turnstile 真实 key**：Dashboard 创建 widget，替换
   `apps/landing/src/components/contact-section.tsx` 的 `TURNSTILE_SITE_KEY`
   与 landing wrangler.jsonc 的 `TURNSTILE_SECRET`（生产应改用
   `wrangler secret put TURNSTILE_SECRET`，不留在 vars 里）。
3. **dyqr 真实短链**：device flow 获取平台 token →
   `wrangler secret put DYQR_TOKEN`（只对 app）→ `DYQR_MODE` 切 `dyqr`。
4. 隐私声明与法律审查、送达率验证（PRD §14）。

## 环境变量与密钥一览

| 变量 | Worker | 演示值 | 生产值 |
| --- | --- | --- | --- |
| `EMAIL_MODE` | app, tasks | `dev` | `cloudflare` |
| `DYQR_MODE` | app | `mock` | `dyqr` |
| `DYQR_TOKEN` | app | 无 | Secret（`wrangler secret put`） |
| `TURNSTILE_SECRET` | landing | 测试 secret | Secret（`wrangler secret put`） |

CI 恒为 `EMAIL_MODE=mock`、`DYQR_MODE=mock`，不产生真实外呼（PRD §12.3）。
