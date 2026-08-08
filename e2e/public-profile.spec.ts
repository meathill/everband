import { expect, test } from "@playwright/test";

// PRD §12.2 场景 8：开启公开主页 → 生成二维码 → 访客可见；
// 关闭后统一"未开放"提示，不泄露组织是否存在。

function uniqueEmail(): string {
  return `e2e-pub-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

// 用键盘激活按钮：规避移动端 pointer-coarse 扩展热区的相互遮挡，
// 同时覆盖"关键流程支持键盘操作"（PRD §10.1）
async function pressButton(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name }).focus();
  await page.keyboard.press("Enter");
}

async function loginViaMagicLink(page: import("@playwright/test").Page, email: string) {
  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("We sent a 6-digit code")).toBeVisible();
  await page.goto("/dev/outbox");
  const card = page.locator(`article[data-kind="magic-link"]`, { hasText: email }).first();
  const body = await card.locator("pre").innerText();
  const link = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/)?.[0] ?? "";
  await page.goto(link);
}

test("公开主页开启/二维码/关闭后统一降级", async ({ page, browser }) => {
  const email = uniqueEmail();
  const slug = `e2e-band-${Date.now().toString(36)}`;

  await loginViaMagicLink(page, email);
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();

  // 创建组织
  await page.goto("/new-org");
  await page.locator("#org-name").fill("Public Page Test Band");
  await page.getByRole("button", { name: "Create organization" }).click();
  await expect(page.getByRole("heading", { name: "Public Page Test Band" })).toBeVisible();
  const orgUrl = page.url();

  // 开启公开主页
  await page.goto(`${orgUrl}/settings`);
  await page.locator("#public-slug").fill(slug);
  await page.locator("#public-summary").fill("A test band for the public page.");
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
