import { defineConfig, devices } from "@playwright/test";

// e2e 对 apps/app 的 vite dev server 跑（本地复用已启动的 3000 端口）。
// CI 中由 webServer 自行拉起；EMAIL_MODE=dev 保证邮件走 /dev/outbox。
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  // 本地 D1（SQLite）对并行写敏感，套件小，串行换稳定
  workers: 1,
  retries: 0,
  // vite dev 按需编译，路由首次访问可能超过默认 5s
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // 移动端视口（375px 级）；用 Chromium 内核设备避免额外下载 WebKit
      name: "mobile",
      use: { ...devices["Pixel 7"] },
    },
  ],
  webServer: {
    command: "pnpm -C apps/app run dev",
    port: 3000,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
