import { test as base } from "@playwright/test";

// e2e 与外部网络解耦：样式表 @import 的 Google Fonts 在受限网络下会挂起
// （实测 28 分钟未返回，拖垮页面渲染与测试超时）。拦截后字体走 fallback，
// 渲染、布局、可访问性断言不受影响。
export const test = base.extend({
  page: async ({ page }, use) => {
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) => route.abort("blockedbyclient"));
    await use(page);
  },
});

export { expect } from "@playwright/test";
