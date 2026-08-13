# Everband 产品需求文档

**版本**：0.1

**状态**：Draft

**更新时间**：2026-08-07

**产品定位**：乐队首发、模型通用的社区团队运营平台

## 1. 文档说明

本文档将 [everband.svg](/Users/meathill/Documents/GitHub/everband/everband.svg) 和 [everband.excalidraw](/Users/meathill/Documents/GitHub/everband/everband.excalidraw) 中的领域概念、角色和用户旅程整理为可执行的产品规格。

原始图稿是概念草图，不是完整规格。本文档中明确标注的状态、权限、边界和默认规则，是为了让后续设计与开发可以直接执行；涉及法律、数据驻留和第三方服务可用性的内容仍需在上线前单独核查。

## 2. 产品概述

### 2.1 产品是什么

Everband 是一个面向小型社区组织的多组织 SaaS。它首先解决由家长和社区委员会运营的学生军乐队的日常管理问题，同时用通用的组织、成员、分组、活动、排练和通知模型，为后续支持棒球队、足球队以及其他社区社团保留扩展空间。

首版产品不追求覆盖所有组织管理功能，而是完成以下运营闭环：

> 组织建立 → 家庭和学生加入 → 学生分组 → 活动与排练安排 → 家长协作 → 更新通知 → 附件和审计记录

### 2.2 要解决的问题

当前这类组织通常依赖表格、个人通讯录、群邮件、日历和零散文件共同工作，容易出现：

- 学生、家长联系人和分组信息分散，staff 无法快速确认当前成员状态。
- 新成员加入、CSV 导入和分组调整缺少统一流程，重复数据和遗漏难以及时发现。
- 活动信息、活动更新、附件和邮件分散在不同工具中，家长难以找到最新版本。
- 排练按学期重复发生，家长 helper roster 需要人工轮值，换班经常依赖私聊。
- 组织无法确认通知发给了谁、由谁发送以及发送是否失败。
- 换届或志愿者变动后，历史信息和操作记录难以交接。

### 2.3 产品价值

对 staff：减少表格和群邮件维护工作，让组织状态、活动安排和沟通记录集中可见。

对 parent：在一个移动端友好的入口中查看相关活动、最新更新、附件、排练和值班安排，并能完成需要的确认或报名。

对平台：形成适用于乐队、球队和社区社团的通用组织运营底座，而不是只为某一个乐队硬编码的后台。

## 3. 目标用户与权限

### 3.1 用户角色

| 角色 | 说明 | 首版核心权限 |
| --- | --- | --- |
| Organization Owner | 创建组织的成人，通常是委员会负责人 | 管理组织设置、staff、成员、分组、活动、排练、通知和审计；可邀请/撤销 staff、transfer owner |
| Staff | 属于委员会、负责运营组织的成人 | 管理成员、分组、活动、排练、表单和通知；不能删除审计记录 |
| Parent | 学生的家长或照护者 | 查看自己相关的活动和排练，下载授权附件，提交表单，查看和申请换班 |
| Student | 参加组织的未成年人 | 首版不创建独立账号，由 parent 管理其资料 |

### 3.2 权限规则

- 组织创建者自动成为该组织的 `Organization Owner`。
- 一个成人账号可以加入多个组织；每个组织中的权限由该组织的 membership 决定。
- 一个组织可以有多个 staff。
- **Staff 权限可以叠加在 Parent 身份上**：`membership.role` 保存基础身份（`owner | staff | parent`），`staffAccess` 授权位让 parent 获得 staff 运营权限；移除授权位后恢复为普通 parent 可见性。Owner 隐式拥有 staff 权限。
- Parent 只能访问其 membership 所属组织，以及与其家庭/学生关系相关的内容。
- Staff（含被授予 `staffAccess` 的 parent）可以管理本组织的运营数据，但不能跨组织访问数据。
- **Staff 管理只限 Owner**：邀请 staff、授予/撤销 `staffAccess`、transfer owner、移除成员、删除组织均只有 Owner 可执行；Staff 可以邀请 parent、管理运营数据。
- **Owner 转移（transfer）**：目标必须是本组织 active 且具备 staff 权限（`role = staff` 或 `staffAccess = true`）的成员；转移后原 Owner 自动变为 Staff（保留 staff 权限），目标变为新 Owner。组织不能没有 Owner：唯一 Owner 离开组织必须先 transfer。
- 邀请 parent 时只邀请学生的 parent/guardian 联系人，不邀请 emergency 联系人；同一联系人因多个学生只产生一次邀请。
- 所有服务端查询必须按 `organizationId` 和当前 membership 权限进行授权，不能只依赖前端路由隐藏。
- 学生资料、家长联系方式和活动信息不公开展示；首版不支持公开活动页。
- 组织可选择开启一个只读的组织公开主页（名称、简介、logo、加入入口），由 staff 维护展示字段；这不等同于公开活动页，活动详情、排练、helper roster 依然不对外公开。

### 3.3 账号与加入方式

- 首版使用邮箱 magic link/OTP，无密码登录，不支持 Google/Microsoft 社交登录。
- Organization Owner 通过产品入口创建组织。
- Owner 邀请 staff；Owner/Staff 邀请 parent。
- 邀请发出时已记录 `contact.email`，用户必须使用**同一个邮箱**注册/登录才能通过邀请链接自动激活 membership（`invited → active`）；换邮箱无法匹配既有邀请。
- CSV 导入可以先创建待邀请的学生、家庭和联系人记录；真正访问应用仍需完成邮箱邀请。
- 登录链接、邀请链接和 OTP 必须有过期时间、一次性使用约束和请求频率限制。

### 3.4 删除与软删除边界

