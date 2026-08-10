import { getStaffOverviewData } from "@everband/core";
import { orgIdSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

// staff Overview（PRD §7.2）：一次鉴权 + 四块并行聚合，避免前端串多个 server fn
export const getStaffOverview = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return getStaffOverviewData(db, data.orgId, Date.now());
  });
