# WIP

## 进行中：应用 UI 框架改造（2026-08-11 启动）

顶部菜单 → 左侧边栏布局；New XXX 迁右侧 drawer；补齐编辑/删除；
所有列表加快捷操作 + 排序/筛选/搜索/翻页；表单 Frame 分区化。
完整计划见 `~/.claude/plans/app-ui-concurrent-duckling.md`。

已确认决策：软删为主（draft/无引用才硬删）；Account 挪侧边栏底部用户菜单；
org 切换器进侧边栏顶部；搜索用提交式（非受控红线）。

- [x] P0 UI 包地基（--sidebar* token、去 lucide、cookieStore 降级、ToastProvider）
- [x] P1 侧边栏布局（OrgLayout 重写 + org-sidebar + toast 去 lucide + e2e 补用例）
- [ ] P2 列表基建（listQuerySchema + DataTable 组件族）
- [ ] P3 表单基建（FormDrawer + useServerFormAction + ConfirmDialog + groups 落地）
- [ ] P4 Events 样板页（列表参数全链路 + 编辑/删除 + 集成测试）
- [ ] P5 Members + Groups
- [ ] P6 Rehearsals（series 可见性 + end/cancel）
- [ ] P7 长尾页面（notifications/import/settings/account/new-org/select-org）
- [ ] P8 e2e 补齐 + 文档收尾

每阶段 format/typecheck/test 绿后单独提交。

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

验收状态：`pnpm run format/typecheck/build/test:e2e` 全绿
（单测 46 + e2e 9 场景 18 例）。

⚠️ **Worker 集成测试（apps/app 的 44 例）当前全部无法启动**，报
`Vitest failed to find the current suite`——`@cloudflare/vitest-pool-workers@0.20.2`
与根 vitest 4.1.10 之间存在重复实例（node_modules 里有 5 份 vitest，分别绑 vite 7.3.6
和 vite 8.2.0）。在 P1 改动之前就已存在（已用 stash + `--frozen-lockfile` 复验），
与 UI 改造无关，需单独排一次依赖收敛。