- 业务实体（organization / household / contact / student）统一使用 `deletedAt` 软删除标记，不做物理删除。
- Membership 的生命周期用状态机表达（`invited / active / suspended / removed`），不新增 `deletedAt`。
- 审计记录（audit_entries）和附件永不删除。
- Owner 不默认是 parent：创建组织时不为 Owner 自动建立 household/contact；Owner 要关联自己的孩子时，走正常流程创建 household + contact（可填自己或他人），联系人邮箱匹配到 Owner 账号后自然获得 parent 可见性。

## 4. 产品边界

### 4.1 MVP 包含

1. 组织创建、组织设置和角色管理。
2. 家庭、成人联系人、学生和学生生命周期管理。
3. 学生 CSV 导入；Group 数据保留兼容，但管理 UI 暂停。
4. 活动、活动更新、Overview 月历、附件和固定场景表单。
5. 站内通知、未读状态、事务邮件和发送审计。
6. 按 school term 运行的重复排练。
7. 家长 helper roster 自动轮换、手工调整和换班申请。
8. 移动端和桌面端均可使用的响应式 Web 应用。
9. 面向产品推广的静态 Landing page。
10. 组织公开主页（只读展示信息）与动态二维码入口，用于线下物料引流。
11. 只记录收入/支出、编辑、作废和审计的轻量公费账本。

### 4.2 MVP 不包含

- 器材借还流程（check-out/check-in）、维修历史记录和责任人变更审批（只读的器材信息与当前持有人展示见 §4.3 近期扩展）。
- Tutor/导师名册。
- Invoice、在线支付、会费应收、订阅、报销审批和完整财务报表。
- 通用表单设计器、复杂条件逻辑和自定义字段平台。
- 学生独立登录、学生端社交功能或聊天。
- 即时群聊、原生移动端推送和短信。
- 外部 Google/Apple/Outlook 日历双向同步。
- 公开活动页面或匿名报名。
- SaaS 订阅计费和付费套餐。
- 订阅组织的自定义域名。
- 澳大利亚数据驻留承诺。

### 4.3 后续扩展方向

后续可以在不破坏核心组织模型的前提下增加：

- 器材只读信息卡片与二维码查看（近期扩展，优先级最高，详见 §6.8）。
- 完整器材借还流程、维修记录和责任人变更审批（中期扩展）。
- 成员招募二维码：扫码提交意向信息，经 Staff 审核后转为正式 Student/Household 记录（近期扩展，详见 §6.7）。
- Tutor 名册和教学安排。
- 费用、invoice、支付和财务报表。
- 通用表单设计器。
- 组织模板，例如 band、baseball、football、community club。
- 外部日历导出和同步。
- 更细粒度的权限、审批流和自定义字段。
- 学生账号或面向青少年的受控体验，但必须经过额外隐私与监护设计。

## 5. 核心领域模型

### 5.1 组织与成员

| 对象 | 说明 | 关键规则 |
| --- | --- | --- |
| Organization | 一个乐队、球队或社区组织 | 是租户边界，所有业务数据归属一个组织 |
| User | 一个成人登录身份 | 可以属于多个组织 |
| Membership | User 与 Organization 的关系 | 保存 `owner / staff / parent` 角色和状态 |
| Household | 一个家庭或照护关系集合 | 可关联多个成人联系人和多个学生 |
| Student | 组织管理的学生/队员记录 | 可关联多个家庭联系人 |
| Group | 历史训练组或演出组关系 | 底层数据和旧受众关系保留，当前 UI 不提供管理或新建关系 |
| Term | 组织使用的 school term 时间段 | 由组织按本地时区手动维护 |

#### 学生状态

- `interested`：有兴趣或正在了解组织，尚未正式 active。
- `active`：当前参与组织，可被纳入相关 group、活动和排练。
- `withdrawn`：曾参与但已退出，不应继续接收常规运营通知。
- `archived`：历史记录，仅供 staff 查阅，不参与当前运营。

状态变更必须记录操作者和时间。只有 `active` 学生可以接收正常运营相关的家庭通知；`interested` 是否接收邀请类通知由 staff 在具体流程中决定。

#### 家庭与联系人规则

- 一个 Household 可以有多个成人联系人。
- 一个 Student 可以关联多个联系人，每个关系包含 relationship，例如 parent、guardian 或 emergency contact。
- 一个成人联系人可以关联多个学生。
- 系统按邮箱归并联系人，邮箱比姓名更优先作为去重依据。
- 任何需要发送邮件的场景都必须按最终邮箱地址去重，避免同一联系人因多个学生或多个 group 收到重复邮件。

#### 组织公开主页字段

| 字段 | 说明 | 关键规则 |
| --- | --- | --- |
| publicProfileEnabled | 是否开启公开主页 | 默认关闭，Owner/Staff 手动开启 |
| publicSlug | 公开访问路径标识 | 全局唯一；修改后必须同步更新 dyqr 短链 targetUrl，避免已打印二维码失效 |
| publicDisplayName | 对外展示名称 | 默认等于组织名，可覆盖 |
| publicSummary | 一句话简介 | 纯文本，长度限制 |
| publicLogoUrl | 展示用 logo | 复用现有附件/静态资源存储机制 |

规则：

- 公开主页只读取上述展示字段，不允许查询、拼接或展示任何学生、家长联系方式、活动、排练或 helper roster 数据。
- `publicProfileEnabled` 为否时，公开路由和对应二维码目标必须返回统一的"暂未开放"提示，不泄露组织是否存在（呼应 §5.2 附件下载"统一无权限结果"的既有安全风格）。

#### 招募与待审核提交（近期扩展，详见 §6.7，暂不进入本次 MVP 交付范围）

