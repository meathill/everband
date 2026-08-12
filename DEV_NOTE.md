# DEV_NOTE

开发过程中需要长期关注的决策与基建知识。

## 技术栈与版本（M1 验证组合，2026-08）

- Node >= 24（可直接运行 .ts），pnpm 11，TypeScript 7（tsgo 原生版）
- TanStack Start 1.168 + Router 1.170（2026-03 已 1.0 稳定）
- Vite 7.3 + @cloudflare/vite-plugin 1.51 + Wrangler 4.119
- Tailwind CSS 4.3（无 config 文件，css-first）
- Drizzle ORM 0.45 + drizzle-kit；Biome 2.5；Vitest 4.1；zod 4

升级任一"五件套"（react-start/react-router/vite/@cloudflare/vite-plugin/wrangler）需走独立分支跑全量检查。

## 关键决策

- **认证自研**（不用 better-auth）：PRD 认证面窄（仅 magic link/OTP），复杂度在多组织 membership 模型，better-auth 的 org 插件与领域模型冲突。
- **drizzle-kit 只 generate 不 push**：迁移 SQL 输出到 `apps/app/migrations`，用 `wrangler d1 migrations apply`（本地 `--local`，生产 `--remote`）执行，保证可审计可回滚。drizzle 配置在 `packages/db/drizzle.config.ts`。
- **schema 独立成 `packages/db`**：app 与 tasks 两个 Worker 共同依赖，避免 tasks 反向 import app。
- **包导出 TS 源码**：packages/* 的 exports 直接指 `./src/*.ts`，由消费方 vite 编译，不做包级构建。
- **依赖方向**：apps → packages；validation → domain；其余包互不依赖。db 查询函数一律 `organizationId` 首参。

## 设计系统（DYQR Design System，emerald 默认）

来源：claude.ai/design 项目 `019e3015-38ab-7ce9-bd70-426f31bcf7a3`。token 层在 `packages/ui/src/styles/colors-and-type.css`（含 shadcn/coss-ui 变量兼容层），应用只 import `@everband/ui/styles/globals.css`。

设计红线：

- 禁 emoji、禁渐变背景、禁左侧色条卡片、禁按钮 hover scale（press 用 `active:scale-[0.98]`）
- 禁裸 hex / 裸 px——一律 token（`var(--...)` 或映射后的 Tailwind 工具类）；字体只用 Geist / Geist Mono / Noto Sans SC
- 圆角：输入/按钮 8px（rounded-md）、卡片 12px（rounded-lg）、marketing tile 16px、modal 20px
- 图标只用 @phosphor-icons/react regular weight，导入重命名为 `XxxIcon`，尺寸 16/20/24/32
- 英文文案 sentence case、无叹号、按钮动词开头；数字用 tabular-nums
- 焦点可见：3px `--ring` halo，禁止裸 `outline: none`
- 主题切换：`<html data-theme="dark|amber|midnight">`，默认 emerald

## M2 落地的认证/测试基建

- **认证核心在 `apps/app/src/server/auth-core.ts`**：只依赖 db 的可测函数（token 原子消费、OTP 计数、membership 查询）。server functions 是薄封装。改认证逻辑先改 core + 测试。
- **一次性使用的落实方式**：`UPDATE ... WHERE consumed_at IS NULL` 的受影响行数判断，不是先查后写。OTP 上限同理（`attempt_count < MAX` 在 WHERE 里）。
- **@cloudflare/vitest-pool-workers 0.20（vitest 4）用插件 API**：`cloudflareTest({ miniflare: {...} })` 放 vite plugins，不再是 `defineWorkersConfig`/`poolOptions`。迁移用 `readD1Migrations` + setup 里 `applyD1Migrations`。
- **Playwright**：webServer 复用 3000 端口 dev server；mobile project 用 Pixel 7（Chromium 内核，避免下载 WebKit）。e2e 从 /dev/outbox 提取 magic link。
- **cloudflare:workers 的 env 类型**：`src/server/env.d.ts` 手工声明（ambient module 内 import type），不引入 workers-types 全局，避免与 DOM lib 冲突。绑定变更要同步该文件与 wrangler.jsonc。
- **TanStack Start 细节**：server fn 校验器叫 `.inputValidator()`；cookie/请求助手从 `@tanstack/react-start/server` 导入（getCookie/setCookie/getRequestIP/getRequestUrl）；vite 需显式 `resolve.alias` 配 `~`（vite 7 无 tsconfigPaths 选项）。

## M4 落地的异步任务基建

- **业务核心在 `packages/core`**（@everband/core）：app 与 tasks 共享（members/auth/audit/import），只依赖 db/domain/validation。新的队列消费者逻辑一律写在 core，tasks 只做绑定与消息编排。
- **本地 Queues 全链路**：apps/app 的 vite `cloudflare({ auxiliaryWorkers: [{ configPath: "../tasks/wrangler.jsonc" }] })` 同时拉起 tasks worker，dev 环境队列投递真实生效。改 tasks 绑定后需重启 dev server。
- **CSV 导入幂等**：任务级 dedupKey =`orgId:sha256(文件内容)` UNIQUE；行级 UNIQUE(jobId,rowNumber) + onConflictDoUpdate；消费前 claim（queued|processing → processing）。消费者对不可重试错误（文件缺失）ack + 标记失败，可重试错误 retry → DLQ。
- **server fn 校验器已换回 `.validator()`**：`.inputValidator()` 在当前版本已弃用（d.ts 与运行时警告不一致，以运行时为准）。

## M9 落地的对外集成

- **dyqr 封装**：`packages/integrations/src/dyqr`，`ShortLinkService` 接口 +
  `DyqrShortLinkService`（@dyqr/sdk 包装，错误统一 ShortLinkError）+ `MockShortLinkService`
  （dev/CI，内存实现 + 占位 SVG）。`DYQR_MODE=mock|dyqr`，token 只经 env（Secrets Store），
  所有写操作 everband 侧记 audit。slug 变更先同步 dyqr targetUrl 再落库，dyqr 不可用则
  放弃变更（保护已打印二维码）。
- **公开主页安全模式**：`getPublicPage` 只返回展示字段白名单；关闭/不存在统一返回 null →
  同一"暂未开放"页（与附件统一 404 同风格）。
- **Turnstile**：dev 用官方测试 key（1x000…AA 恒通过），生产替换 landing 的
  `TURNSTILE_SITE_KEY` 常量与 wrangler `TURNSTILE_SECRET`。
- **限流数值**：登录 email 3/10min（主力）、IP 30/10min（NAT 友好；也避免 e2e 自我踩踏）。
- **移动端触控热区**：coss Button 的 `pointer-coarse:after` 扩展热区会在紧凑布局里相互
  遮挡（Playwright mobile 点击被拦截）。紧凑按钮组要么留够间距，要么像 e2e 那样用键盘激活。

## 验收修复轮（2026-08-10，issue 1-5 + staff Overview）

- **受控输入的水合竞态**：React 受控 `<input value={state}>` 在水合完成前的键入会被首个
  受控渲染清空（慢网络真实可复现，Playwright 稳定暴露）。对"落地即填"的关键表单
  （如 /new-org）用非受控 `name` 属性 + FormData 读值。其他表单遇到同类报错照此改。
- **登录回跳机制**：`redirectPathSchema`（packages/validation/src/auth.ts）是防开放重定向的
  单一事实来源（仅站内绝对路径，拒 `//` 与 `/\` 变体）。login/verify 的 validateSearch 用
  `.optional().catch(undefined)` 静默丢弃非法参数；magic link 邮件链接透传 redirect；
  invite 链接不带该参数，激活跳 /o/{orgId} 的行为不变（finishLogin 未动）。
- **404 页**：两站 router.tsx 的 `createRouter({ defaultNotFoundComponent })`。SSR 对未知
  路径返回 404 状态码但正文由客户端水合渲染（curl 看不到文案，浏览器正常）。
- **favicon**：`assets/brand/` 保存图像生成的 PNG 品牌源文件，`scripts/generate-favicon.ts` 将
  它们同步到 `apps/*/public/`，并通过 Pillow 生成 32x32 `favicon.ico`（Vite publicDir → Workers assets）。
  改品牌资产后重跑脚本；页面使用 `favicon.png` 与 `favicon.ico`，不再维护手写 SVG 图标。
- **landing 尾斜杠**：Workers assets 对预渲染目录页返回 `/terms → 307 → /terms/`，正常行为。

## 验收修复轮（2026-08-10，issue 1-5 复验后的第二轮）

- **时间显示必须用组织时区**：输入/存储按组织时区（`localDateTimeToUtcMs`），显示端一律
  `formatOrgDateTime/formatOrgTime`（`packages/domain/src/time.ts`，Intl + timeZone）。
  禁止再用 `new Date(utcMs).toLocaleString()`（浏览器本地时区）——实测悉尼组织 + 非悉尼
  浏览器时，staff 输入 18:00 会显示成 4:00 PM。页面取时区统一走
  `getRouteApi("/o/$orgId").useLoaderData().org.timezone`。
- ~~应用站 header 移动端 flex-wrap~~：已被 2026-08-11 的侧边栏布局取代，见下节。

## 应用站侧边栏布局（2026-08-11，UI 改造 P1）

- **布局**：`OrgLayout` = `SidebarProvider > Sidebar(collapsible="icon") + SidebarInset`。
  顶部两组 nav 全部下沉到侧边栏（主导航 + staff 才有的 Manage 分组），Account 与 Sign out
  进底部用户菜单，org 切换器进顶部。移动端由 sidebar.tsx 自动降级成 Sheet 浮层
  （`useMediaQuery("max-md")`），不再需要 header 换行来防溢出。
- **移动端必须自己收起**：Sheet 是浮层，导航后不自动关闭会盖住新页面。侧边栏内所有
  Link 都挂 `useDismissOnNavigate()`（`isMobile && setOpenMobile(false)`）。
- **激活态用 `useMatchRoute`**：Overview 是父路径，必须 `fuzzy: false`，否则任何子页面
  都会让它高亮。`to` 用窄字符串联合类型（`OrgNavPath`），用 `LinkProps["to"]` 那种宽联合
  会让 `params` 推不出来而报 TS2353。
- **SSR 首屏不闪**：`sidebar_state` cookie 由 `getSidebarOpen` server fn 读出，与
  `getOrgContext`/`listMyOrganizations` 在 loader 里 `Promise.all` 并行。cookie 只能在
  `~/server/*.ts` 的 server fn 里读，不要在 route loader 直接 import
  `@tanstack/react-start/server`（loader 也会跑在客户端）。
- **loader 返回结构是契约**：`{ org, role }` 两个字段名被 7 个子路由的
  `getRouteApi("/o/$orgId").useLoaderData()` 依赖，只可新增不可改名。
- **两个 "Toggle Sidebar"**：`SidebarRail`（装饰性拖拽条，`sm:flex`）和 `SidebarTrigger`
  的可访问名相同，按角色名定位在 ≥640px 会 strict mode 撞车。测试里用
  `[data-slot="sidebar-trigger"]` 定位。
- **别用 `SidebarMenuButton` 的 outline 变体**：它的 shadow 写的是老式
  `hsl(var(--sidebar-border))`，我们的 token 是 oklch，渲染不出来。默认变体没问题。

## 信息架构与轻量账本（2026-08-11）

- **Overview 月份边界只认组织时区**：URL 使用 `month=YYYY-MM`，`monthWindow` 生成 UTC
  半开区间；跨月 Event 通过开始/结束重叠判断进入月历，展示日期再转换回组织本地日期。
- **Group 暂停不等于迁移数据**：导航、筛选和新建控件隐藏；新 Event 强制全组织、新
  Rehearsal 强制 `groupId=null`、新成员允许无分组。旧 `event_groups`、学生 Group 和排练
  Group 仍用于 Parent 读取权限，编辑旧对象不能扩大原受众。
- **Finance 金额使用整数最小货币单位**：组织保存 `currencyCode`（默认 AUD），账本只做
  income/expense、编辑和 void。void 保留记录且不计入余额，每次写入都必须产生 audit。
- **Settings 是运营工具归宿**：Import jobs 位于 Data import，邮件发送记录位于 Email
  delivery；Notifications 只保留站内通知。旧 `/import`、`/groups` 只做兼容重定向。
- **组织 loader 不能 catch-all 后跳 Login**：只把明确的 `unauthenticated` 重定向到登录页，
  `forbidden` 回组织选择页；D1 schema、网络和其他服务端异常必须继续抛出。否则迁移遗漏会被伪装成
  session 失效，用户重复登录也无法恢复。
- **涉及新 schema 的发布顺序**：先应用向后兼容的 D1 migration，再部署读取新字段/表的 Worker，
  最后执行已登录组织页 smoke test。`wrangler d1 migrations list --remote` 必须无待应用项。
- **CI 运行时由 `pnpm/setup` 统一安装**：根 `packageManager` 固定 pnpm 版本，workflow 使用
  `pnpm/setup` 同时安装 pnpm 和 Node runtime，不再叠加 `pnpm/action-setup` 与
  `actions/setup-node`。首次建立版本 pin 需写入 `package.json`，之后 `pnpm self-update` 会更新它。

## 列表页样板（2026-08-11，UI 改造 P2）

分页/排序/搜索的基建：`packages/validation/src/list.ts`（`createListQuerySchema` /
`ListResult` / `toOffset`）+ `apps/app/src/components/data-table/`（`DataTable` /
`DataTableToolbar` / `DataTablePagination` / `useListSearch`）。新列表页照抄下面骨架，
不要再手写 `<table>` 和全量 loader。

```tsx
const listSearchSchema = createListQuerySchema({
  sortFields: ["name", "createdAt"],
  defaultSort: "createdAt",
  defaultOrder: "desc",
}).extend({ status: z.enum(["all", "active", "left"]).default("all").catch("all") });

export const Route = createFileRoute("/o/$orgId/members")({
  validateSearch: listSearchSchema,
  // ⚠️ 最大的坑：漏了 loaderDeps，search 变化不会触发 loader，翻页/排序/搜索全部"点了没反应"
  loaderDeps: ({ search }) => search,
  loader: ({ params, deps }) => listStudents({ data: { orgId: params.orgId, ...deps } }),
  component: MembersPage,
});

function MembersPage() {
  const { items, total } = Route.useLoaderData(); // ListResult<Student>
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const list = useListSearch({
    search,
    onChange: (patch) => navigate({ search: (prev) => ({ ...prev, ...patch }), replace: true }),
  });

  return (
    <div className="flex flex-col gap-4">
      <DataTableToolbar
        searchPlaceholder="Search members"
        defaultQuery={search.q}
        onQueryChange={list.setQuery}
        actions={<Button onClick={openDrawer}>New member</Button>}
      >
        <Select value={search.status} onValueChange={(v) => list.setFilter("status", v)} />
      </DataTableToolbar>
      <DataTable
        columns={columns}
        rows={items}
        rowKey={(row) => row.id}
        sort={search.sort}
        order={search.order}
        onSortChange={list.setSort}
      />
      <DataTablePagination
        page={search.page}
        pageSize={search.pageSize}
        total={total}
        onPageChange={list.setPage}
      />
    </div>
  );
}
```

要点：

- **`loaderDeps: ({ search }) => search` 必须写**。没有它 loader 只在 params 变化时重跑，
  URL 变了但数据不变，表现为"翻页无效"。
- schema 每个字段是 `.default(x).catch(x)`：`default` 让**输入侧**的键可选（否则
  `<Link to="/o/$orgId/members">` 这类不带 search 的跳转过不了类型），`catch` 让用户手改的
  非法参数静默回落而不是抛错。extend 出来的筛选字段照此写。
- server fn 用同一个 schema 校验入参；db 查询返回 `ListResult<T>`（items + total + page +
  pageSize），offset 用 `toOffset(page, pageSize)`，count 与 rows 用 `Promise.all` 并行。
- 工具条搜索框是**非受控**（`defaultValue` + 提交读 FormData + 回车即搜），没有 debounce；
  外部要重置关键词就给 `DataTableToolbar` 挂 `key={search.q ?? ""}`。
- `setQuery` / `setFilter` / `setSort` 都会把 `page` 复位到 1（排序变了还停在第 7 页没有意义）；
  navigate 一律 `replace: true`，列表状态不该塞满前进/后退历史。
- 单页（`total ≤ pageSize`）时 `DataTablePagination` 自己返回 null，页面不用判断。
- 排序列的 `key` 必须落在 `sortFields` 里；表头图标由 DataTable 统一渲染，
  首次点击的方向用列上的 `defaultOrder`（时间列传 `desc`）。
- `validateSearch` 的默认值会被 `<Link>` 序列化进 URL（`/events` 实际落地是
  `/events?page=1&...`），e2e 里对列表页 URL 的断言不能用 `$` 锚（写成
  `/\/events(\?|$)/`），navigation.spec 已按此调整。

## 表单基建（2026-08-11，UI 改造 P3）

写表单统一走 `~/hooks/use-server-form-action.ts` + `~/components/form-drawer.tsx`，
二次确认走 `~/components/confirm-dialog.tsx`。模式（样板见 `groups.tsx`）：

- 非受控输入（`defaultValue`，无 `value`）→ FormDrawer 内 `preventDefault` + FormData →
  调用方组装 server fn 入参 → `submit(...)`；失败错误显示在抽屉内，成功先
  `router.invalidate()` 再 toast + `onSuccess` 关抽屉（列表刷新完才关，避免闪旧数据）。
- drawer 内表单主体用 Frame 分区：每个逻辑区一个 `FramePanel`
  （`FrameHeader > FrameTitle` + 字段），字段配 `field.tsx`。

Base UI Drawer 的关键行为（都验证过）：

- Portal `keepMounted` 默认 false，关闭即卸载 children，非受控表单天然重置——
  这是"非受控 + FormData"红线在 drawer 场景可行的前提。
- `<Drawer position="right">` 即右侧弹出；`DrawerPopup` 已内含 Portal/Backdrop/Viewport。
  默认宽 `max-w-md`，业务侧统一 `className="w-full sm:max-w-lg"` 覆盖。
- popup 自带 `touch-none`：自建滚动容器必须显式 `touch-auto`，否则触屏滚不动；
  `DrawerPanel` 内置 ScrollArea 在 flex 列里撑不开，用 `scrollable={false}` +
  `min-h-0 flex-1 overflow-y-auto` 自己套。
- 开场动画 450ms：e2e/手测量位置要等动画结束（~700ms），否则量到 transform 中间态。
- `ToastProvider` 全站 `position="top-center"`（`__root.tsx`）：默认 bottom-right
  会盖住右侧抽屉的底部操作区（toast z-60 > drawer z-50，点击会被吃掉）。
- **快速重开的残留 state**：Portal 在关闭动画（450ms）结束后才卸载 children，动画期间
  再次打开（取消后立刻新建、从一行编辑切到另一行）子树不会重挂。FormDrawer 内部用
  实例计数 key 强制每次「关 → 开」重挂 `DrawerPanel`，"关闭即重置"因此始终成立，
  业务侧无需处理。
- Base UI 的 `FieldDescription` 必须有 `Field` 祖先，否则抛 `FieldRootContext is missing`。

Base UI Menu（`menu.tsx`）的两个易踩点：

- MenuItem 的触发回调是 `onClick`（`closeOnClick` 默认 true），**没有 onSelect**——写 `onSelect` 会被静默丢弃。
- `MenuGroupLabel` 必须包在 `<MenuGroup>` 里，否则抛 `MenuGroupContext is missing`。

Base UI ToggleGroup 的受控方式（2026-08-12 踩坑）：

- group 内 item 的 pressed 状态由 item 的 `value` + group 的 `value`/`onValueChange` 决定，
  **item 上的 `pressed` prop 会被忽略**（aria-pressed 恒为 false，视觉上永远"未选中"）。
  多选筛选要写成 `value={[...set]} onValueChange={(v) => set(new Set(v))}`。
  注意 `onValueChange` 的回参类型是 `string[]`，需要自行断言成联合类型。

## e2e 的水合等待（2026-08-11）

侧边栏让应用主包变大后，dev server 下"页面刚出现就操作"的 flake 明显变多，症状有两种：

- 受控输入（login 的 email）在水合前 `fill`，被首个受控渲染清空 → 提交无反应；
- 表单在水合前提交走浏览器原生 GET → URL 变成 `?slug=...&summary=...`，请求根本没到
  server fn。

因此 e2e 一律走 `e2e/helpers.ts` 的 `fillField` / `pressButton`，它们先用
`waitForHydration` 轮询目标元素上的 `__reactProps$`（React 19 水合后才挂）再操作。
新写 e2e 不要直接 `locator.fill` / `button.click` 首屏元素。

注意这是测试侧兜底；产品侧的根治办法仍是"落地即填的表单用非受控 + FormData"
（见上文验收修复轮）。`apps/app/src/routes/login.tsx` 目前仍是受控 email 输入，
是同类 bug 的存量点。

## UI 改造 P7/P8 收尾（2026-08-11）

- **长尾列表也必须走统一协议**：通知返回 `items/total/page/pageSize/unreadCount`，导入历史
  返回标准 `ListResult`；即使列表只支持一种排序，也保留 `validateSearch + loaderDeps`，让分页
  URL 可刷新、可复制。通知的已读写操作只接受当前 membership，导入历史只允许 staff/owner。
- **设置页权限不是隐藏按钮代替鉴权**：组织名称/时区由 `OWNER_ROLES` 在 server fn 强制校验；
  staff 页面只读。学期改删仍是 staff/owner，删除前由 core 检查 rehearsal series 引用并写 audit。
- **时区选项用固定短表**：不要在 SSR/浏览器两侧调用 `Intl.supportedValuesOf("timeZone")`，
  workerd 与浏览器 ICU 版本不同会造成 hydration mismatch。当前组织时区不在短表时动态补入。
- **页面主任务与辅助创建分开**：CSV 上传、组织设置保留页内 Frame；邀请 staff、创建/编辑学期
  使用 FormDrawer。Account、New Org、Select Org 也使用同一 Frame/Field 视觉语法。
- **P8 回归数据优先走真实业务链路**：成员分页用 CSV → R2 → Queue → tasks Worker 导入，parent
  卡片回归用 contact 邀请链接激活 membership；不要从测试直接写 D1，才能覆盖真实权限与异步链。
- **可访问名可能包含子内容**：parent 活动卡片的 link accessible name 同时包含标题与日期，
  Playwright 应按标题做非 exact 匹配；文件上传也要先 `waitForHydration` 再 `setInputFiles`。

## vendored 组件的本地修改清单

`packages/ui/src/components/**` 来自 coss/shadcn，同步上游时以下改动必须保留
（每处都有中文注释标记）：

- `sidebar.tsx`：图标换 `SidebarSimpleIcon`（phosphor）；`setOpen` 里 `cookieStore`
  做特性检测并降级 `document.cookie`（Firefox/Safari 未实现 Cookie Store API，
  上游直接 await 会抛未捕获 rejection）。
- `toast.tsx`：5 个 lucide 图标换 phosphor（`WarningCircle`/`Info`/`CircleNotch`/
  `CheckCircle`/`Warning`）。该文件挂在 `__root`，不换会把 lucide 拖进全站主包。
- `button.tsx`：rounded-md、hover 用 `--brand-hover`、press `scale-0.98`（M1 起）。
- `pagination.tsx`：3 个 lucide 图标换 phosphor（`CaretLeft`/`CaretRight`/`DotsThree`）。
  组件本身是链接语义（`<a>`），我们的列表分页只用它的 nav/ul/li 与省略号，页码按钮另拼。
- `select.tsx`：3 个 lucide 图标换 phosphor。
- **全局（2026-08-12，提交"统一边框颜色"）**：20 处 `border`/`border-t/b/e/s` 显式补
  `border-border` token（Tailwind v4 默认 border 色是 currentColor，会跟着文字颜色走）。
  涉及 sidebar/alert/alert-dialog/card/dialog/drawer/empty/frame/menu/popover/preview-card/
  select/sheet/table/toast/toolbar/tooltip/combobox/command 与 overview-month-calendar。
  同步上游后需重新检查共享容器的边框颜色。

其余组件仍留着 lucide，策略不变：用到哪个改哪个。

## 工程坑位记录

- **TS7 (tsgo) 的 extends 解析**：`@everband/config/tsconfig.*.json` 必须出现在每个包的 devDependencies 里，否则 extends 静默失败、skipLibCheck 等选项全部丢失，报出一堆 node_modules d.ts 错误。
- **DOM lib 与 workers-types 冲突**：apps/app 同时是客户端和 Worker。当前用 `wrangler types --include-runtime=false` 只生成 Env；M2 引入 server 代码时按 Cloudflare 建议拆分 client/server tsconfig。
- **Tailwind v4 跨包扫描**：workspace 包源码不在自动内容探测范围内，`globals.css` 里用 `@source "../../src"` 显式纳入 ui 包。
- **CSS @import 顺序**：Google Fonts 的 @import 必须放在 `globals.css` 最顶部（先于 `@import "tailwindcss"` 之外的任何规则）。
- **biome 对 Tailwind v4 at-rules（@theme/@source/@custom-variant）解析失败**：`packages/ui/src/styles` 已从 biome includes 排除。
- **pnpm 11 构建脚本审批**：`pnpm-workspace.yaml` 的 `allowBuilds` 显式允许 esbuild、workerd。
- **wrangler.jsonc 的 D1 database_id**：本地开发无所谓，生产部署前用 `wrangler d1 create everband` 生成后替换（app 与 tasks 指同一库）。
- **coss/ui 安装方式**：`packages/ui` 内 `pnpm dlx shadcn@latest add @coss/ui`（components.json 已配 `@coss` registry 与 workspace alias）。组件源码进仓库（src/components/），属"我们的代码"，可按设计系统改（已改 Button：rounded-md、hover 用 --brand-hover、press scale 0.98）。
- **vendored 组件的已知偏差**：coss 组件内部用 lucide-react 图标（约 17 个文件），与"只用 Phosphor"红线冲突；策略是**用到哪个组件改哪个**（替换成 @phosphor-icons/react 等价图标），不一次性全改。biome 对 `packages/ui/src/components/**` 关闭 lint（上游代码模式），业务代码不受此豁免。
- **CLI 追加的语义色块已改回 DYQR token**：coss init 会把 --success/--warning/--info 覆盖成 Tailwind 默认色板——只保留其 `*-foreground` 新增（按 DYQR 色相取深档），本体沿用 colors-and-type.css。注意 coss 语义里 `--destructive-foreground` 是"浅底上的深色错误文字"（实心破坏性按钮直接 text-white），与 shadcn 经典语义不同。
