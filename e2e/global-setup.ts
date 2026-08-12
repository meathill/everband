import { rmSync } from "node:fs";
import { join } from "node:path";

// 套件启动时执行一次：释放登录限流窗口（本地 dev DB 持久，
// 反复跑套件会累计到 IP 上限）。不能放到每个 spec 的 beforeAll——
// 并行 project 会互相清掉对方在途的 magic link token。
export default async function globalSetup() {
  await fetch("http://localhost:3000/dev/reset");

  // miniflare 的 observability trace-store 会把每个请求的 trace 写进本地 SQLite，
  // 反复跑套件会膨胀到数百 MB，拖慢 dev server 到每个请求 10s+。dev 是本地环境，
  // trace 没有消费方，直接清空（dev server 运行中删除目录是安全的，下次写入重建）。
  rmSync(join("apps/app/.wrangler/state/v3/observability"), {
    force: true,
    recursive: true,
  });
}
