# 测试指南

三层测试，覆盖层级自底向上。全部命令从仓库根执行。

## 运行

```bash
pnpm run test        # 单测 + Worker 集成测试（vitest）
pnpm run test:e2e    # Playwright（需本地 dev server，自动启动）
```

单测与集成测试共用 vitest：根配置跑 `packages/*/test/**/*.test.ts`（node 环境纯函数），
`apps/app/vitest.config.ts` 用 `@cloudflare/vitest-pool-workers` 跑 Worker 集成测试。

## 测试分布

| 层级 | 位置 | 环境 | 覆盖对象 |
| --- | --- | --- | --- |
| 单测 | `packages/*/test/` | node | 领域层纯函数（时间/状态机/ID）、zod 校验、integrations 封装（dyqr/email） |
| 集成 | `apps/app/test/` | vitest-pool-workers + 本地 D1 | 各域 core 逻辑（auth/member/event/rehearsal/finance/import/notify…） |
| e2e | `e2e/` | Playwright（Chromium 桌面 + Pixel 7 移动） | 登录、导航、UI 工作流、公开主页 |

## 约定

- 业务核心逻辑（packages/core、apps/app/src/server）必须有集成测试；纯函数必测；
  修 bug 先写能复现的回归用例。
- 测试不得产生真实外呼：恒为 `EMAIL_MODE=mock`、`DYQR_MODE=mock`；e2e 从
  `.dev.vars.example` 生成临时 `.dev.vars`，邮件落本地 dev outbox，经 `/dev/outbox`
  取 magic link。
- e2e 不要直接 `locator.fill`/`button.click` 首屏元素（水合竞态），一律用
  `e2e/helpers.ts` 的 `fillField`/`pressButton`，它们内部先 `waitForHydration`
  再操作。新写 e2e 照此。
- 测试命名描述场景而非实现；一个用例只测一个行为。
- 覆盖率目标：纯函数与核心域逻辑 100%，API 端点请求/响应/边界全覆盖；
  UI 以 e2e 主流程兜底，不要求组件单测。
