// 活动更新（EventUpdate）的 server functions。
// 从 events.ts 拆出：活动本身与它的更新是两条独立的写入链路，放一起会让单文件超长。

import { recordAudit } from "@everband/core";
import { schema } from "@everband/db";
import { canTransitionEventUpdate, generateId, ID_PREFIXES } from "@everband/domain";
import {
  createEventUpdateSchema,
  deleteEventUpdateSchema,
  editEventUpdateSchema,
  publishEventUpdateSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

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

// 只允许删草稿：已发布的更新可能已经进过 parent 的收件箱，删掉会让历史对不上
export const deleteEventUpdate = createServerFn({ method: "POST" })
  .validator(deleteEventUpdateSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const rows = await db
      .delete(schema.eventUpdates)
      .where(
        and(
          eq(schema.eventUpdates.id, data.updateId),
          eq(schema.eventUpdates.organizationId, data.orgId),
          eq(schema.eventUpdates.status, "draft"),
        ),
      )
      .returning({ id: schema.eventUpdates.id });
    if (rows.length === 0) {
      return { ok: false as const, error: "Only draft updates can be deleted." };
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "event_update.deleted",
      objectType: "event_update",
      objectId: data.updateId,
    });
    return { ok: true as const };
  });
