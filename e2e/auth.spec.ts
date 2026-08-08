import { expect, test } from "@playwright/test";

// M2 骨架用例：magic link 登录闭环（PRD §12.2 场景 2 的最小切片）。
// 邮件经 DevEmailSender 落到 /dev/outbox，从页面提取链接完成登录。

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

test("magic link 登录后进入组织选择页", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("We sent a 6-digit code")).toBeVisible();

  await page.goto("/dev/outbox");
  const card = page.locator(`article[data-kind="magic-link"]`, { hasText: email }).first();
  await expect(card).toBeVisible();
  const body = await card.locator("pre").innerText();
  const match = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/);
  expect(match).not.toBeNull();

  await page.goto(match?.[0] ?? "");
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();
});

test("magic link 只能使用一次", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/login");
  await page.getByPlaceholder("you@example.com").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByText("We sent a 6-digit code")).toBeVisible();

  await page.goto("/dev/outbox");
  const card = page.locator(`article[data-kind="magic-link"]`, { hasText: email }).first();
  const body = await card.locator("pre").innerText();
  const link = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/)?.[0] ?? "";

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();

  // 再次访问同一链接：应显示统一失败信息
  await page.goto(link);
  await expect(page.getByText("invalid or has expired")).toBeVisible();
});
