# WIP

本轮（2026-08-10）：修复验收 issue 1-5 + staff Overview 仪表盘，修完部署生产并冒烟。

## Todo

- [ ] 1. Issue 2：应用站首页两按钮加导航（Get started → /new-org，Sign in → /login）
- [ ] 2. Issue 5：app + landing 加 defaultNotFoundComponent（降级卡片 + 返回首页）
- [ ] 3. Issue 4：favicon（手写 SVG + 零依赖脚本生成 ICO，两站 public/ + head links）
- [ ] 4. Issue 1：/new-org 登录回跳（loader 前置鉴权 + redirectPathSchema 防开放重定向 +
      login/verify/邮件链接传递 redirect + catch 兜底友好化）
- [ ] 5. Issue 3：landing 抽 header/footer 组件，新增 /privacy /terms 完整英文初稿
      （不承诺澳洲数据驻留；只写已实现能力），login 页加条款外链
- [ ] 6. Overview core：packages/core/src/overview.ts 四块聚合 + overview-core.spec.ts
- [ ] 7. Overview UI：server fn + o/$orgId/index.tsx staff 四卡 + 导航 Overview 入口
- [ ] 8. e2e/navigation.spec.ts（按钮导航、回跳、恶意 redirect、404、favicon 200）
- [ ] 9. 全绿：format / typecheck / test / build / test:e2e；产物检查
- [ ] 10. push + 部署 app、landing；线上冒烟逐 issue 验证
- [ ] 11. 关闭 issue 1-5；更新 TODO.md / DEV_NOTE.md；清理 WIP.md

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

验收状态（上轮）：`pnpm run format/typecheck/test/build/test:e2e` 全绿
（单测 40 + Worker 集成 39 + e2e 6）。
