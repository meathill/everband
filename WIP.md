# WIP

完整实施计划见 `/Users/meathill/.claude/plans/use-the-claude-design-mcp-lazy-pie.md`（Everband MVP，9 个里程碑）。

## 已完成

- [x] **M1 脚手架**：monorepo + 设计系统（DYQR emerald + coss/ui）+ 三 Worker 骨架 + db 初始迁移。四命令全绿，emerald Button 视觉验证通过。

## 当前：M2 认证/组织/审计

- [ ] auth 域 domain 纯函数：token 生成/哈希/过期/一次性、OTP 校验计数、限流窗口判断
- [ ] server：请求 magic link/OTP、验证登录、session cookie（HttpOnly/Secure/Lax）
- [ ] DevEmailSender 落地（写 dev_outbox 表）+ /dev/outbox 页面（dev only）
- [ ] 创建组织向导（名称/类型/时区）+ owner membership
- [ ] 多组织选择页 + o/$orgSlug 布局
- [ ] staff 邀请（invite token → membership 激活）
- [ ] 中间件链：session → membership → requireRole
- [ ] recordAudit() 辅助 + 关键写入审计
- [ ] 限流（email + IP 双维度）
- [ ] Worker 集成测试（@cloudflare/vitest-pool-workers）：token 过期/复用/穷举、跨组织探测拒绝
- [ ] Playwright 最小骨架（/dev/outbox 取 magic link 完成登录）

## 后续里程碑（摘要）

M3 成员域 → M4 CSV 导入 → M5 活动与附件 → M6 表单 → M7 通知邮件 → M8 排练值班 → M9 Landing/公开主页/二维码。
