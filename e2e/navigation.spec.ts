import { expect, test } from "@playwright/test";

// 验收 issue #1/#2/#4/#5 的固化用例：首页导航、未登录回跳、404、favicon。

function uniqueEmail(): string {
  return `e2e-nav-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
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
  const email = uniqueEmail();

  await page.goto("/new-org");
  await expect(page).toHaveURL(/\/login\?redirect=%2Fnew-org/);

  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("We sent a 6-digit code")).toBeVisible();

  await page.goto("/dev/outbox");
  const card = page.locator(`article[data-kind="magic-link"]`, { hasText: email }).first();
  const body = await card.locator("pre").innerText();
  const link = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/)?.[0] ?? "";
  expect(link).toContain("redirect=%2Fnew-org");

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Create an organization" })).toBeVisible();
});

test("恶意 redirect 参数被丢弃，登录后落默认页（防开放重定向）", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/login?redirect=https%3A%2F%2Fevil.com");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("We sent a 6-digit code")).toBeVisible();

  await page.goto("/dev/outbox");
  const card = page.locator(`article[data-kind="magic-link"]`, { hasText: email }).first();
  const body = await card.locator("pre").innerText();
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

test("favicon 返回 200 且为图片（issue #4）", async ({ page }) => {
  const ico = await page.request.get("/favicon.ico");
  expect(ico.status()).toBe(200);
  expect(ico.headers()["content-type"] ?? "").not.toContain("text/html");

  const svg = await page.request.get("/favicon.svg");
  expect(svg.status()).toBe(200);
  expect(svg.headers()["content-type"] ?? "").toContain("svg");
});
