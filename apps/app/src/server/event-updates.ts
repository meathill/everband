// 活动更新（EventUpdate）的 server functions。
// 从 events.ts 拆出：活动本身与它的更新是两条独立的写入链路，放一起会让单文件超长。

import { env } from "cloudflare:workers";
import {
  createNotifications,
  membershipsForEmails,
  prepareEmailSend,
  recordAudit,
  resolveEventAudienceContacts,
} from "@everband/core";
import { type Database, schema } from "@everband/db";
import { canTransitionEventUpdate, generateId, ID_PREFIXES } from "@everband/domain";
import {
  createEventUpdateSchema,
  deleteEventUpdateSchema,
  editEventUpdateSchema,
  publishEventUpdateSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

async function enqueueEmailRecipients(db: Database, sendId: string): Promise<void> {
  const recipients = await db
    .select({ id: schema.emailSendRecipients.id })
    .from(schema.emailSendRecipients)
    .where(
      and(
        eq(schema.emailSendRecipients.sendId, sendId),
        eq(schema.emailSendRecipients.status, "queued"),
      ),
    );
  const messages: { body: { sendId: string; recipientId: string } }[] = recipients.map((r) => ({
    body: { sendId, recipientId: r.id },
  }));
  for (let i = 0; i < messages.length; i += 100) {
    await env.EMAIL_QUEUE.sendBatch(messages.slice(i, i + 100));
  }
}

export const createEventUpdate = createServerFn({ method: "POST" })
  .validator(createEventUpdateSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const updateId = generateId(ID_PREFIXES.eventUpdate);
    const shouldSend = Boolean(data.alsoSendEmail);
    // 存 html（富文本）到 body，兼容旧纯文本；email 用 bodyHtml + body 分别发 html/text
    const html = data.bodyHtml?.trim() ? data.bodyHtml : undefined;
    const bodyForDb = html ?? data.body;
    const status = shouldSend ? ("published" as const) : ("draft" as const);

    await db.insert(schema.eventUpdates).values({
      id: updateId,
      organizationId: data.orgId,
      eventId: data.eventId,
      title: data.title,
      body: bodyForDb,
      status,
      publishedAt: shouldSend ? now : null,
      createdByMembershipId: ctx.membershipId,
      createdAt: now,
    });
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: shouldSend ? "event_update.created_and_published" : "event_update.created",
      objectType: "event_update",
      objectId: updateId,
      summary: { eventId: data.eventId, title: data.title, alsoSend: shouldSend },
    });

    if (!shouldSend) {
      return { ok: true as const, updateId, emailed: false as const };
    }

    // alsoSend: 复用投递链路（与 sendUpdateEmail 同逻辑，但直接用新 update 的内容）
    const events = await db
      .select({ title: schema.events.title })
      .from(schema.events)
      .where(eq(schema.events.id, data.eventId))
      .limit(1);
    const eventTitle = events[0]?.title ?? "Event";
    const audience = await resolveEventAudienceContacts(db, data.orgId, data.eventId);
    if (audience.length === 0) {
      return {
        ok: true as const,
        updateId,
        emailed: false as const,
        emailError: "No recipients in the event audience.",
      };
    }
    const memberships = await membershipsForEmails(
      db,
      data.orgId,
      audience.map((c) => c.email),
    );
    const suppressedEmails = new Set(
      memberships.filter((m) => m.operationalEmailOptOut).map((m) => m.email),
    );
    const dedupKey = `event_update:${updateId}:${now}`;
    const origin = (() => {
      try {
        return getRequestUrl().origin;
      } catch {
        return "";
      }
    })();
    const link = origin
      ? `${origin}/o/${data.orgId}/events/${data.eventId}`
      : `/o/${data.orgId}/events/${data.eventId}`;
    const textBody = data.body.trim();
    const emailHtml = html ? `${html}<p><a href="${link}">View the event</a></p>` : undefined;
    const emailText = `${textBody}\n\nView the event: ${link}`;

    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: data.orgId,
        kind: "event-update",
        subject: `Update: ${eventTitle} — ${data.title}`,
        body: emailText,
        html: emailHtml,
        objectType: "event_update",
        objectId: updateId,
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
        updateId,
        emailed: true as const,
        deduplicated: true as const,
        sendId: prepared.sendId,
      };
    }
    await createNotifications(
      db,
      data.orgId,
      memberships.map((m) => m.membershipId),
      {
        type: "event-update",
        title: `${eventTitle}: ${data.title}`,
        linkPath: `/o/${data.orgId}/events/${data.eventId}`,
        objectType: "event_update",
        objectId: updateId,
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
        updateId,
        recipientCount: audience.length,
        queued: prepared.queuedCount,
        suppressed: prepared.suppressedCount,
      },
    });
    await enqueueEmailRecipients(db, prepared.sendId);
    return {
      ok: true as const,
      updateId,
      emailed: true as const,
      deduplicated: false as const,
      sendId: prepared.sendId,
    };
  });

export const editEventUpdate = createServerFn({ method: "POST" })
  .validator(editEventUpdateSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    // 发布后可编辑，但不自动重发邮件（PRD §5.2）；富文本 html 存 body
    const bodyForDb = data.bodyHtml?.trim() ? data.bodyHtml : data.body;
    const rows = await db
      .update(schema.eventUpdates)
      .set({ title: data.title, body: bodyForDb, lastEditedAt: now })
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
