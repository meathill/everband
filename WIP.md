# WIP

完整实施计划见 `/Users/meathill/.claude/plans/use-the-claude-design-mcp-lazy-pie.md`（Everband MVP，9 个里程碑）。

## 已完成

- [x] **M1 脚手架**：monorepo + 设计系统（DYQR emerald + coss/ui）+ 三 Worker 骨架 + db 初始迁移。
- [x] **M2 认证/组织/审计**：magic link/OTP（哈希存储、一次性、限流、OTP 穷举上限）、session cookie、DevEmailSender + /dev/outbox、创建组织 + owner membership、多组织选择、staff 邀请与激活、requireUser/requireMembership 鉴权链、recordAudit()。浏览器全流程验证通过；Worker 集成测试 7 用例（含跨组织隔离）；Playwright e2e 4 用例（桌面+移动）。

## 当前：M3 成员域

- [ ] db schema：households / contacts / students / student_contacts / groups / terms + 迁移
- [ ] domain：学生状态机（interested|active|withdrawn|archived，active 必有 group）、状态变更记录
- [ ] validation：member/group/term schema
- [ ] server：六对象 CRUD（全部走 requireMembership + audit）
- [ ] 邮箱归并：contacts 按 UNIQUE(orgId,email) 归并，parent 邀请关联 contact ↔ membership
- [ ] 页面：Members（Households/Students/Contacts 表格）、Groups、Settings 加 Terms
- [ ] 单测：状态转换矩阵、邮箱归并（大小写/空白/多学生同邮箱）、active 单 group 约束
- [ ] 集成测试：跨组织成员数据隔离

## 后续里程碑（摘要）

M4 CSV 导入 → M5 活动与附件 → M6 表单 → M7 通知邮件 → M8 排练值班 → M9 Landing/公开主页/二维码。
