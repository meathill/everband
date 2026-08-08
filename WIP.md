# WIP

完整实施计划见 `/Users/meathill/.claude/plans/use-the-claude-design-mcp-lazy-pie.md`（Everband MVP，9 个里程碑）。

## 已完成

- [x] **M1 脚手架**：monorepo + 设计系统（DYQR emerald + coss/ui）+ 三 Worker 骨架 + db 初始迁移。
- [x] **M2 认证/组织/审计**：magic link/OTP、session、DevEmailSender + /dev/outbox、创建组织、staff 邀请、鉴权链、recordAudit()。集成测试 + e2e 骨架。
- [x] **M3 成员域**：households/contacts/students/student_contacts/groups/terms 六表 + 迁移；学生状态机（active 必有 group、archived 终态、变更记录操作者）；邮箱归并（UNIQUE(orgId,email)，复用联系人与 household）；parent 邀请（登录即关联 contact.userId）；Members/Groups 页面 + Settings Terms 区。集成测试 9 用例（归并/约束/跨组织隔离/幂等）。浏览器验证：建组、加学生、邀请 parent、parent 视角全通过。

## 当前：M4 CSV 导入

- [ ] db schema：import_jobs / import_job_rows（dedupKey UNIQUE、行级 UNIQUE(jobId,rowNumber)）+ R2 绑定
- [ ] validation：CSV 行 schema（studentName/contactName/contactEmail/relationship/groupName?/status?）
- [ ] domain/validation：CSV 解析 + 行校验 + 文件内重复检测（纯函数）
- [ ] server：模板下载、上传 R2、预览（干跑校验）、确认建 job + 入队
- [ ] apps/tasks：import-jobs 队列消费者（部分成功、行级 UPSERT 幂等）
- [ ] 页面：Members 页导入入口 + 任务状态页（计数 + 错误行）
- [ ] 测试：行校验/重复检测单测；消费者幂等集成测试

## 后续里程碑（摘要）

M5 活动与附件 → M6 表单 → M7 通知邮件 → M8 排练值班 → M9 Landing/公开主页/二维码。
