import { expect, type Page, test } from "./fixtures.ts";
import {
  fillField,
  loginViaMagicLink,
  pressButton,
  readLatestMagicLink,
  requestMagicLink,
  uniqueEmail,
  waitForHydration,
} from "./helpers.ts";

// 验收 issue #1/#2/#4/#5 的固化用例：首页导航、未登录回跳、404、favicon。
// 另含 P1 侧边栏布局的导航用例（应用站左侧边栏替代顶部 header）。

function navEmail(): string {
  return uniqueEmail("e2e-nav");
}

// 移动端（<768px）侧边栏降级成 Sheet，需要先按触发器
async function openSidebarOnMobile(page: Page) {
  if ((page.viewportSize()?.width ?? 0) >= 768) return;
  const sheet = page.getByRole("dialog", { name: "Sidebar" });
  if (await sheet.isVisible()) return;
  // 用 data-slot 定位：SidebarRail 也叫 "Toggle Sidebar"，按角色名会撞车
  await page.locator('[data-slot="sidebar-trigger"]').focus();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
}

test("首页 Get started / Sign in 按钮可导航（issue #2）", async ({ page }) => {
  await page.goto("/");
  // 未登录点 Get started：new-org loader 弹去登录并带回跳参数（issue #1）
  await page.getByRole("link", { name: "Get started" }).click();
  await expect(page).toHaveURL(/\/login\?redirect=%2Fnew-org/);

  await page.goto("/");
  await page.getByRole("link", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test("未登录访问 /new-org 引导登录，magic link 登录后回跳（issue #1）", async ({ page }) => {
  const email = navEmail();

  await page.goto("/new-org");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fnew-org/);
  await requestMagicLink(page, email);

  const body = await readLatestMagicLink(page, email);
  const link = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/)?.[0] ?? "";
  expect(link).toContain("redirect=%2Fnew-org");

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Create an organization" })).toBeVisible();
});

test("未登录访问组织页才会被送到登录页", async ({ page }) => {
  await page.goto("/o/org_missing");
  await expect(page).toHaveURL(/\/login$/);
});

test("已有组织时通用入口进入组织首页，不再打开创建表单", async ({ page }) => {
  await loginViaMagicLink(page, navEmail());
  await page.goto("/new-org?intent=create");
  await fillField(page.locator("#org-name"), "Existing Organization Test");
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const orgId = new URL(page.url()).pathname.split("/")[2];
  expect(orgId).toBeTruthy();

  await page.goto("/new-org");
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}$`));
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Create an organization" })).not.toBeVisible();
});

test("拥有多个组织时可以从选择页进入任一组织", async ({ page }) => {
  await loginViaMagicLink(page, navEmail());
  const firstName = `First Band ${Date.now()}`;
  const secondName = `Second Band ${Date.now()}`;

  await page.goto("/new-org?intent=create");
  await fillField(page.locator("#org-name"), firstName);
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const firstOrgId = new URL(page.url()).pathname.split("/")[2];
  expect(firstOrgId).toBeTruthy();

  await page.goto("/new-org?intent=create");
  await fillField(page.locator("#org-name"), secondName);
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await page.goto("/select-org");
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();
  await page.getByRole("link", { name: new RegExp(firstName) }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${firstOrgId}$`));
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
});

test("恶意 redirect 参数被丢弃，登录后落默认页（防开放重定向）", async ({ page }) => {
  const email = navEmail();

  await page.goto("/login?redirect=https%3A%2F%2Fevil.com");
  await requestMagicLink(page, email);

  const body = await readLatestMagicLink(page, email);
  const link = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/)?.[0] ?? "";
  expect(link).not.toContain("evil.com");

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();
});

