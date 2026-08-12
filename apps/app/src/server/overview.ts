import { getParentOverviewData, getStaffOverviewData } from "@everband/core";
import { schema } from "@everband/db";
import { currentMonthInTimezone, monthWindow } from "@everband/domain";
import { overviewRequestSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { requireMembership } from "./guards.ts";

export const getOverview = createServerFn({ method: "GET" })
  .validator(overviewRequestSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const organizations = await db.query.organizations.findFirst({
      columns: { timezone: true },
      where: (organization, { eq }) => eq(organization.id, data.orgId),
    });
    if (!organizations) throw new Error("Organization not found");
    const month = data.month ?? currentMonthInTimezone(Date.now(), organizations.timezone);
    const window = monthWindow(month, organizations.timezone);
    // 非 parent 角色需要 term 下拉数据支撑日历的快捷创建入口
    const terms =
      ctx.role === "parent"
        ? []
        : await db
            .select({ id: schema.terms.id, name: schema.terms.name })
            .from(schema.terms)
            .where(eq(schema.terms.organizationId, data.orgId));
    const overview =
      ctx.role === "parent"
        ? await getParentOverviewData(db, data.orgId, ctx.user.id, window, organizations.timezone)
        : await getStaffOverviewData(db, data.orgId, window, organizations.timezone);
    return { month, overview, terms };
  });
