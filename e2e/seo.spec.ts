import { expect, test } from "@playwright/test";
import { waitForHydration } from "./helpers.ts";

// SEO 断言：营销站（landing, :3101，见 playwright.config.ts）head 完整性 + robots/sitemap；
// 应用站（:3000）登录后台默认 noindex。
// 注：head 中 canonical/og:url 使用写死的生产域名（dev 下也是生产值，与部署产物一致）。

const LANDING = "http://localhost:3101";
const APP = "http://localhost:3000";

const HOME_TITLE = "Everband — run your community band without the spreadsheets";
const HOME_DESCRIPTION =
  "Members, events, rehearsals and parent rosters for community bands, teams and clubs. One place instead of spreadsheets, group emails and lost attachments.";

test.describe("landing SEO", () => {
  test("首页 head：title/description/OG/twitter/canonical/JSON-LD", async ({ page }) => {
    await page.goto(`${LANDING}/`);
    await expect(page).toHaveTitle(HOME_TITLE);
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content",
      HOME_DESCRIPTION,
    );
    await expect(page.locator('meta[property="og:site_name"]')).toHaveAttribute(
      "content",
      "Everband",
    );
    await expect(page.locator('meta[property="og:type"]')).toHaveAttribute("content", "website");
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", HOME_TITLE);
    await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
      "content",
      /\/og-image\.png$/,
    );
    await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
      "content",
      "summary_large_image",
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://everband.meathill.com/",
    );
    await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);
    const ldJson = await page.locator('script[type="application/ld+json"]').textContent();
    expect(ldJson).toContain('"@type":"WebSite"');
    expect(ldJson).toContain('"@type":"SoftwareApplication"');
    expect(ldJson).toContain("everband.meathill.com");
  });

  test("privacy/terms head：canonical + og:url 指向自身", async ({ page }) => {
    await page.goto(`${LANDING}/privacy`);
    await expect(page).toHaveTitle("Privacy Policy — Everband");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://everband.meathill.com/privacy",
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      "https://everband.meathill.com/privacy",
    );

    await page.goto(`${LANDING}/terms`);
    await expect(page).toHaveTitle("Terms of Service — Everband");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://everband.meathill.com/terms",
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      "https://everband.meathill.com/terms",
    );
  });

  test("robots.txt 与 sitemap.xml 可用且内容正确", async ({ request }) => {
    const robots = await (await request.get(`${LANDING}/robots.txt`)).text();
    expect(robots).toContain("User-agent: *");
    expect(robots).toContain("Sitemap: https://everband.meathill.com/sitemap.xml");

    const sitemap = await (await request.get(`${LANDING}/sitemap.xml`)).text();
    expect(sitemap).toContain("https://everband.meathill.com/");
    expect(sitemap).toContain("https://everband.meathill.com/about");
    expect(sitemap).toContain("https://everband.meathill.com/contact");
    expect(sitemap).toContain("https://everband.meathill.com/privacy");
    expect(sitemap).toContain("https://everband.meathill.com/terms");
  });

  test("about/contact head：canonical + og:url 指向自身", async ({ page }) => {
    await page.goto(`${LANDING}/about`);
    await expect(page).toHaveTitle("About — Everband");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://everband.meathill.com/about",
    );

    await page.goto(`${LANDING}/contact`);
    await expect(page).toHaveTitle("Contact us — Everband");
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      "href",
      "https://everband.meathill.com/contact",
    );
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute(
      "content",
      "https://everband.meathill.com/contact",
    );
  });

  test("contact 表单提交到 feedback.meathill.com，字段映射正确", async ({ page }) => {
    let submitted: { url: string; body: unknown } | null = null;
    await page.route("**/api/feedbacks", async (route) => {
      submitted = {
        url: route.request().url(),
        body: route.request().postDataJSON(),
      };
      await route.fulfill({ status: 201, json: { success: true } });
    });

    await page.goto(`${LANDING}/contact`);
    // 水合前提交会走原生 GET（onSubmit 未挂载）——必须先等 React 接管
    await waitForHydration(page.locator("#contact-name"));
    await page.fill("#contact-name", "Test User");
    await page.fill("#contact-email", "test@example.com");
    await page.fill("#contact-message", "Hello Everband!");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByText("we've received your message")).toBeVisible();

    expect(submitted?.url).toBe("https://feedback.meathill.com/api/feedbacks");
    expect(submitted?.body).toEqual({
      appId: "everband-landing",
      content: "Hello Everband!",
      contact: "Test User <test@example.com>",
    });
  });
});

test.describe("app SEO", () => {
  test("首页：title/description + 默认 noindex", async ({ page }) => {
    await page.goto(`${APP}/`);
    await expect(page).toHaveTitle(HOME_TITLE);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      "noindex, nofollow",
    );
  });

  test("登录页独立 title", async ({ page }) => {
    await page.goto(`${APP}/login`);
    await expect(page).toHaveTitle("Sign in — Everband");
  });
});