test("未知路径显示降级 404 并可返回首页（issue #5）", async ({ page }) => {
  await page.goto("/this-page-does-not-exist");
  await expect(page.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
  await page.getByRole("link", { name: "Back to home" }).click();
  await expect(page).toHaveURL(/\/$/);
});

test("组织侧边栏导航：Overview 精确高亮、可跳转、移动端不横向溢出", async ({ page }) => {
  await loginViaMagicLink(page, navEmail());
  await page.goto("/new-org");
  await fillField(page.locator("#org-name"), "Sidebar Test Band");
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const orgId = new URL(page.url()).pathname.split("/")[2];
  expect(orgId).toBeTruthy();

  // 旧的顶部导航已移除，正文区不应再横向溢出（原 header flex-wrap 决策的替代验证）
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await openSidebarOnMobile(page);

  // Overview 是父路径，必须精确匹配，否则任何子页面都会让它高亮
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "true");
  // 组织切换器保持在侧栏顶部；日常运营与底部工具都有稳定入口
  await expect(page.getByRole("button", { name: "Sidebar Test Band" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Members" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Finance" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Notifications" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Groups" })).toHaveCount(0);

  await page.getByRole("link", { name: "Events" }).click();
  // Events 是列表页，validateSearch 的默认值会被 Link 补进 URL（?page=1&…），所以不能锚 $
  await expect(page).toHaveURL(/\/events(\?|$)/);
  await openSidebarOnMobile(page);
  await expect(page.getByRole("link", { name: "Events" })).toHaveAttribute("data-active", "true");
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "data-active",
    "false",
  );

  await openSidebarOnMobile(page);
  const settingsLink = page.getByRole("link", { name: "Settings" });
  await settingsLink.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await page.getByRole("combobox", { name: "Settings section" }).click();
    await page.getByRole("option", { name: "Data import" }).click();
  } else {
    await page.getByRole("tab", { name: "Data import" }).click();
  }
  await expect(page.getByRole("heading", { name: "Data import" })).toBeVisible();

  await page.goto(`/o/${orgId}/import`);
  await expect(page).toHaveURL(/\/settings\?.*section=data-import/);
  await page.goto(`/o/${orgId}/groups`);
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/members`));
});

test("favicon 和 band 品牌资源返回有效图片", async ({ page }) => {
  const ico = await page.request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect(ico.headers()["content-type"] ?? "").not.toContain("text/html");

  const png = await page.request.get("/favicon.png");
  expect(png.status()).toBe(200);
  expect(png.headers()["content-type"] ?? "").toContain("image/png");

  const lockup = await page.request.get("/brand/band-lockup.png");
  expect(lockup.status()).toBe(200);
  expect(lockup.headers()["content-type"] ?? "").toContain("image/png");
});

// 页面跳转的 pending 反馈（骨架屏）：给 server fn 加延迟，
// 模拟慢网络下"点了链接几秒后才加载完"的场景，断言期间有骨架屏可见。
// search 变化（翻页/筛选）走 background reload，不应出现骨架屏，也一并覆盖。
const RPC_DELAY_MS = 800;

// 用 CDP 网络节流制造慢网络。不用 page.route 拦截：route handler 的延迟在
// 页面关闭后仍会触发，实测会污染后续测试（后续请求被拖慢到超时）。
async function delayServerFns(page: Page): Promise<void> {
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    latency: RPC_DELAY_MS,
    downloadThroughput: -1,
    uploadThroughput: -1,
    offline: false,
  });
}

// 键盘激活链接跳转。不用 click()：click 自带 hover，会触发 defaultPreload:
// "intent" 的预加载，预取完成后点击时导航零等待，骨架屏不再出现。
async function pressLink(page: Page, name: string | RegExp): Promise<void> {
  const link = page.getByRole("link", { name });
  await waitForHydration(link);
  await link.focus();
  await page.keyboard.press("Enter");
}

test("从组织选择页进入组织：先显示整页骨架，再渲染页面（pending UI）", async ({ page }) => {
  await loginViaMagicLink(page, navEmail());
  await page.goto("/new-org?intent=create");
  await fillField(page.locator("#org-name"), "Pending UI Test Band");
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const orgId = new URL(page.url()).pathname.split("/")[2];
  expect(orgId).toBeTruthy();

  await page.goto("/select-org");
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();
  // 水合完成后才开节流：throttle 会拖慢页面自身的 JS 资源加载，进而推迟水合
  await waitForHydration(page.getByRole("link", { name: /Pending UI Test Band/ }));

  await delayServerFns(page);
  await pressLink(page, /Pending UI Test Band/);
  // 布局 loader（4 个 server fn）未完成期间，整页骨架可见，点击不再是"没反应"
  // （移动端侧边栏骨架隐藏，:visible 只取可见的骨架）
  await expect(page.locator('[data-slot="skeleton"]:visible').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  expect(new URL(page.url()).pathname).toBe(`/o/${orgId}`);
});

test("组织内页面切换：内容区先显示骨架，侧边栏保持", async ({ page }) => {
  await loginViaMagicLink(page, navEmail());
  await page.goto("/new-org");
  await fillField(page.locator("#org-name"), "In-org Pending Test Band");
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();

  await openSidebarOnMobile(page);
  await delayServerFns(page);
  await pressLink(page, "Members");
  await expect(page.locator('[data-slot="skeleton"]:visible').first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Members" })).toBeVisible();

  // search 变化（翻页/筛选）走 background reload：旧表格保持、无骨架屏闪烁
  await delayServerFns(page);
  const searchInput = page.getByPlaceholder("Search students");
  if (await searchInput.isVisible()) {
    await searchInput.fill("zzz-no-match");
  }
  await expect(page.locator('[data-slot="skeleton"]')).toHaveCount(0);
});
