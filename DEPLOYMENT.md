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

## 当前部署形态

全部外部依赖均已接真实服务：

| 项 | 生产 | 本地 dev / CI |
| --- | --- | --- |
| 邮件 | ✅ 真实发送（Email Service binding，`Everband <no-reply@meathill.com>`，DKIM/DMARC 已验证） | `.dev.vars` 覆盖为 `EMAIL_MODE=dev`，落 `/dev/outbox`（e2e 依赖）；CI 用 mock |
| 二维码 | ✅ 真实 dyqr 短链（`DYQR_MODE=dyqr` + `DYQR_TOKEN` Secret；token 缺失时自动回退 mock） | mock（内存实现，零外呼） |
| Turnstile | ✅ 真实 widget（Invisible 模式，site key 内嵌前端、secret 走 Secret） | 官方测试 key/secret（恒通过） |

生产模式下 `/dev/outbox` 显示空的 "Not available"、`/dev/reset` 返回 404，不泄露任何数据。

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

1. **Landing 的应用站地址**：`apps/landing/src/lib/config.ts` 的
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

1. 打开 landing URL：六板块渲染、Contact 表单可提交（真实 Turnstile Invisible 模式，
   页面上看不到验证框是正常的）。
2. 打开 app URL `/login`：输入邮箱 → **去真实邮箱收登录码/magic link** → 登录成功
   （验证 Worker 启动 + D1 读写 + Email Service 发送）。
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

三项外部依赖已全部转正（2026-08-09 线上验证通过）：

1. ~~真实邮件发送~~ ✅ meathill.com 已 onboard Email Sending，`CloudflareEmailSender`
   经 `send_email` binding 发送，失败会反馈 UI 并记日志。
2. ~~Turnstile 真实 key~~ ✅ Invisible 模式 widget，site key 内嵌前端、
   secret 存 Worker Secret；生产联系表单提交已验证通过 siteverify。
3. ~~dyqr 真实短链~~ ✅ `DYQR_MODE=dyqr` + `DYQR_TOKEN` Secret；已生成真实短链
   并验证 302 跳转到公开主页。

剩余：隐私声明与法律审查、送达率持续观察（PRD §14）。

## 环境变量与密钥一览

| 变量 | Worker | 本地（.dev.vars） | 生产（wrangler.jsonc / Secret） |
| --- | --- | --- | --- |
| `EMAIL_MODE` | app, tasks | `dev` | `cloudflare` ✅ |
| `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` | app, tasks | — | `no-reply@meathill.com` / `Everband` |
| `DYQR_MODE` | app | `mock` | `dyqr` ✅（token 缺失自动回退 mock） |
| `DYQR_TOKEN` | app | 无 | 已配 Secret（`wrangler secret put`） ✅ |
| `TURNSTILE_SECRET` | landing | 测试 secret | 真实 Secret ✅ |

CI 的单元与集成测试恒为 `EMAIL_MODE=mock`、`DYQR_MODE=mock`；E2E 启动 Worker 前从
`.dev.vars.example` 生成临时 `.dev.vars`，使邮件写入本地 `dev_outbox`，供
`/dev/outbox` 获取 magic link。两种模式都不产生真实外呼（PRD §12.3）。
