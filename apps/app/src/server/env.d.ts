// cloudflare:workers 的 env 类型：手工声明绑定面。
// 不引入 @cloudflare/workers-types 全局声明（与 DOM lib 冲突），
// 需要的类型用命名 import。绑定变更时同步更新这里与 wrangler.jsonc。
declare module "cloudflare:workers" {
  import type { D1Database } from "@cloudflare/workers-types";

  export const env: {
    DB: D1Database;
    // dev | mock | cloudflare（M7 接入真实发送）
    EMAIL_MODE?: string;
  };
}
