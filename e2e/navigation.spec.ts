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
  await expect(page.getByRole("heading", { name: "Sidebar Test Band" })).toBeVisible();

  // 旧的顶部导航已移除，正文区不应再横向溢出（原 header flex-wrap 决策的替代验证）
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await openSidebarOnMobile(page);

  // Overview 是父路径，必须精确匹配，否则任何子页面都会让它高亮
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute("data-active", "true");
  // owner 才有的 Manage 分组
  await expect(page.getByRole("link", { name: "Members" })).toBeVisible();

  await page.getByRole("link", { name: "Events" }).click();
  // Events 是列表页，validateSearch 的默认值会被 Link 补进 URL（?page=1&…），所以不能锚 $
  await expect(page).toHaveURL(/\/events(\?|$)/);
  await openSidebarOnMobile(page);
  await expect(page.getByRole("link", { name: "Events" })).toHaveAttribute("data-active", "true");
  await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
    "data-active",
    "false",
  );
});

test("favicon 返回 200 且为图片（issue #4）", async ({ page }) => {
  const ico = await page.request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect(ico.headers()["content-type"] ?? "").not.toContain("text/html");

  const svg = await page.request.get("/favicon.svg");
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"] ?? "").toContain("svg");
});
