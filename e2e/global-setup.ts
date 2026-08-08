// 套件启动时执行一次：释放登录限流窗口（本地 dev DB 持久，
// 反复跑套件会累计到 IP 上限）。不能放到每个 spec 的 beforeAll——
// 并行 project 会互相清掉对方在途的 magic link token。
export default async function globalSetup() {
  await fetch("http://localhost:3000/dev/reset");
}
