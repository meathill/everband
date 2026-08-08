# DEV_NOTE

开发过程中需要长期关注的决策与基建知识。

## 技术栈与版本（M1 验证组合，2026-08）

- Node >= 24（可直接运行 .ts），pnpm 11，TypeScript 7（tsgo 原生版）
- TanStack Start 1.168 + Router 1.170（2026-03 已 1.0 稳定）
- Vite 7.3 + @cloudflare/vite-plugin 1.51 + Wrangler 4.119
- Tailwind CSS 4.3（无 config 文件，css-first）
- Drizzle ORM 0.45 + drizzle-kit；Biome 2.5；Vitest 4.1；zod 4

升级任一"五件套"（react-start/react-router/vite/@cloudflare/vite-plugin/wrangler）需走独立分支跑全量检查。

## 关键决策

- **认证自研**（不用 better-auth）：PRD 认证面窄（仅 magic link/OTP），复杂度在多组织 membership 模型，better-auth 的 org 插件与领域模型冲突。
- **drizzle-kit 只 generate 不 push**：迁移 SQL 输出到 `apps/app/migrations`，用 `wrangler d1 migrations apply`（本地 `--local`，生产 `--remote`）执行，保证可审计可回滚。drizzle 配置在 `packages/db/drizzle.config.ts`。
- **schema 独立成 `packages/db`**：app 与 tasks 两个 Worker 共同依赖，避免 tasks 反向 import app。
- **包导出 TS 源码**：packages/* 的 exports 直接指 `./src/*.ts`，由消费方 vite 编译，不做包级构建。
- **依赖方向**：apps → packages；validation → domain；其余包互不依赖。db 查询函数一律 `organizationId` 首参。

## 设计系统（DYQR Design System，emerald 默认）

来源：claude.ai/design 项目 `019e3015-38ab-7ce9-bd70-426f31bcf7a3`。token 层在 `packages/ui/src/styles/colors-and-type.css`（含 shadcn/coss-ui 变量兼容层），应用只 import `@everband/ui/styles/globals.css`。

设计红线：

- 禁 emoji、禁渐变背景、禁左侧色条卡片、禁按钮 hover scale（press 用 `active:scale-[0.98]`）
- 禁裸 hex / 裸 px——一律 token（`var(--...)` 或映射后的 Tailwind 工具类）；字体只用 Geist / Geist Mono / Noto Sans SC
- 圆角：输入/按钮 8px（rounded-md）、卡片 12px（rounded-lg）、marketing tile 16px、modal 20px
- 图标只用 @phosphor-icons/react regular weight，导入重命名为 `XxxIcon`，尺寸 16/20/24/32
- 英文文案 sentence case、无叹号、按钮动词开头；数字用 tabular-nums
- 焦点可见：3px `--ring` halo，禁止裸 `outline: none`
- 主题切换：`<html data-theme="dark|amber|midnight">`，默认 emerald

## M2 落地的认证/测试基建

- **认证核心在 `apps/app/src/server/auth-core.ts`**：只依赖 db 的可测函数（token 原子消费、OTP 计数、membership 查询）。server functions 是薄封装。改认证逻辑先改 core + 测试。
- **一次性使用的落实方式**：`UPDATE ... WHERE consumed_at IS NULL` 的受影响行数判断，不是先查后写。OTP 上限同理（`attempt_count < MAX` 在 WHERE 里）。
- **@cloudflare/vitest-pool-workers 0.20（vitest 4）用插件 API**：`cloudflareTest({ miniflare: {...} })` 放 vite plugins，不再是 `defineWorkersConfig`/`poolOptions`。迁移用 `readD1Migrations` + setup 里 `applyD1Migrations`。
- **Playwright**：webServer 复用 3000 端口 dev server；mobile project 用 Pixel 7（Chromium 内核，避免下载 WebKit）。e2e 从 /dev/outbox 提取 magic link。
- **cloudflare:workers 的 env 类型**：`src/server/env.d.ts` 手工声明（ambient module 内 import type），不引入 workers-types 全局，避免与 DOM lib 冲突。绑定变更要同步该文件与 wrangler.jsonc。
- **TanStack Start 细节**：server fn 校验器叫 `.inputValidator()`；cookie/请求助手从 `@tanstack/react-start/server` 导入（getCookie/setCookie/getRequestIP/getRequestUrl）；vite 需显式 `resolve.alias` 配 `~`（vite 7 无 tsconfigPaths 选项）。

## M4 落地的异步任务基建

- **业务核心在 `packages/core`**（@everband/core）：app 与 tasks 共享（members/auth/audit/import），只依赖 db/domain/validation。新的队列消费者逻辑一律写在 core，tasks 只做绑定与消息编排。
- **本地 Queues 全链路**：apps/app 的 vite `cloudflare({ auxiliaryWorkers: [{ configPath: "../tasks/wrangler.jsonc" }] })` 同时拉起 tasks worker，dev 环境队列投递真实生效。改 tasks 绑定后需重启 dev server。
- **CSV 导入幂等**：任务级 dedupKey =`orgId:sha256(文件内容)` UNIQUE；行级 UNIQUE(jobId,rowNumber) + onConflictDoUpdate；消费前 claim（queued|processing → processing）。消费者对不可重试错误（文件缺失）ack + 标记失败，可重试错误 retry → DLQ。
- **server fn 校验器已换回 `.validator()`**：`.inputValidator()` 在当前版本已弃用（d.ts 与运行时警告不一致，以运行时为准）。

## M9 落地的对外集成

- **dyqr 封装**：`packages/integrations/src/dyqr`，`ShortLinkService` 接口 +
  `DyqrShortLinkService`（@dyqr/sdk 包装，错误统一 ShortLinkError）+ `MockShortLinkService`
  （dev/CI，内存实现 + 占位 SVG）。`DYQR_MODE=mock|dyqr`，token 只经 env（Secrets Store），
  所有写操作 everband 侧记 audit。slug 变更先同步 dyqr targetUrl 再落库，dyqr 不可用则
  放弃变更（保护已打印二维码）。
- **公开主页安全模式**：`getPublicPage` 只返回展示字段白名单；关闭/不存在统一返回 null →
  同一"暂未开放"页（与附件统一 404 同风格）。
- **Turnstile**：dev 用官方测试 key（1x000…AA 恒通过），生产替换 landing 的
  `TURNSTILE_SITE_KEY` 常量与 wrangler `TURNSTILE_SECRET`。
- **限流数值**：登录 email 3/10min（主力）、IP 30/10min（NAT 友好；也避免 e2e 自我踩踏）。
- **移动端触控热区**：coss Button 的 `pointer-coarse:after` 扩展热区会在紧凑布局里相互
  遮挡（Playwright mobile 点击被拦截）。紧凑按钮组要么留够间距，要么像 e2e 那样用键盘激活。

## 工程坑位记录

- **TS7 (tsgo) 的 extends 解析**：`@everband/config/tsconfig.*.json` 必须出现在每个包的 devDependencies 里，否则 extends 静默失败、skipLibCheck 等选项全部丢失，报出一堆 node_modules d.ts 错误。
- **DOM lib 与 workers-types 冲突**：apps/app 同时是客户端和 Worker。当前用 `wrangler types --include-runtime=false` 只生成 Env；M2 引入 server 代码时按 Cloudflare 建议拆分 client/server tsconfig。
- **Tailwind v4 跨包扫描**：workspace 包源码不在自动内容探测范围内，`globals.css` 里用 `@source "../../src"` 显式纳入 ui 包。
- **CSS @import 顺序**：Google Fonts 的 @import 必须放在 `globals.css` 最顶部（先于 `@import "tailwindcss"` 之外的任何规则）。
- **biome 对 Tailwind v4 at-rules（@theme/@source/@custom-variant）解析失败**：`packages/ui/src/styles` 已从 biome includes 排除。
- **pnpm 11 构建脚本审批**：`pnpm-workspace.yaml` 的 `allowBuilds` 显式允许 esbuild、workerd。
- **wrangler.jsonc 的 D1 database_id**：本地开发无所谓，生产部署前用 `wrangler d1 create everband` 生成后替换（app 与 tasks 指同一库）。
- **coss/ui 安装方式**：`packages/ui` 内 `pnpm dlx shadcn@latest add @coss/ui`（components.json 已配 `@coss` registry 与 workspace alias）。组件源码进仓库（src/components/），属"我们的代码"，可按设计系统改（已改 Button：rounded-md、hover 用 --brand-hover、press scale 0.98）。
- **vendored 组件的已知偏差**：coss 组件内部用 lucide-react 图标（约 17 个文件），与"只用 Phosphor"红线冲突；策略是**用到哪个组件改哪个**（替换成 @phosphor-icons/react 等价图标），不一次性全改。biome 对 `packages/ui/src/components/**` 关闭 lint（上游代码模式），业务代码不受此豁免。
- **CLI 追加的语义色块已改回 DYQR token**：coss init 会把 --success/--warning/--info 覆盖成 Tailwind 默认色板——只保留其 `*-foreground` 新增（按 DYQR 色相取深档），本体沿用 colors-and-type.css。注意 coss 语义里 `--destructive-foreground` 是"浅底上的深色错误文字"（实心破坏性按钮直接 text-white），与 shadcn 经典语义不同。
