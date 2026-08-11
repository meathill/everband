import { env } from "cloudflare:workers";
import {
  canParentAccessEvent,
  deleteDraftEventCore,
  listOrgEventsCore,
  listParentEvents,
  recordAudit,
  updateEventCore,
} from "@everband/core";
import { schema } from "@everband/db";
import {
  canTransitionEvent,
  generateId,
  ID_PREFIXES,
  localDateTimeToUtcMs,
  upcomingWindow,
} from "@everband/domain";
import {
  createEventSchema,
  deleteDraftEventSchema,
  eventIdSchema,
  eventsPageSchema,
  orgIdSchema,
  transitionEventSchema,
  updateEventSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "./context.ts";
import { AuthError, requireMembership, STAFF_ROLES } from "./guards.ts";

async function getOrgTimezone(db: ReturnType<typeof getDb>, orgId: string): Promise<string> {
  const rows = await db
    .select({ timezone: schema.organizations.timezone })
    .from(schema.organizations)
    .where(eq(schema.organizations.id, orgId))
    .limit(1);
  return rows[0]?.timezone ?? "UTC";
}

export const createEvent = createServerFn({ method: "POST" })
  .validator(createEventSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const timezone = await getOrgTimezone(db, data.orgId);

    if (!data.isOrgWide && data.groupIds.length > 0) {
      const owned = await db
        .select({ id: schema.groups.id })
        .from(schema.groups)
        .where(
          and(
            eq(schema.groups.organizationId, data.orgId),
            inArray(schema.groups.id, data.groupIds),
          ),
        );
      if (owned.length !== data.groupIds.length) {
        return { ok: false as const, error: "One of the selected groups does not exist." };
      }
    }

    const eventId = generateId(ID_PREFIXES.event);
    await db.insert(schema.events).values({
      id: eventId,
      organizationId: data.orgId,
      title: data.title,
      type: data.type,
      description: data.description ?? null,
      startsAtUtc: localDateTimeToUtcMs(data.startsAtLocal, timezone),
      endsAtUtc: data.endsAtLocal ? localDateTimeToUtcMs(data.endsAtLocal, timezone) : null,
      location: data.location ?? null,
      isOrgWide: data.isOrgWide,
      status: "draft",
      createdByMembershipId: ctx.membershipId,
      createdAt: now,
      updatedAt: now,
    });
    if (!data.isOrgWide && data.groupIds.length > 0) {
      await db.insert(schema.eventGroups).values(
        data.groupIds.map((groupId) => ({
          organizationId: data.orgId,
          eventId,
          groupId,
        })),
      );
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "event.created",
      objectType: "event",
      objectId: eventId,
      summary: { title: data.title, isOrgWide: data.isOrgWide, groupIds: data.groupIds },
    });
    return { ok: true as const, eventId };
  });

// 编辑：可改字段按状态收窄，规则在 updateEventCore。空串代表"清空该可选字段"。
export const updateEvent = createServerFn({ method: "POST" })
  .validator(updateEventSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const timezone = await getOrgTimezone(db, data.orgId);
    return updateEventCore(
      db,
      data.orgId,
      data.eventId,
      {
        title: data.title,
        description: data.description === undefined ? undefined : data.description || null,
        location: data.location === undefined ? undefined : data.location || null,
        startsAtUtc: data.startsAtLocal
          ? localDateTimeToUtcMs(data.startsAtLocal, timezone)
          : undefined,
        endsAtUtc:
          data.endsAtLocal === undefined
            ? undefined
            : data.endsAtLocal
              ? localDateTimeToUtcMs(data.endsAtLocal, timezone)
              : null,
        isOrgWide: data.isOrgWide,
        groupIds: data.groupIds,
      },
      ctx.membershipId,
      Date.now(),
    );
  });

// 仅草稿可删（硬删 + 清理关联）；R2 对象由这里删，core 只负责 db
export const deleteDraftEvent = createServerFn({ method: "POST" })
  .validator(deleteDraftEventSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const result = await deleteDraftEventCore(db, data.orgId, data.eventId, ctx.membershipId);
    if (!result.ok) {
      return { ok: false as const, error: result.error };
    }
    await Promise.all(result.r2Keys.map((key) => env.FILES.delete(key)));
    return { ok: true as const };
  });

export const transitionEvent = createServerFn({ method: "POST" })
  .validator(transitionEventSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const rows = await db
      .select({ status: schema.events.status })
      .from(schema.events)
      .where(and(eq(schema.events.id, data.eventId), eq(schema.events.organizationId, data.orgId)))
      .limit(1);
    const current = rows[0];
    if (!current) {
      return { ok: false as const, error: "Event not found." };
    }
    if (!canTransitionEvent(current.status, data.status)) {
      return {
        ok: false as const,
        error: `Cannot move a ${current.status} event to ${data.status}.`,
      };
    }
    await db
      .update(schema.events)
      .set({
        status: data.status,
        publishedAt: data.status === "published" ? now : undefined,
        updatedAt: now,
      })
      .where(and(eq(schema.events.id, data.eventId), eq(schema.events.organizationId, data.orgId)));
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: `event.${data.status}`,
      objectType: "event",
      objectId: data.eventId,
    });
    return { ok: true as const };
  });

