import { env } from "cloudflare:workers";
import {
  createNotifications,
  listNotificationsCore,
  markAllNotificationsReadCore,
  markNotificationReadCore,
  membershipsForEmails,
  prepareEmailSend,
  recordAudit,
  resolveEventAudienceContacts,
} from "@everband/core";
import { schema } from "@everband/db";
import { notificationIdSchema, notificationsPageSchema, orgIdSchema } from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

// staff 明确触发：给 update 的受众发邮件（PRD §6.4 步骤 8-9）
export const sendUpdateEmail = createServerFn({ method: "POST" })
  .validator(z.object({ orgId: z.string().min(1), updateId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();

    const updates = await db
      .select({
        id: schema.eventUpdates.id,
        eventId: schema.eventUpdates.eventId,
        title: schema.eventUpdates.title,
        body: schema.eventUpdates.body,
        status: schema.eventUpdates.status,
        publishedAt: schema.eventUpdates.publishedAt,
        lastEditedAt: schema.eventUpdates.lastEditedAt,
      })
      .from(schema.eventUpdates)
      .where(
        and(
          eq(schema.eventUpdates.id, data.updateId),
          eq(schema.eventUpdates.organizationId, data.orgId),
        ),
      )
      .limit(1);
    const update = updates[0];
    if (update?.status !== "published") {
      return { ok: false as const, error: "Publish the update before sending email." };
    }

    const events = await db
      .select({ title: schema.events.title })
      .from(schema.events)
      .where(eq(schema.events.id, update.eventId))
      .limit(1);
    const eventTitle = events[0]?.title ?? "Event";

    const audience = await resolveEventAudienceContacts(db, data.orgId, update.eventId);
    if (audience.length === 0) {
      return { ok: false as const, error: "No recipients in the event audience." };
    }

    // 退订过滤：运营邮件尊重偏好；安全/登录邮件不受影响（走独立直发路径）
    const memberships = await membershipsForEmails(
      db,
      data.orgId,
      audience.map((contact) => contact.email),
    );
    const suppressedEmails = new Set(
      memberships.filter((m) => m.operationalEmailOptOut).map((m) => m.email),
    );

    // 幂等：同一 update 的同一内容版本只发一次；编辑后再次发送生成新 key
    const contentVersion = update.lastEditedAt ?? update.publishedAt ?? 0;
    const dedupKey = `event_update:${update.id}:${contentVersion}`;

    const link = `${getRequestUrl().origin}/o/${data.orgId}/events/${update.eventId}`;
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: data.orgId,
        kind: "event-update",
        subject: `Update: ${eventTitle} — ${update.title}`,
        body: `${update.body}\n\nView the event: ${link}`,
        objectType: "event_update",
        objectId: update.id,
        dedupKey,
        audience,
        suppressedEmails,
        requestedByMembershipId: ctx.membershipId,
      },
      now,
    );
    if (!prepared.created) {
      return {
        ok: true as const,
        deduplicated: true,
        sendId: prepared.sendId,
      };
    }

    // 站内通知给受众中的 parent 账号
    await createNotifications(
      db,
      data.orgId,
      memberships.map((m) => m.membershipId),
      {
        type: "event-update",
        title: `${eventTitle}: ${update.title}`,
        linkPath: `/o/${data.orgId}/events/${update.eventId}`,
        objectType: "event_update",
        objectId: update.id,
      },
      now,
    );
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "email_send.requested",
      objectType: "email_send",
      objectId: prepared.sendId,
      summary: {
        updateId: update.id,
        recipientCount: audience.length,
        queued: prepared.queuedCount,
        suppressed: prepared.suppressedCount,
      },
    });
    await env.EMAIL_QUEUE.send({ sendId: prepared.sendId });
    return { ok: true as const, deduplicated: false, sendId: prepared.sendId };
  });

// 本人的通知，requireMembership 已经确认过归属，不需要 STAFF_ROLES
export const listMyNotifications = createServerFn({ method: "GET" })
  .validator(notificationsPageSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    return listNotificationsCore(db, ctx.membershipId, {
      page: data.page,
      pageSize: data.pageSize,
      filter: data.filter,
    });
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .validator(notificationIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    await markNotificationReadCore(db, ctx.membershipId, data.notificationId, Date.now());
    // 已读的再点一次不是错误，统一返回 ok
    return { ok: true as const };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    await markAllNotificationsReadCore(db, ctx.membershipId, Date.now());
    return { ok: true as const };
  });

// staff：发送历史（queued≠sent 忠实展示，PRD §10.2）
export const listEmailSends = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return db
      .select()
      .from(schema.emailSends)
      .where(eq(schema.emailSends.organizationId, data.orgId))
      .orderBy(desc(schema.emailSends.createdAt))
      .limit(50);
  });

export const setEmailPreference = createServerFn({ method: "POST" })
  .validator(z.object({ orgId: z.string().min(1), optOut: z.boolean() }))
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    await db
      .update(schema.memberships)
      .set({ operationalEmailOptOut: data.optOut })
      .where(eq(schema.memberships.id, ctx.membershipId));
    return { ok: true as const };
  });

export const getMyEmailPreference = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const rows = await db
      .select({ optOut: schema.memberships.operationalEmailOptOut })
      .from(schema.memberships)
      .where(eq(schema.memberships.id, ctx.membershipId))
      .limit(1);
    return { optOut: rows[0]?.optOut ?? false };
  });
