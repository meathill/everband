# WIP

完整实施计划见 `/Users/meathill/.claude/plans/use-the-claude-design-mcp-lazy-pie.md`（Everband MVP，9 个里程碑）。

## 当前：M1 脚手架

- [ ] 根 workspace：package.json / pnpm-workspace.yaml / biome.json / tsconfig.json / .gitignore
- [ ] packages/config：tsconfig base×3 + vitest base
- [ ] packages/ui：DYQR token CSS（emerald 默认）+ coss/ui（shadcn CLI）+ Phosphor + cn()
- [ ] apps/app：TanStack Start + @cloudflare/vite-plugin，wrangler dev 可跑
- [ ] packages/db：drizzle schema 初始六表（users/sessions/auth_tokens/organizations/memberships/audit_entries）+ 迁移
- [ ] packages/domain / validation / integrations：初始骨架 + 占位单测
- [ ] apps/tasks：queue handler 空壳
- [ ] apps/landing：单页骨架
- [ ] CI workflow（.github/workflows/ci.yml）
- [ ] 验收：pnpm run format / typecheck / test / build 全绿；coss/ui Button 渲染 emerald 主题

## 后续里程碑（摘要）

M2 认证/组织/审计 → M3 成员域 → M4 CSV 导入 → M5 活动与附件 → M6 表单 → M7 通知邮件 → M8 排练值班 → M9 Landing/公开主页/二维码。
