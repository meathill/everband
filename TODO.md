# TODO（MVP 后）

## 上线前必办（PRD §14）

- [ ] Cloudflare Email Service 真实发送：发信域名 SPF/DKIM 验证、`CloudflareEmailSender`
      接入 `env.EMAIL.send()`（接口已留好：packages/core/src/email-sender.ts）、送达率试发
- [ ] dyqr 平台 token：device flow 获取，入 Secrets Store，`DYQR_MODE=dyqr` 切换；
      核查平台配额与单组织软上限数值（当前代码内 MAX_QR_PER_ORG=5）
- [ ] 生产 D1/R2/Queues 资源创建与 wrangler.jsonc database_id 替换（app 与 tasks 同库）
- [ ] Turnstile 真实 site key/secret（landing contact-section.tsx 与 wrangler vars）
- [ ] 隐私声明、数据删除/导出、澳洲未成年人数据法律审查
- [ ] Cloudflare preview smoke test（Worker 启动、D1 读写、R2 授权下载、队列触发）

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
