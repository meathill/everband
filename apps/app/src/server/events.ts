import { canParentAccessEvent, listParentEvents, recordAudit } from "@everband/core";
import { schema } from "@everband/db";
import {
  canTransitionEvent,
  canTransitionEventUpdate,
  generateId,
  ID_PREFIXES,
  localDateTimeToUtcMs,
  upcomingWindow,
} from "@everband/domain";
import {
  createEventSchema,
  createEventUpdateSchema,
  editEventUpdateSchema,
  eventIdSchema,
  orgIdSchema,
  publishEventUpdateSchema,
  transitionEventSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, inArray } from "drizzle-orm";
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

export const listOrgEvents = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return db
      .select()
      .from(schema.events)
      .where(eq(schema.events.organizationId, data.orgId))
      .orderBy(desc(schema.events.startsAtUtc))
      .limit(100);
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

    const [groupRows, updates, attachmentRows] = await Promise.all([
      db
        .select({ groupId: schema.eventGroups.groupId, name: schema.groups.name })
        .from(schema.eventGroups)
        .innerJoin(schema.groups, eq(schema.groups.id, schema.eventGroups.groupId))
        .where(eq(schema.eventGroups.eventId, data.eventId)),
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

    return { event, groups: groupRows, updates, attachments: attachmentRows, role: ctx.role };
  });

export const createEventUpdate = createServerFn({ method: "POST" })
  .validator(createEventUpdateSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const updateId = generateId(ID_PREFIXES.eventUpdate);
    await db.insert(schema.eventUpdates).values({
      id: updateId,
      organizationId: data.orgId,
      eventId: data.eventId,
      title: data.title,
      body: data.body,
      status: "draft",
      createdByMembershipId: ctx.membershipId,
      createdAt: now,
    });
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "event_update.created",
      objectType: "event_update",
      objectId: updateId,
      summary: { eventId: data.eventId, title: data.title },
    });
    return { ok: true as const, updateId };
  });

export const editEventUpdate = createServerFn({ method: "POST" })
  .validator(editEventUpdateSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    // 发布后可编辑，但不自动重发邮件（PRD §5.2）
    const rows = await db
      .update(schema.eventUpdates)
      .set({ title: data.title, body: data.body, lastEditedAt: now })
      .where(
        and(
          eq(schema.eventUpdates.id, data.updateId),
          eq(schema.eventUpdates.organizationId, data.orgId),
        ),
      )
      .returning({ id: schema.eventUpdates.id });
    if (rows.length === 0) {
      return { ok: false as const, error: "Update not found." };
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "event_update.edited",
      objectType: "event_update",
      objectId: data.updateId,
    });
    return { ok: true as const };
  });

export const publishEventUpdate = createServerFn({ method: "POST" })
  .validator(publishEventUpdateSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const rows = await db
      .select({ status: schema.eventUpdates.status })
      .from(schema.eventUpdates)
      .where(
        and(
          eq(schema.eventUpdates.id, data.updateId),
          eq(schema.eventUpdates.organizationId, data.orgId),
        ),
      )
      .limit(1);
    const current = rows[0];
    if (!current || !canTransitionEventUpdate(current.status, "published")) {
      return { ok: false as const, error: "This update is already published." };
    }
    await db
      .update(schema.eventUpdates)
      .set({ status: "published", publishedAt: now })
      .where(eq(schema.eventUpdates.id, data.updateId));
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "event_update.published",
      objectType: "event_update",
      objectId: data.updateId,
    });
    return { ok: true as const };
  });
