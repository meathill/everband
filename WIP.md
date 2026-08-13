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
- 组织角色模型定稿（2026-08-13，进行中）：确认 9 条组织方式（创建即 owner、邀请家长/staff、
  邀请链接自动入 band、staff 可叠加 parent、owner transfer、全量审计、软删除）。
  落地：memberships 加 staff_access 授权位、四张业务表加 deleted_at 迁移、
  core 加 setStaffAccessCore/transferOwnershipCore + 审计、
  server 接口（inviteStaff 限 owner）、StaffSettingsSection 行操作（set/revoke/transfer）、
  guards 支持 staffAccess、单测覆盖角色转换与 transfer 规则

验收状态：`format:ci/typecheck/build/test/test:e2e` 全绿
（普通单测 66 + Worker 集成测试 100 + e2e 19 场景、双视口 52 例）。
