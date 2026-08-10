# TODO（MVP 后）

## 上线前必办（PRD §14）

- [x] Cloudflare Email Service 真实发送（2026-08-08 已完成）：`CloudflareEmailSender`
      接入 `env.EMAIL.send()`（接口已留好：packages/core/src/email-sender.ts）、送达率试发
- [x] dyqr 平台 token（2026-08-09 已完成）：device flow 获取并入 Secret，
      `DYQR_MODE=dyqr` 已切换、线上验证真实短链跳转
      - [ ] 仍待核查：平台配额与单组织软上限数值（当前代码内 MAX_QR_PER_ORG=5）
- [x] 生产 D1/R2/Queues 资源创建与 database_id 配置（2026-08-08 已完成）
- [x] Turnstile 真实 site key/secret（2026-08-09 已完成，secret 走 Worker Secret）
- [ ] 隐私声明、数据删除/导出、澳洲未成年人数据法律审查
- [x] 线上冒烟：Worker 启动、D1 读写、R2 写入、队列消费、邮件发送、二维码跳转（2026-08-09）
- [ ] 送达率持续观察（首批真实邀请后检查是否进垃圾箱）

## 功能补齐

- [ ] e2e 场景补齐至 PRD §12.2 全部 8 条（现覆盖 2/8/隔离片段；CSV 导入、
      邮件发送、排练换班的 e2e 用集成测试兜底中）
- [ ] 公开主页 logo 上传（字段已建：publicLogoAttachmentId）
- [ ] occurrence 单次取消/调整 UI（core 已支持 status=cancelled）
- [ ] roster 手工替换/锁定 UI（schema 已支持 manual/isLocked）
- [ ] staff Overview 仪表盘（近期活动、待处理换班、导入任务、发送状态）
- [ ] Landing 多页面拆分与 SEO 细化（当前单页六板块）
- [ ] Cloudflare Workflows：活动提醒等真正长周期任务（排练展开为幂等同步执行，暂不需要）

## 近期扩展（PRD §4.3，设计已定稿）

- [ ] 成员招募二维码 + RecruitmentSubmission 审核流（§6.7）
- [ ] 器材只读信息卡 + 二维码（§6.8）
