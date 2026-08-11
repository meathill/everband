import { getParentOverviewData, getStaffOverviewData } from "@everband/core";
import { currentMonthInTimezone, monthWindow } from "@everband/domain";
import { overviewRequestSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
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
    const overview =
      ctx.role === "parent"
        ? await getParentOverviewData(db, data.orgId, ctx.user.id, window, organizations.timezone)
        : await getStaffOverviewData(db, data.orgId, window, organizations.timezone);
    return { month, overview };
  });
