# Everband

乐队首发、模型通用的社区团队运营平台。面向由家长和社区委员会运营的学生军乐队（以及后续的球队、社团），提供组织、成员、活动、排练、值班、通知与公费账本的运营闭环。

产品规格见 [PRD.md](PRD.md)，开发中长期注意事项见 [DEV_NOTE.md](DEV_NOTE.md)，
部署见 [DEPLOYMENT.md](DEPLOYMENT.md)。

## 仓库结构

```text
apps/
  app/        # 应用站（TanStack Start on Cloudflare Workers，D1/R2/Queues）
  tasks/      # 后台任务 Worker（Queues 消费者 + Workflows）
  landing/    # 静态产品站（TanStack Start 全量 prerender）
packages/
  config/     # 共享 tsconfig
  db/         # drizzle schema 与迁移配置
  domain/     # 纯函数领域层（状态机、受众、去重、轮换等）
  validation/ # zod 校验（前后端共用）
  ui/         # 设计系统 token + coss/ui 组件库
  integrations/ # 外部服务封装（email、dyqr）
```

## 开发

要求 Node >= 24、pnpm 11。

```bash
pnpm install
pnpm -C apps/app run dev        # 应用站 http://localhost:3000
pnpm -C apps/landing run dev    # Landing http://localhost:3001
```

本地 D1 迁移：

```bash
pnpm -C apps/app exec wrangler d1 migrations apply everband --local
```

## 工程检查

```bash
pnpm run format      # biome check --write
pnpm run typecheck
pnpm run test
pnpm run test:e2e
pnpm run build
```
