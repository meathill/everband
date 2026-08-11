import { expect, type Page, test } from "@playwright/test";
import {
  fillField,
  loginViaMagicLink,
  pressButton,
  readLatestMagicLink,
  requestMagicLink,
  uniqueEmail,
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
