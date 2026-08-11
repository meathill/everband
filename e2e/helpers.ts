import { expect, type Locator, type Page } from "@playwright/test";

export function uniqueEmail(prefix = "e2e"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

// 水合前操作是 e2e 的主要 flake 源：
// - 受控输入（如 login 的 email）在水合前填写会被首个受控渲染清空；
// - 表单在水合前提交会走浏览器原生 GET，请求根本没到 server fn。
// React 19 水合后才会在 DOM 节点上挂 __reactProps$，用它做等待信号。
export async function waitForHydration(locator: Locator): Promise<void> {
  await expect
    .poll(() =>
      locator.evaluate((el) => Object.keys(el).some((k) => k.startsWith("__reactProps$"))),
    )
    .toBe(true);
}

export async function fillField(locator: Locator, value: string): Promise<void> {
  await waitForHydration(locator);
  await locator.fill(value);
}

// 用键盘激活按钮：规避移动端 pointer-coarse 扩展热区的相互遮挡，
// 同时覆盖"关键流程支持键盘操作"（PRD §10.1）
export async function pressButton(page: Page, name: string): Promise<void> {
  const button = page.getByRole("button", { name });
  await waitForHydration(button);
  await button.focus();
  await page.keyboard.press("Enter");
}

// 从 /dev/outbox 取该邮箱最新一封 magic link 邮件的正文
export async function readLatestMagicLink(page: Page, email: string): Promise<string> {
  await page.goto("/dev/outbox");
  const card = page.locator(`article[data-kind="magic-link"]`, { hasText: email }).first();
  await expect(card).toBeVisible();
  return card.locator("pre").innerText();
}

export async function requestMagicLink(page: Page, email: string): Promise<void> {
  await fillField(page.getByPlaceholder("you@example.com"), email);
  await pressButton(page, "Send code");
  await expect(page.getByText("We sent a 6-digit code")).toBeVisible();
}

export async function loginViaMagicLink(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await requestMagicLink(page, email);
  const body = await readLatestMagicLink(page, email);
  await page.goto(body.match(/http:\/\/[^\s]+\/verify\?token=[^\s]+/)?.[0] ?? "");
}
