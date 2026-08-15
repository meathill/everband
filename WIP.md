# WIP

## 里程碑归档

- M1 脚手架：monorepo + DYQR 设计系统（emerald + coss/ui）+ 三 Worker + 初始迁移
- M2 认证/组织/审计：magic link/OTP、session、邀请、鉴权链、audit
- M3 成员域：household/contact/student/group/term + 状态机 + 邮箱归并
- M4 CSV 导入：packages/core、双层幂等、部分成功、本地 Queues 全链路
- M5 活动与附件：状态机、受众解析、30 天窗口、R2 授权下载（统一 404）
- M6 固定场景表单：四种 kind、一人一份幂等、关闭只读
- M7 通知与邮件：受众快照、去重、退订、队列发送、发送历史
- M8 排练值班：term 展开（DST 安全）、可预测轮换、换班审批
- M9 公开主页 + dyqr 二维码（mock/real 双实现、slug 同步、软配额、统一降级）+
  Landing 六板块 + Turnstile 联系表单 + 公开主页 e2e
- 验收修复轮（2026-08-10）：issue 1-5（登录回跳/首页按钮/隐私条款页/favicon/404 页）+
  staff Overview 四卡仪表盘，全部部署生产并冒烟验证
- 应用 UI 框架改造（2026-08-11，P0–P8）：侧边栏布局、列表查询协议、FormDrawer/Frame、
  Events/Members/Groups/Rehearsals/Notifications/Import/Settings 全功能化与浏览器回归
- 信息架构重规划（2026-08-11）：Overview 月历与统计、Finance 轻量公费账本、Settings 二级导航、
  Notifications 下移、Group UI 暂停、旧路由兼容及桌面/移动端回归
- 生产登录恢复与 CI 修复（2026-08-11）：补应用 `0009_finance.sql`、修复组织 loader 异常误跳
  Login、两个现有组织在线验收、升级到 pnpm 11.21 与新版 GitHub Actions setup
- 页面跳转加载反馈（2026-08-12）：pending 骨架屏 + 全局 spinner 兜底
  （select-org→org 整页骨架、9 个 org 子页面内容区骨架、sign out loading 态），
  e2e 慢网络基建（CDP 节流 + 字体拦截 + 骨架回归用例）；本地全量受 dev server
  长跑退化影响（见 DEV_NOTE），功能验证按子集跑全绿
  - 生产回归修复（2026-08-12）：defaultPendingComponent 引发全站 hydration mismatch
    （#418，`<html>` 节点）——已移除，改为公开路由级 pendingComponent +
    defaultStaleTime 60s；本地生产构建 + 登录态验证 0 418
- D1 读取复制 + SEO 优化（2026-08-13）：生产启用 D1 read replication（dashboard），
  app/tasks 接入 Sessions API（`withSession("first-primary")`，dev/miniflare 回退普通绑定）；
  Landing 全套 OG/Twitter/canonical/JSON-LD + og:image 生成脚本 + robots/sitemap，
  App 站默认 noindex + 公开页动态 head + robots Disallow；单测 100 条、e2e 52 例全绿，
  已部署生产并冒烟验证
- Landing 页面拆分（2026-08-13）：首页反馈表单移除，新增 /contact（表单直连
  feedback.meathill.com/api/feedbacks，appId=everband-landing）与 /about 页面；
  删除 api.contact.ts 与 Turnstile 依赖，header/footer 导航与 sitemap/SEO 同步更新，
  e2e 新增表单提交 mock 断言；已部署生产并冒烟验证
- 组织角色模型定稿（2026-08-13）：确认 9 条组织方式（创建即 owner、邀请家长/staff、
  邀请链接自动入 band、staff 可叠加 parent、owner transfer、全量审计、软删除）。
  落地：memberships 加 staff_access 授权位、四张业务表加 deleted_at 迁移、
  core 加 setStaffAccessCore/transferOwnershipCore + 审计、
  server 接口（inviteStaff 限 owner）、StaffSettingsSection 行操作（set/revoke/transfer）、
  guards 支持 staffAccess、单测覆盖角色转换与 transfer 规则
- 表单交互与信息架构调整（2026-08-15）：field 间距统一、DatePicker、Events 默认全量、
  表格 refresh、隐藏 Rehearsals/Finance、Group 完整恢复与成员管理、Members 去直接编辑、
  用户菜单版本号与反馈入口；单测 211、e2e 44 例全绿

## 当前任务：群发邮件（2026-08-15）

目标：选中一个或多个 group / member / event 受众 → 跳转写信页
（Subject + CC + 富文本正文 + 可多选/取消的收件人列表）→ queue 逐封分发发送。
邮件管线改为 queue 驱动逐收件人消息（非串行），投递 2 次失败即标 failed。

- [x] 迁移 0011：email_sends 加 cc、dev_outbox 加 cc
- [x] integrations/email 与 core/email-sender：cc 支持
- [x] core/notify：prepareEmailSend 加 cc；processEmailSend → processEmailRecipient
      （错误分级 + 2 次上限 + 收尾汇总）
- [x] core/notify：resolveAudienceContactsForSelection（groupIds/studentIds/eventId
      union + 邮箱去重）+ RSVP 表单排除
- [x] tasks consumer 适配逐收件人消息 + wrangler max_batch_size=50/max_retries=1/
      max_concurrency=10
- [x] server：sendUpdateEmail 适配逐收件人入队；getEmailComposeData/sendBulkEmail
      （服务端重算受众白名单防伪造、dedupKey=SHA-256 内容+收件人）
- [x] validation：emailComposeSearchSchema
- [x] 富文本编辑器组件（TipTap 3 + StarterKit）+ 写信页 /o/$orgId/emails
- [x] 入口：Groups/Members 多选 checkbox + Email 按钮；Event 详情 Email audience 按钮
      （默认带 RSVP 排除）；DataTable 通用 selection 支持
- [x] 测试：集成 119 例（逐封消费/错误分级/受众解析/RSVP/dedup）、
      e2e 新增群发主链路（选组 → 写信 → 微调收件人 → 发送 → 历史），66 例全绿
- [x] 邮件 UI 第二轮（2026-08-15）：Emails 移入侧边栏（邮件中心：草稿 + 发送历史，
      Settings 移除 Email delivery tab）；写信页全宽、输入框白色背景（Input/Textarea
      组件 bg-background → bg-card）、收件人单行 truncate；草稿自动保存（debounce 1s，
      每成员一条，迁移 0012）、离开未保存询问（beforeunload + 链接点击捕获拦截）、
      发送后删草稿；集成 124 例、e2e 68 例全绿
- [x] 家长视角的邮件筛选（2026-08-15）：listEmailSends 按角色分支——staff 看全部，
      parent 只看发给自己的（收件人快照按邀请邮箱匹配，排除 suppressed），只读列表
      可展开看正文、无写信入口；侧边栏家长加 Emails；集成 127 例、e2e 70 例全绿
- [ ] 部署：先 `wrangler d1 migrations apply --remote`（0011、0012）再部署 app/tasks
