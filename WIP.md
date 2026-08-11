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

验收状态：`format:ci/typecheck/build/test/test:e2e` 全绿
（普通单测 66 + Worker 集成测试 95 + e2e 16 场景、双视口 32 例）。
