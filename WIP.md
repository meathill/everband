# WIP

完整实施计划见 `/Users/meathill/.claude/plans/use-the-claude-design-mcp-lazy-pie.md`（Everband MVP，9 个里程碑）。

## 已完成

- [x] **M1 脚手架**：monorepo + 设计系统（DYQR emerald + coss/ui）+ 三 Worker 骨架 + db 初始迁移。
- [x] **M2 认证/组织/审计**：magic link/OTP、session、DevEmailSender + /dev/outbox、创建组织、staff 邀请、鉴权链、recordAudit()。
- [x] **M3 成员域**：六对象 + 学生状态机 + 邮箱归并 + parent 邀请 + Members/Groups/Terms 页面。
- [x] **M4 CSV 导入**：`packages/core` 提取（app/tasks 共享业务核心）；CSV 解析/校验/文件内重复检测（纯函数）；import_jobs/import_job_rows（dedupKey + 行级 UNIQUE 双层幂等）；R2 存原文件 + Queues 投递（vite auxiliaryWorkers 本地全链路）；tasks 消费者（部分成功、重投幂等、DLQ）；导入页（模板下载/预览错误行/任务历史计数）。浏览器验证队列闭环：3 行 = 2 created + 1 failed。

## 当前：M5 活动与附件

- [ ] db schema：events / event_groups / event_updates / attachments + 迁移
- [ ] domain：Event/EventUpdate 状态机、受众解析（多 group ∪ org-wide）、未来 30 天窗口（组织时区）
- [ ] server：Event CRUD + 发布、EventUpdate 草稿/发布、附件上传（staff）
- [ ] R2 附件授权下载 server route（session→membership→受众→流式返回，统一 404）
- [ ] 页面：staff Events 列表/详情/编辑；parent Home（未来 30 天）+ 活动详情（更新列表+附件）
- [ ] 测试：受众解析/30 天时区边界单测；附件越权统一 404 集成测试

## 后续里程碑（摘要）

M6 表单 → M7 通知邮件 → M8 排练值班 → M9 Landing/公开主页/二维码。