| 对象 | 说明 |
| --- | --- |
| RecruitmentSubmission | 访客通过招募二维码提交的待审核意向信息 |

RecruitmentSubmission 字段：`id`、`organizationId`、`sourceQrCodeId`（可空，来源二维码）、`studentName`、`contactName`、`contactEmail`、`contactPhone`（可选）、`interestedGroupId`（可选）、`note`（可选）、`status`、`reviewedByMembershipId`、`reviewedAt`、`resultStudentId`、`resultHouseholdId`（批准后关联的正式记录，拒绝时为空）、`submittedAt`。

状态机：`submitted → approved | rejected`。"疑似重复"作为拒绝时的可选原因值，不单独设状态，保持状态机精简。

规则：

- 提交本身不认证，只能写入这一张表，不能读取组织任何既有数据。
- 批准操作必须复用本节已有的邮箱归并去重规则，不能因同一家庭重复扫码提交而创建重复 Household/Student；批准操作必须幂等。
- 批准后新建 Student 默认状态为 `interested`。
- 提交速率、单一 IP/邮箱短时间重复提交必须有限流和 Turnstile 保护。
- 每次提交、批准、拒绝都进入 audit trail。

### 5.2 活动、更新与附件

| 对象 | 说明 |
| --- | --- |
| Event | 活动、工作坊、演出、比赛或其他组织日程 |
| EventUpdate | 挂在 Event 下的公告或变更说明 |
| Attachment | 由 staff 上传、受权限控制的文件 |
| EventForm | 活动下的固定场景填写表单 |

Event 至少包含：标题、类型、描述、开始时间、结束时间、组织时区下的显示时间、地点、目标 group、状态、创建人和更新时间。

Event 状态：

- `draft`：仅 staff 可见，尚未进入家长日程。
- `published`：对目标受众可见，可显示在日历和未来 30 天列表。
- `cancelled`：活动已取消，仍保留历史记录并显示取消状态。
- `completed`：活动结束，仅保留历史查询和更新记录。

EventUpdate 状态：

- `draft`：staff 正在编辑。
- `published`：显示在活动详情页；是否发送邮件由 staff 明确选择。

发布后的 update 可以编辑，但编辑不会自动再次发送邮件；staff 必须再次明确执行发送。每次发布、修改、发送和失败都进入 audit trail。

附件要求：

- 文件存储在私有 R2 bucket，不使用公开 URL。
- 下载请求必须经过当前用户、组织和活动受众授权。
- 页面显示文件名、类型、大小和上传者。
- 过期或无权限的下载请求返回统一的无权限结果，不泄露文件是否存在。

### 5.3 固定场景表单

首版不做通用表单设计器，每个活动最多配置一个主表单，支持以下固定场景：

- RSVP/出席确认。
- 家长志愿者报名。
- 固定选项选择。
- 备注或简单文本回答。

规则：

- 表单归属于一个 Event，只能被该活动受众中的 parent 查看。
- 一个 parent 对同一表单默认只有一份有效提交，可以在截止前修改。
- Staff 可以查看提交结果、导出结果并关闭表单。
- 表单关闭后 parent 只能查看自己的提交，不能继续修改。
- 表单提交、修改和关闭都记录审计事件。

### 5.4 排练与 helper roster

| 对象 | 说明 |
| --- | --- |
| RehearsalSeries | 每周重复的排练规则 |
| RehearsalOccurrence | 某个具体日期的排练实例 |
| RosterAssignment | 某个 occurrence 上的 helper 分配 |
| SwapRequest | parent 发起的换班申请 |

RehearsalSeries 至少包含：星期、开始/结束时间、地点、目标 group、所属 term、每次所需 helper 数量和启用状态。

规则：

- 系统仅在启用的 Term 范围内生成 occurrence。
- 每个 occurrence 可以被 staff 单独调整或取消，不改变整个 series。
- 默认自动分配使用 active 学生对应的 eligible household 做可预测的轮换；不在 MVP 中收集复杂的家长可用时间。
- Staff 可以编辑 helper 数量、替换人员和锁定某次安排。
- Parent 可以查看与自己相关的排练和值班。
- Parent 发起换班后，正式 roster 保持原样，直到 staff 批准。
- Staff 可以批准或拒绝换班；系统通知申请人和受影响的联系人，并记录审计。

SwapRequest 状态：

`requested → approved | declined | cancelled`

### 5.5 通知与审计

通知分为两层：

1. 站内通知：保存通知记录、未读状态、关联对象和跳转目标。
2. Email：对邀请、magic link、发布更新、排练/值班变更和换班结果发送事务或运营邮件。

邮件发送要求：

- Staff 选择 group 后，系统解析当前有效联系人并按邮箱去重。
- 发送前保存受众快照，避免之后成员变更导致无法解释历史发送对象。
- 发送过程异步处理，支持重试、失败记录和死信处理。
- audit trail 记录操作者、操作类型、对象、目标 group、去重后收件人数、发送任务状态和时间。
- 需要完整运营触达的邮件与可选通知的邮件必须在产品上区分，家长可以管理非必要运营邮件偏好，但不能阻断账号登录和安全类邮件。

AuditEntry 至少包含：组织、操作者、操作、对象类型、对象 ID、发生时间、必要的变更摘要和请求追踪 ID。普通 staff 不能删除审计记录。

### 5.6 器材与资产管理（近期扩展，详见 §6.8，暂不进入本次 MVP 交付范围）

轻量版：只做只读展示，不做借还流程和维修记录。

| 对象 | 说明 |
| --- | --- |
| Asset | 组织持有的可追踪物品（乐器、制服等），挂一个二维码 |