/**
 * Events 页的数据入口，按角色分派成判别联合。
 *
 * 子路由 loader 拿不到父路由 `/o/$orgId` 的 role，所以角色判断必须由服务端自己做一次。
 * 早先的写法是"先试 staff 查询，catch 再试 parent 查询"——那会把真实故障也吞成 parent 视图，
 * 而且多打一趟往返。这里一次 requireMembership 拿到 role 后直接分派。
 */
export const getEventsPageData = createServerFn({ method: "GET" })
  .validator(eventsPageSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);

    if (ctx.role === "owner" || ctx.role === "staff") {
      const [list, groups] = await Promise.all([
        listOrgEventsCore(db, data.orgId, data, Date.now()),
        // 受众选择器只列 active 分组；归档分组在 updateGroupCore 里就被禁止留下活动引用
        db
          .select({ id: schema.groups.id, name: schema.groups.name })
          .from(schema.groups)
          .where(
            and(
              eq(schema.groups.organizationId, data.orgId),
              eq(schema.groups.status, "active" as const),
            ),
          )
          .orderBy(asc(schema.groups.name)),
      ]);
      return { mode: "staff" as const, list, groups };
    }

    const timezone = await getOrgTimezone(db, data.orgId);
    const window = upcomingWindow(Date.now(), timezone);
    return {
      mode: "parent" as const,
      upcoming: await listParentEvents(db, data.orgId, ctx.user.id, window),
    };
  });

// parent 首页：未来 30 天（组织时区）内自己可见的活动
export const listMyUpcomingEvents = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const timezone = await getOrgTimezone(db, data.orgId);
    const window = upcomingWindow(Date.now(), timezone);
    return listParentEvents(db, data.orgId, ctx.user.id, window);
  });

// 活动详情：staff 全量；parent 需通过受众校验且非草稿
export const getEventDetail = createServerFn({ method: "GET" })
  .validator(eventIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const isStaff = ctx.role === "owner" || ctx.role === "staff";

    if (!isStaff) {
      const allowed = await canParentAccessEvent(db, data.orgId, ctx.user.id, data.eventId);
      if (!allowed) {
        throw new AuthError("forbidden");
      }
    }

    const events = await db
      .select()
      .from(schema.events)
      .where(and(eq(schema.events.id, data.eventId), eq(schema.events.organizationId, data.orgId)))
      .limit(1);
    const event = events[0];
    if (!event) {
      throw new AuthError("forbidden");
    }

    const [groupRows, allGroups, updates, attachmentRows] = await Promise.all([
      db
        .select({ groupId: schema.eventGroups.groupId, name: schema.groups.name })
        .from(schema.eventGroups)
        .innerJoin(schema.groups, eq(schema.groups.id, schema.eventGroups.groupId))
        .where(eq(schema.eventGroups.eventId, data.eventId)),
      // 编辑抽屉的受众选项（只列 active 分组）；parent 用不到，但多一次小查询换掉一趟额外往返
      isStaff
        ? db
            .select({ id: schema.groups.id, name: schema.groups.name })
            .from(schema.groups)
            .where(
              and(
                eq(schema.groups.organizationId, data.orgId),
                eq(schema.groups.status, "active" as const),
              ),
            )
            .orderBy(asc(schema.groups.name))
        : Promise.resolve([]),
      db
        .select()
        .from(schema.eventUpdates)
        .where(
          and(
            eq(schema.eventUpdates.eventId, data.eventId),
            eq(schema.eventUpdates.organizationId, data.orgId),
            ...(isStaff ? [] : [eq(schema.eventUpdates.status, "published" as const)]),
          ),
        )
        .orderBy(desc(schema.eventUpdates.createdAt)),
      db
        .select({
          id: schema.attachments.id,
          fileName: schema.attachments.fileName,
          contentType: schema.attachments.contentType,
          sizeBytes: schema.attachments.sizeBytes,
          createdAt: schema.attachments.createdAt,
        })
        .from(schema.attachments)
        .where(
          and(
            eq(schema.attachments.organizationId, data.orgId),
            eq(schema.attachments.ownerType, "event"),
            eq(schema.attachments.ownerId, data.eventId),
          ),
        ),
    ]);

    return {
      event,
      groups: groupRows,
      allGroups,
      updates,
      attachments: attachmentRows,
      role: ctx.role,
    };
  });
