// Landing Worker 的绑定面：只有 Turnstile secret。
declare module "cloudflare:workers" {
  export const env: {
    TURNSTILE_SECRET?: string;
  };
}