Asset 字段：`id`、`organizationId`、`name`、`type`（如乐器/制服）、`serialNumber`（可选）、`currentHolderStudentId`（可空，Staff 手工维护的展示字段）、`notes`（自由文本）、`qrCodeId`、`status`。

状态机：`active | retired`。

规则：

- `currentHolderStudentId` 由 Staff 直接编辑，不驱动任何状态转换，也不产生借还流程。
- 物品标记 `retired` 后对应二维码转为下线提示，不能继续展示为"可查看"。
- 即便未来扩展为完整版（借还状态机 + 维修记录 + 责任人变更审批），维修记录也只保留自由文本备注，不做结构化金额字段，避免滑向财务/赔偿边界。

### 5.7 二维码与外部集成

everband 通过 dyqr.me（外部服务，见 §8.5）生成和管理动态二维码。三个二维码场景（组织入口、成员招募、器材查看）共用同一个领域对象。

| 对象 | 说明 |
| --- | --- |
| QrCode | 挂在某个 everband 实体上的动态二维码 |

QrCode 字段：`id`、`organizationId`、`targetType`（`org_entry | recruitment | asset`）、`targetObjectId`、`dyqrAlias`（dyqr 短链 alias）、`currentTargetUrl`（当前跳转目标，用于展示和排查）、`status`、`createdByMembershipId`、`createdAt`、`updatedAt`。

本版本只会创建 `targetType = org_entry` 的记录；`recruitment` 和 `asset` 枚举值提前定义，待 §5.1/§5.6 对应场景排期后再实际创建。

状态机：`active | disabled | broken`（`broken` 表示对应 dyqr 短链在 dyqr 侧已被删除或持续报错，无法继续跳转，需要 Staff 重新生成）。

规则：

- QrCode 必须归属一个组织和一个明确的目标类型 + 目标对象；目标对象被删除、归档或下线时，对应 QrCode 必须转为 `disabled`，或改写 targetUrl 指向"内容已下线"说明页，不能让已打印二维码指向 404 或无提示失败。
- 创建、更新 targetUrl、禁用/重新启用都必须写入 audit trail。
- dyqr 侧扫描统计通过轮询同步展示（dyqr 无 webhook），不作为强一致实时数据，页面须标注最后更新时间。
- dyqr 平台账号的套餐配额是全部组织共享的；需要 everband 自己对单组织的二维码创建速率/总量设软性上限，防止一个组织耗尽平台共享配额（具体数值见 §14 待确认事项）。

## 6. 核心用户流程

### 6.1 Organization Owner 建立组织

1. Owner 通过 Landing page 进入创建组织入口。
2. 完成邮箱 magic link/OTP 验证。
3. 填写组织名称、组织类型、默认时区和基本联系方式。
4. 配置 school terms。
5. 邀请其他 staff。
6. 选择手工录入或 CSV 导入成员。
7. 检查导入预览和错误行。
8. 确认导入，生成学生、家庭和待邀请联系人。
9. 发送 parent 邀请。

完成标准：组织拥有一个 term 或明确选择稍后配置，且 owner 能看到成员和活动管理入口。

### 6.2 CSV 导入学生与家庭

支持模板下载、文件选择、解析预览和确认导入。

首版建议字段：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| studentName | 是 | 学生姓名 |
| contactName | 是 | 成人联系人姓名 |
| contactEmail | 是 | 成人联系人邮箱 |
| relationship | 是 | 与学生关系 |
| status | 否 | 默认 `active`，可使用支持的学生状态 |

校验要求：

- 邮箱格式、学生姓名和联系人姓名必须校验。旧模板的 `groupName` 继续兼容并校验，但新模板不再生成该列。
- 同一文件内的重复行要明确提示。
- 与现有数据的匹配优先使用规范化邮箱，再结合学生姓名和联系人关系辅助提示。
- 导入必须支持部分成功：合法行进入导入任务，错误行保留错误原因，不允许静默跳过。
- 导入结果显示创建、更新、跳过和失败数量，并写入 audit trail。
- 大文件导入进入异步任务，页面显示任务状态，不阻塞浏览器请求。

### 6.3 Parent 登录并查看活动

1. Parent 打开邀请链接或登录页。
2. 输入邮箱并完成 magic link/OTP 验证。
3. 如果账号属于多个组织，选择要进入的组织。
4. 首页默认显示与该 parent 相关的未来 30 天已发布活动。
5. Parent 打开活动详情，查看描述、地点、时间、更新列表和附件。
6. 如果有开放表单，完成 RSVP 或志愿者报名。

可见性要求：

- 只显示 parent 相关学生所在 group 的活动，以及明确标记为组织范围的活动。
- 不能通过 URL 参数、缓存或附件地址访问其他组织或其他 group 的内容。
- 活动列表使用组织时区计算未来 30 天范围。

### 6.4 Staff 创建活动并发布更新

1. Staff 创建 Event 草稿。
2. 填写活动信息并选择一个或多个目标 group，或选择整个组织。
3. 可选上传附件并配置一个固定场景表单。
4. 发布 Event，使其进入 parent 的活动列表。
5. 创建 EventUpdate 草稿。
6. 预览 update、附件和目标受众。
7. 发布 update。
8. 明确选择是否发送邮件。
9. 邮件任务进入队列，页面显示 queued/sent/failed 状态。
10. Staff 在活动和审计记录中查看发布及发送结果。

### 6.5 Rehearsal roster 与换班

1. Staff 设置组织时区和 Term。
2. 创建每周重复的 RehearsalSeries。
3. 系统在 term 范围内生成 occurrence。
4. 根据 active 学生对应的 eligible household 自动轮换 helper。
5. Staff 检查并调整 roster。
6. Parent 在首页或排练页面查看自己的 assignment。
7. Parent 发起 SwapRequest 并填写说明。
8. Staff 审核请求。
9. 批准后更新 roster，通知受影响联系人；拒绝后保留原分配。

