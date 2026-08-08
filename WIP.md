# WIP

完整实施计划见 `/Users/meathill/.claude/plans/use-the-claude-design-mcp-lazy-pie.md`（Everband MVP，9 个里程碑）。

## 已完成

- [x] **M1 脚手架**：monorepo + 设计系统（DYQR emerald + coss/ui）+ 三 Worker 骨架 + db 初始迁移。
- [x] **M2 认证/组织/审计**：magic link/OTP、session、DevEmailSender、创建组织、staff 邀请、鉴权链、audit。
- [x] **M3 成员域**：六对象 + 学生状态机 + 邮箱归并 + parent 邀请。
- [x] **M4 CSV 导入**：packages/core、双层幂等、部分成功、本地 Queues 全链路。
- [x] **M5 活动与附件**：events/event_groups/event_updates/attachments 四表；Event（draft→published→cancelled|completed）与 Update（draft→published，编辑不重发）状态机；受众解析（parentGroupIds/canParentAccessEvent/listParentEvents/resolveEventAudienceContacts 邮箱去重）；30 天窗口（组织时区，DST 单测）；datetime-local ↔ UTC 换算；附件 base64 上传 + R2 授权下载 server route（统一 404）；staff/parent 双角色活动页。浏览器验证：staff 建/发/更/传全通，parent 可见、可下载、staff 按钮隐藏，未认证附件 404。

## 当前：M6 固定场景表单

- [ ] db schema：event_forms（eventId UNIQUE、kind 四种、open|closed）+ form_submissions（UNIQUE(formId,membershipId)）
- [ ] domain/validation：表单配置与提交 payload 校验（rsvp/volunteer/choice/text）
- [ ] server：staff 开启/关闭表单、查看结果、CSV 导出；parent 提交/截止前修改
- [ ] 页面：活动详情内嵌表单区（staff 配置+结果；parent 填写）
- [ ] 测试：一人一份幂等（提交即更新）、关闭后拒绝、非受众拒绝

## 后续里程碑（摘要）

M7 通知邮件 → M8 排练值班 → M9 Landing/公开主页/二维码。
