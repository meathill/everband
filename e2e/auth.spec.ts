import { expect, test } from "@playwright/test";
import { readLatestMagicLink, requestMagicLink, uniqueEmail } from "./helpers.ts";

// M2 骨架用例：magic link 登录闭环（PRD §12.2 场景 2 的最小切片）。
// 邮件经 DevEmailSender 落到 /dev/outbox，从页面提取链接完成登录。

test("magic link 登录后进入组织选择页", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/login");
  await requestMagicLink(page, email);
  await expect(page.locator('[data-slot="otp-field"]')).toBeVisible();
  await expect(page.locator('[data-slot="otp-field-input"]')).toHaveCount(6);

  const body = await readLatestMagicLink(page, email);
  const match = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/);
  expect(match).not.toBeNull();

  await page.goto(match?.[0] ?? "");
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();
});

test("magic link 只能使用一次", async ({ page }) => {
  const email = uniqueEmail();

  await page.goto("/login");
  await requestMagicLink(page, email);

  const body = await readLatestMagicLink(page, email);
  const link = body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/)?.[0] ?? "";

  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Your organizations" })).toBeVisible();

  // 再次访问同一链接：应显示统一失败信息
  await page.goto(link);
  await expect(page.getByText("invalid or has expired")).toBeVisible();
});