### 6.6 组织公开主页与入口二维码

1. Owner/Staff 在 Settings 中开启公开主页，系统按组织名称生成默认 `publicSlug`（可修改）。
2. 填写对外展示名称、简介、logo，预览效果。
3. 系统用平台 dyqr 账号创建短链，`targetUrl` 指向该组织的公开主页地址，生成对应 `QrCode` 记录。
4. Staff 下载二维码（SVG/PNG），用于线下物料。
5. Staff 后续修改展示名称/简介/logo 时，二维码图案和 dyqr 短链都不需要变化，公开主页内容直接更新。
6. 若 Staff 修改 `publicSlug`，系统必须同步更新 dyqr 短链的 `targetUrl`。
7. Staff 可随时关闭公开主页；关闭后公开主页路由本身返回统一"暂未开放"提示，dyqr 短链保持不变。

完成标准：组织能生成至少一个有效的入口二维码，扫码后能看到当前公开信息；关闭主页后原二维码访问统一显示不可用提示，不泄露组织是否存在。

可见性要求：公开主页不需要登录即可访问，但只能展示已定义的展示字段，不能通过该页面的任何链接、接口或调试信息间接触达学生/家长/活动数据。

### 6.7 成员招募二维码与审核（近期扩展，暂不进入本次 MVP 交付范围）

1. Staff 在 Members 页开启招募入口，可选预设目标 group。
2. 系统生成招募表单页面 URL 及对应二维码（`QrCode`，目标类型 `recruitment`）。
3. Staff 下载二维码，线下张贴/分发。
4. 访客扫码，无需登录，填写学生姓名、联系人姓名、邮箱、可选电话与备注，提交。
5. 系统校验必填字段与邮箱格式，经 Turnstile 校验后生成 `submitted` 状态的 RecruitmentSubmission，向提交人发送"已收到，等待审核"确认邮件（不含任何组织内部数据）。
6. Staff 在待审核列表查看提交，可编辑纠错、按规范化邮箱与已有数据比对疑似重复。
7. Staff 批准：创建或复用 Household/AdultContact，创建 Student（默认 `interested`），可选加入指定 group，按 §3.3 邀请流程发送加入邀请。
8. Staff 拒绝：记录原因，不创建任何正式成员数据。
9. 每次生成、提交、批准、拒绝写入 audit trail。

完成标准：组织可生成至少一个有效招募二维码；提交不产生正式成员数据直到 Staff 批准；Staff 能在一个列表里区分待审核/已批准/已拒绝，并追溯每条提交最终对应的 Student/Household（如有）。

可见性要求：表单页面只能写入，不能读取组织任何既有数据；批准/拒绝只能由 Staff/Owner 执行。

### 6.8 器材二维码查看（近期扩展，暂不进入本次 MVP 交付范围，轻量版）

1. Staff 创建器材记录，填写名称、类别、编号，可选填当前持有学生。
2. 系统生成 `QrCode`（目标类型 `asset`），Staff 下载二维码贴在实物上。
3. 任何人扫码进入只读详情页，看到名称、类别、当前持有人（如已填写）、Staff 联系方式。
4. Staff 更新当前持有人时，无需重新打印二维码，页面内容自动更新。
5. 物品退役时 Staff 将其标记为 `retired`，二维码转为下线提示。

完成标准：Staff 能为器材生成二维码并随时更新展示信息；扫码页面不提供任何写操作入口。

可见性要求：详情页对外公开，但只能展示 Staff 主动填写的器材字段，不能关联展示学生的其他信息（如所在 group、联系方式）。

## 7. 页面与信息架构

### 7.1 Landing page

首发使用英语，文案和组件保留国际化能力。页面以静态内容为主，包含：

- Home：一句话价值主张、核心问题、创建组织 CTA。
- How it works：成员、活动、排练和通知的工作流。
- Use cases：Community Band、Baseball Team、Football Team、Community Club。
- Features：成员管理、活动更新、家长协作、值班和审计。
- Privacy & Safety：成人账号、权限隔离、私有附件和未成年人数据最小化原则。
- Contact/Start：创建组织或联系产品团队的入口。

Landing page 不展示尚未实现的器材、学生账号、公开活动，以及 invoice、在线支付等完整财务能力。

### 7.2 应用站

#### Parent 导航

- Overview：按月展示有权限访问的活动和排练。
- Events：活动列表和活动详情。
- Rehearsals：排练和自己的 helper assignment。
- Notifications：站内通知和未读状态。
- Account：邮箱和通知偏好；组织切换器位于侧栏顶部。

#### Staff 导航

- Overview：当月活动与排练月历，以及学生、活动、待换班和公费统计。
- Members：Households、Students 和 Contacts。
- Events：活动、updates、附件、表单和受众。
- Rehearsals：series、occurrence 和 helper roster。
- Finance：轻量公费账本、当月收支和余额。
- Notifications：站内通知和未读状态，位于侧栏底部工具区。
- Settings：General、Staff & access、Terms、Public profile、Data import 和 Email delivery。

所有页面必须支持移动端浏览；staff 的复杂表格和批量操作优先保证桌面体验，同时提供移动端可用的核心查看和审批流程。

## 8. 技术架构约束

### 8.1 Monorepo

仓库至少包含：

```text
apps/
  landing/          # 静态产品站
  app/              # TanStack Start 应用站
packages/
  domain/           # 领域类型、状态和不依赖运行时的业务规则
  validation/       # 输入和导入校验
  ui/               # 两个应用共享的设计系统和组件
  config/           # TypeScript、格式化、测试和环境配置
  integrations/     # 第三方服务客户端封装（如 dyqr.me 二维码/短链客户端）
```

