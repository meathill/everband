import { expect, test } from "@playwright/test";
import { fillField, loginViaMagicLink, pressButton, uniqueEmail } from "./helpers.ts";

// PRD §12.2 场景 8：开启公开主页 → 生成二维码 → 访客可见；
// 关闭后统一"未开放"提示，不泄露组织是否存在。

test("公开主页开启/二维码/关闭后统一降级", async ({ page, browser }) => {
  const email = uniqueEmail("e2e-pub");
  const slug = `e2e-band-${Date.now().toString(36)}`;

  await loginViaMagicLink(page, email);
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();

  // 创建组织
  await page.goto("/new-org");
  await fillField(page.locator("#org-name"), "Public Page Test Band");
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Public Page Test Band" })).toBeVisible();
  const orgUrl = page.url();

  // 开启公开主页
  await page.goto(`${orgUrl}/settings`);
  await fillField(page.locator("#public-slug"), slug);
  await fillField(page.locator("#public-summary"), "A test band for the public page.");
  await pressButton(page, "Open public page");
  await expect(page.getByText("Status: open")).toBeVisible();

  // 生成入口二维码
  await pressButton(page, "Generate QR code");
  await expect(page.getByText(/dyqr\.me\//)).toBeVisible();

  // 访客（无登录态）访问公开主页
  const anonContext = await browser.newContext();
  const anonPage = await anonContext.newPage();
  await anonPage.goto(`/p/${slug}`);
  await expect(anonPage.getByRole("heading", { name: "Public Page Test Band" })).toBeVisible();
  await expect(anonPage.getByText("A test band for the public page.")).toBeVisible();

  // 关闭公开主页
  await pressButton(page, "Close public page");
  await expect(page.getByText("Status: not open")).toBeVisible();

  // 关闭后与不存在的 slug 显示同一提示（不泄露存在性）
  await anonPage.goto(`/p/${slug}`);
  await expect(anonPage.getByRole("heading", { name: "This page isn't available" })).toBeVisible();
  await anonPage.goto(`/p/no-such-slug-${Date.now().toString(36)}`);
  await expect(anonPage.getByRole("heading", { name: "This page isn't available" })).toBeVisible();

  await anonContext.close();
});
