import type { D1Database } from "@cloudflare/workers-types";

declare module "cloudflare:test" {
  interface ProvidedEnv {
    DB: D1Database;
    TEST_MIGRATIONS: unknown[];
  }
  export const env: ProvidedEnv;
  export function applyD1Migrations(db: D1Database, migrations: unknown[]): Promise<void>;
}