具体目录可以在初始化工程时调整，但必须保持 Landing page 与应用站可以独立构建和部署，共享包不能反向依赖任一应用。

### 8.2 Cloudflare 服务分工

- [Workers](https://developers.cloudflare.com/workers/)：TanStack Start 应用运行时、服务端函数、鉴权、授权和文件访问代理。
- [D1](https://developers.cloudflare.com/d1/)：关系型业务主数据。首版使用共享数据库加 `organizationId` 租户隔离，不把每个组织拆成独立数据库。
- [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)：私有附件和导入原文件；文件 key 必须包含组织和对象上下文。
- [Queues](https://developers.cloudflare.com/queues/)：CSV 导入、邮件 fan-out 和重试；失败任务进入死信队列或等价的可观察失败状态。
- [Workflows](https://developers.cloudflare.com/workflows/get-started/guide/)：活动提醒、排练展开等跨请求、可重试和可恢复的任务。
- [Email Service](https://developers.cloudflare.com/email-service/)：magic link/OTP、邀请和事务邮件。Email Sending 当前在官方文档中标注为 Beta，正式上线前必须核查计划、限制、费用和发信域名配置。
- [Turnstile](https://developers.cloudflare.com/turnstile/get-started/)：Landing page 联系、公开组织创建入口，以及成员招募表单提交的反滥用保护。
- Workers Logs/Web Analytics：运行时错误、请求、性能和 Landing page 使用数据。

Durable Objects、Workers AI、Vectorize、实时通信和外部数据库不属于 MVP 的默认依赖。只有出现明确的强一致协作、AI 搜索或实时通信需求时才重新评估。

### 8.3 TanStack 约束

- 应用站采用 TanStack Start，并锁定经过验证的版本。
- 使用 TanStack Router 的文件路由和类型安全导航。
- 使用 TanStack Query 管理服务端状态、缓存和失效策略。
- 表单使用共享运行时校验和类型推导，前后端不能各自维护一套字段规则。
- Cloudflare Worker 的 bindings 和 secrets 必须按请求上下文读取，不能在模块初始化阶段缓存请求相关环境。
- 必须保留 TanStack Start 升级兼容性测试；如果 RC 版本造成部署阻塞，优先把共享领域层和 Worker API 保持独立，便于替换应用运行时。

### 8.4 数据隔离和安全

- 所有组织拥有的数据表包含 `organizationId`。
- 所有查询、写入、文件读取和异步任务都必须从服务端上下文确认组织权限。
- 不能仅依赖客户端提交的 `organizationId`。
- R2 文件由 Worker 授权后流式返回，不生成长期公开链接。
- Magic link/OTP、邀请和表单提交必须有过期、一次性使用和频率限制。
- 记录发送收件人快照，但不在普通应用日志中写入完整敏感内容。
- 不把未成年人账号、密码、医疗信息或不必要的敏感字段加入 MVP。
- 数据删除、导出、保留期限和隐私声明需要在正式上线前完成产品与法律审查。
- 产品首发面向澳洲，但不对外承诺澳洲数据驻留；Cloudflare 服务的位置能力不能直接等同于法律上的驻留承诺。
- dyqr.me 平台级 bearer token 是账号级全权限凭证（无 scope 限制），必须用 Secrets Store 等价加密机制保存，不能写入业务表、应用日志、审计事件或前端响应；访问权限只限服务端集成模块代码，不通过任何 API 或界面向 Owner/Staff/Parent 暴露。
- 所有对 dyqr API 的写操作（创建/更新/禁用二维码）必须在 everband 侧记录 `organizationId`、actor 和时间，因为 dyqr 侧日志无法反查调用方所属的 everband 组织。

### 8.5 外部服务集成：dyqr.me（动态二维码）

- dyqr.me 是独立于 Cloudflare 官方服务的第三方外部依赖，用于生成和管理动态二维码与短链，不并入上述 Cloudflare 服务分工。
- 集成方式：服务端通过 `@dyqr/sdk`（`DyqrClient`）调用 dyqr REST API；SDK 类型覆盖不全时（如需要 campaigns、完整 stats 字段）直接 fetch REST 端点，携带同样的 `Authorization: Bearer` 头。
- 鉴权模型：dyqr 没有服务级 API Key，鉴权走 OAuth device authorization。everband 采用平台统一账号模型——由 everband 运营方使用已获准的 `dyqr-cli` client_id 一次性完成 device flow 登录，获得一个平台级 bearer token，作为 Cloudflare Secrets Store 中的单一环境密钥保存，代表 everband 平台整体调用 dyqr API；不是按组织各自连接账号，Owner/Staff 不需要完成任何 dyqr 授权步骤。
- 各组织的二维码在这一个 dyqr 账号下，通过 everband 自己的 `QrCode` 记录（见 §5.7）做归属区分，dyqr 侧不感知 everband 的组织边界。
- 二维码架构：QR 图案直接编码 dyqr 短链地址（`https://dyqr.me/{alias}`），由 dyqr 负责真正的跳转；dyqr 短链的 targetUrl 指向 everband 自己域名下的稳定路由（如组织公开主页）。这一架构下，已分发二维码物料的可用性直接依赖 dyqr.me 服务本身（见 §14 待确认事项）。
- 降级要求：dyqr.me 不可用时，不能阻塞任何核心运营流程（组织、成员、活动、排练、通知）；受影响的只应是"生成新二维码/更新展示样式/刷新扫描统计"这几项功能，须优雅提示"暂不可用"。

## 9. 核心接口和状态约束

首版不承诺对外开放公共 API。应用内部使用类型安全的 server functions/route handlers，业务规则集中在共享 domain 层。

核心对象：

```text
Organization
User
Membership
Household
Student
Group
Term
Event
EventUpdate
Attachment
EventForm
RehearsalSeries
RehearsalOccurrence
RosterAssignment
SwapRequest
Notification
AuditEntry
QrCode
```

必须实现的状态约束：

- Membership：`invited | active | suspended | removed`；`role: owner | staff | parent` 为基础身份，`staffAccess` 为叠加授权位；仅 Owner 可授予/撤销 `staffAccess`、transfer owner（目标须为 active 且具备 staff 权限，转移后原 Owner 变 Staff）。
- Student：`interested | active | withdrawn | archived`；业务实体软删除用 `deletedAt`。
- Event：`draft | published | cancelled | completed`。
- EventUpdate：`draft | published`。
- EventForm：`open | closed`。
- SwapRequest：`requested | approved | declined | cancelled`。
- QrCode：`active | disabled | broken`。
- 异步任务：至少可以区分 `queued | processing | succeeded | failed`。
- Student 可以不分组；退出或归档后必须从当前运营受众中排除。
- 组织、成员、活动、排练、表单、邮件和换班的关键写入必须产生审计记录。
- CSV 导入、邮件发送和换班审批必须幂等；同一个命令重试不能产生重复学生、重复提交或重复邮件。
- QrCode 必须归属一个组织且指向明确的目标类型和目标对象；目标对象下线时对应 QrCode 必须转为 `disabled` 或改写为下线说明页。

## 10. 非功能需求

### 10.1 响应式和可访问性

- Parent 的查看、表单、通知和换班流程必须在手机窄屏完成。
- Staff 的表格、筛选和批量导入必须在桌面端清晰可用。
- 关键流程支持键盘操作、可见焦点、语义化表单标签和清晰错误信息。
- 目标为 WCAG 2.2 AA 的核心交互基线；无法满足的部分必须记录原因和后续处理。

### 10.2 可观察性

- 所有异步任务有可查询的状态。
- 发送失败、导入失败、权限失败和附件访问失败可在服务端日志中定位。
- 日志使用 request ID、organization ID 和对象 ID 关联上下文，但避免记录 OTP、完整邮件正文和不必要的未成年人信息。
- 产品提供 staff 可见的邮件发送历史，不把“任务已进入队列”错误显示为“邮件已送达”。

### 10.3 一致性与恢复

- D1 是业务主数据的唯一事实来源。
- 队列消费者必须支持重试和幂等。
- 公开请求和发送任务不能因为单个收件人失败而丢弃整批状态。
- 发布 update 和记录发送任务的关键事务必须具有明确的成功/失败边界。
- 任何迁移、导入和生产数据操作都必须有版本和回滚/恢复说明。

## 11. 验收标准

### 11.1 组织与成员

- Owner 可以创建组织、设置时区和配置 term；新成员可以不分组。
- Staff 可以导入 CSV，查看预览、错误行、重复提示和最终导入结果。
- 一个学生可以关联多个联系人，一个联系人可以关联多个学生。
- Group 管理、成员 Group 筛选和新日程 Group 控件不出现在当前 UI，旧限定受众不会被扩大。
- withdrawn/archived 学生不会出现在当前运营邮件受众中。
- 未邀请或被移除的 parent 不能登录并访问组织数据。

### 11.2 活动与通知

- Staff 可以创建全组织草稿活动并发布；编辑旧活动不会改变既有限定受众。
- Parent 只能看到自己有权访问的未来 30 天活动。
- Staff 可以在活动下创建、预览和发布 update，并上传附件。
- Parent 可以查看 update 列表并下载有权限的附件。
- Staff 可以明确选择是否向目标 group 发邮件。
- 多个学生或多个 group 指向同一个邮箱时，该邮箱只收到一封同一发送任务的邮件。
- 发送任务、失败和重试状态可查询，且每次操作都有 audit trail。

### 11.3 排练与换班

- Staff 可以配置每周重复排练和 term 范围。
- 系统只在 term 范围内生成 occurrence。
- 系统能自动生成 helper roster，staff 可以调整单次安排。
- Parent 可以查看自己的 assignment 并提交换班申请。
- 未经 staff 批准，换班请求不会改变正式 roster。
- 批准和拒绝都会通知相关人员并写入审计记录。

### 11.4 表单

- Staff 可以为活动开启 RSVP 或志愿者报名表单。
- Parent 只能提交自己相关活动的表单。
- Parent 可以在关闭前修改自己的提交。
- Staff 可以查看结果并关闭表单。
- 关闭后不能新增或修改提交。

### 11.5 安全与隔离

- 通过改变 URL、请求参数、缓存键或附件地址，不能访问其他组织或无关 group 的数据。
- 组织 Owner、Staff 和 Parent 的读写权限分别符合角色定义。
- 所有 private attachment 的下载都经过服务端授权。
- 审计记录不能由普通 staff 删除或篡改。
- 登录链接、邀请链接和 OTP 不可重复使用。

### 11.6 组织公开主页与二维码

- Owner/Staff 可以开启/关闭公开主页，编辑展示字段。
- 关闭公开主页后，公开页面与二维码目标返回统一的"未开放"提示，不泄露组织是否存在。
- 公开主页不展示任何学生、家长联系方式、活动或排练信息。
- Staff 可以生成、下载（SVG/PNG）、更新组织入口二维码；已打印的二维码在更新公开信息后无需重新打印即可生效。
- 组织修改 `publicSlug` 后，系统同步更新 dyqr 短链的 targetUrl，避免已打印二维码失效。
- dyqr.me 不可用时，除"生成新二维码/刷新统计"外的核心运营流程不受影响。

## 12. 测试计划

### 12.1 单元测试

- 学生状态转换和 active/group 约束。
- 家庭联系人关系和邮箱归并。
- CSV 字段校验、重复检测、部分成功和错误结果。
- 活动受众解析、未来 30 天筛选和组织时区边界。
- 邮件收件人去重和受众快照。
- Event/EventUpdate 发布状态转换。
- Term 范围内的重复排练展开，包括跨夏令时边界。
- roster 轮换、手工覆盖和换班状态机。
- 表单开放/关闭和重复提交规则。
- 通知偏好、异步任务幂等和审计记录生成。
- QrCode 目标类型与目标对象的关联校验、目标下线或 publicSlug 变更后的状态转换。
- 组织公开主页展示字段的读写权限和"未开放"降级逻辑。

### 12.2 E2E 测试

1. Staff 创建组织、配置 term、创建 group、导入 CSV 和邀请 parent。
2. Parent 接受 magic link，选择组织并查看未来 30 天活动。
3. Staff 创建活动、发布 update、添加附件、选择 group 并发起邮件发送。
4. Parent 查看 update、下载附件、提交和修改 RSVP/志愿者表单。
5. Staff 生成排练 roster，parent 申请换班，staff 审批，双方看到正确结果。
6. 验证不同组织之间、不同 group 之间和过期邀请之间的数据隔离。
7. 验证移动端核心流程、桌面端 staff 表格、键盘导航和错误提示。
8. Owner 开启组织公开主页，生成入口二维码，访客扫码看到只读介绍页；关闭主页后页面显示统一不可用提示。

### 12.3 工程检查

在实现阶段至少执行：

```text
pnpm run format
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run test:e2e
```

Cloudflare preview smoke test 需要覆盖：Worker 启动、D1 读写、R2 授权下载、队列任务触发和邮件 provider 的测试模式。CI 不得向真实组织或真实联系人发送邮件，也不得对真实 dyqr.me 平台账号发起真实 API 调用或消耗真实配额，dyqr 相关调用必须走 mock/测试替身。

## 13. 成功指标与试点策略

首个试点应先使用一个真实乐队验证工作流，不把所有后续模块同时上线。首版关注以下指标：

- 一个新组织能否在一次 onboarding 中完成 group、term 和成员导入。
- Staff 是否能不依赖外部表格完成一次活动创建、更新发布和邮件发送。
- Parent 是否能在手机上找到未来 30 天活动并完成确认。
- helper roster 是否能减少人工排班和私聊换班。
- 发送记录是否足以支持 staff 解释“发给了谁、什么时候发、是否失败”。
- 试点中发现的问题优先按“数据正确性、权限隔离、通知可靠性、操作效率”排序。

正式推广前必须完成真实 staff 和 parent 的可用性验收、隐私审查、邮件送达率验证和 Cloudflare 生产计划核查。

## 14. 默认假设与待确认事项

### 默认假设

- 一个成人账号可以属于多个组织，组织内权限由 membership 决定。
- 初始组织类型为 Band，底层对象使用通用的 organization/group/event 命名。
- 组织自行维护时区和 school term 日期，不依赖外部学期日历。
- Email 是登录、邀请和事务通知的统一入口，不使用密码和社交登录。
- 发布后的 update 可以编辑，但再次发邮件必须由 staff 明确触发。
- 首发产品和 Landing page 使用英语，PRD 和研发文档默认使用中文。
- 产品首发面向澳洲，但不承诺澳洲数据驻留。
- 二维码架构采用"直接编码 dyqr.me 短链"；已分发物料的可用性直接依赖 dyqr.me 服务本身，这是主动接受的权衡（换取更快上线，代价是更强的外部依赖）。
- dyqr 采用平台统一账号模型：everband 运营方用已获准的 `dyqr-cli` client_id 一次性完成 device flow 获取平台级 token，不需要 dyqr 侧新增 client_id 白名单。
- 二维码物料的制作与张贴（海报、横幅、器材标签）由组织自行线下完成，everband 只提供可下载的 SVG/PNG，不提供打印/物流服务。
- 成员招募和器材管理的详细流程已在本次设计中确定（§4.3、§5.1/§5.6、§6.7/§6.8），但均不在本次 MVP 交付范围内，待后续排期时直接转正。
- 成员招募一旦排期实现，必须采用"提交待审核、Staff 批准后才创建正式 Student/Household 记录"的信任模型，不允许扫码即直接创建正式成员数据。

### 正式上线前待确认

- Cloudflare Email Service Email Sending Beta 是否满足正式发信需求，以及实际费用、域名验证和送达率方案。
- 澳大利亚未成年人数据、隐私声明、删除/导出和保存期限的法律审查结果。
- School term 的默认录入体验和组织管理员的维护责任。
- helper roster 中 eligible household 的具体排除规则。
- 试点组织是否需要数据导出、历史数据导入或与现有日历并行运行。
- dyqr 平台账号套餐的具体配额（links 总量、月点击数等）是否够覆盖预期组织规模——配额数值只存在于 dyqr 运营后台配置，代码中无默认值，需直接核查当前生效档位。
- dyqr.me 平台账号登录凭证的归属和留存 SOP（谁持有、离职/换人时如何交接）——这个账号是全平台共享的关键依赖。
- 平台共享配额下，是否需要为单组织设置二维码创建软性上限，防止一个组织耗尽全平台额度；具体数值待定。
- dyqr.me 目前没有可查证的 SLA 或运行时间承诺，是否需要在物料上同时提供人工兜底联系方式。
- dyqr 的 bearer token 没有细粒度 scope，一旦泄漏可读写该账号下全部短链（覆盖所有 everband 组织），需评估这一风险是否可接受。
