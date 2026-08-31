import { env } from "cloudflare:workers";
import {
  createNotifications,
  deleteEmailDraftCore,
  deleteMemberDraftsCore,
  getEmailSendDetailCore,
  listEmailDraftsCore,
  listEmailSendRecipientsCore,
  listEmailSendsCore,
  listEmailSendsPageCore,
  listMySentEmailsCore,
  listMySentEmailsPageCore,
  listNotificationsCore,
  markAllNotificationsReadCore,
  markNotificationReadCore,
  membershipsForEmails,
  prepareEmailSend,
  recordAudit,
  resolveAudienceContactsForSelection,
  resolveEventAudienceContacts,
  saveEmailDraftCore,
  submittedFormEmailsForEvent,
} from "@everband/core";
import { type Database, schema } from "@everband/db";
import { hasStaffAccess } from "@everband/domain";
import {
  emailComposeSearchSchema,
  emailSendRecipientsListSchema,
  emailSendsListSchema,
  notificationIdSchema,
  notificationsPageSchema,
  orgIdSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, count, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";

// 队列消息 = 一封邮件（与 tasks consumer 的 EmailSendMessage 一致）
interface EmailSendMessage {
  sendId: string;
  recipientId: string;
}

// sendBatch 单次上限 100 条，收件人多的任务分批入队
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
  const messages: { body: EmailSendMessage }[] = recipients.map((recipient) => ({
    body: { sendId, recipientId: recipient.id },
  }));
  for (let i = 0; i < messages.length; i += 100) {
    await env.EMAIL_QUEUE.sendBatch(messages.slice(i, i + 100));
  }
}

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

    // 附件链接（站内鉴权下载，邮件内附链接）
    const updateAttachments = await db
      .select({ fileName: schema.attachments.fileName, id: schema.attachments.id })
      .from(schema.attachments)
      .where(
        and(
          eq(schema.attachments.organizationId, data.orgId),
          eq(schema.attachments.ownerType, "event_update"),
          eq(schema.attachments.ownerId, update.id),
        ),
      );
    const origin = getRequestUrl().origin;
    const attachmentLinks = updateAttachments.map(
      (a) => `${origin}/api/orgs/${data.orgId}/attachments/${a.id} (${a.fileName})`,
    );
    const attachmentsText =
      attachmentLinks.length > 0 ? `\n\nAttachments:\n${attachmentLinks.join("\n")}` : "";
    const isHtml = /<[^>]+>/.test(update.body);
    const htmlBody = isHtml
      ? `${update.body}<p><a href="${link}">View the event</a></p>${updateAttachments.length > 0 ? `<p>Attachments:<br/>${updateAttachments.map((a) => `<a href="${origin}/api/orgs/${data.orgId}/attachments/${a.id}">${a.fileName}</a>`).join("<br/>")}</p>` : ""}`
      : undefined;
    const textBody = `${
      isHtml
        ? update.body
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .trim()
        : update.body
    }\n\nView the event: ${link}${attachmentsText}`;

    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: data.orgId,
        kind: "event-update",
        subject: `Update: ${eventTitle} — ${update.title}`,
        body: textBody,
        html: htmlBody,
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
    await enqueueEmailRecipients(db, prepared.sendId);
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

export const getUnreadNotificationCount = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const rows = await db
      .select({ value: count() })
      .from(schema.notifications)
      .where(
        and(
          eq(schema.notifications.membershipId, ctx.membershipId),
          isNull(schema.notifications.readAt),
        ),
      );
    return rows[0]?.value ?? 0;
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

// 发送历史：staff 看全部；家长只能看到发给自己的（按邀请邮箱匹配收件人快照）
export const listEmailSends = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    if (hasStaffAccess(ctx.role, ctx.staffAccess)) {
      return listEmailSendsCore(db, data.orgId);
    }
    return listMySentEmailsCore(db, data.orgId, ctx.email);
  });

// 分页审计（Drawer 详情与历史分页）
export const listEmailSendsPage = createServerFn({ method: "GET" })
  .validator(emailSendsListSchema.extend({ orgId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    if (hasStaffAccess(ctx.role, ctx.staffAccess)) {
      return listEmailSendsPageCore(db, data.orgId, data);
    }
    return listMySentEmailsPageCore(db, data.orgId, ctx.email, data);
  });

export const getEmailSendDetail = createServerFn({ method: "GET" })
  .validator(z.object({ orgId: z.string().min(1), sendId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const detail = await getEmailSendDetailCore(db, data.orgId, data.sendId);
    if (!detail) return null;
    // 家长只能看包含自己的发送
    if (!hasStaffAccess(ctx.role, ctx.staffAccess)) {
      const own = detail.recipients.some((r) => r.email === ctx.email);
      if (!own) return null;
    }
    return detail;
  });

export const listEmailSendRecipients = createServerFn({ method: "GET" })
  .validator(
    emailSendRecipientsListSchema.extend({
      orgId: z.string().min(1),
      sendId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    // 家长视角：仅看自己的那一行（由 core 过滤后前端再兜底）
    if (!hasStaffAccess(ctx.role, ctx.staffAccess)) {
      const detail = await getEmailSendDetailCore(db, data.orgId, data.sendId);
      if (!detail || !detail.recipients.some((r) => r.email === ctx.email)) {
        return { items: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
      // 家长：强制过滤 email
      const all = await listEmailSendRecipientsCore(db, data.orgId, data.sendId, {
        ...data,
        q: ctx.email,
        page: 1,
        pageSize: 20,
      } as typeof data);
      // 再按 email 精确过滤
      const mine = all.items.filter((r) => r.email === ctx.email);
      return { items: mine, total: mine.length, page: 1, pageSize: 20 };
    }
    return listEmailSendRecipientsCore(db, data.orgId, data.sendId, data);
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

// ---------------------------------------------------------------------------
// 群发邮件（写信页）
// ---------------------------------------------------------------------------

// 写信页数据：解析受众 + 退订/RSVP 排除。收件人列表给全量（无分页），
// 家长按邮箱去重后的数量级（数百）一次返回即可。
export const getEmailComposeData = createServerFn({ method: "GET" })
  .validator(emailComposeSearchSchema.extend({ orgId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);

    const selection = {
      groupIds: data.groups ?? [],
      studentIds: data.students ?? [],
      eventId: data.event,
    };
    const [all, formEmails] = await Promise.all([
      resolveAudienceContactsForSelection(db, data.orgId, selection),
      data.excludeForm && data.event
        ? submittedFormEmailsForEvent(db, data.orgId, data.event)
        : Promise.resolve(new Set<string>()),
    ]);
    const memberships = await membershipsForEmails(
      db,
      data.orgId,
      all.map((contact) => contact.email),
    );
    const suppressedEmails = new Set(
      memberships.filter((m) => m.operationalEmailOptOut).map((m) => m.email),
    );

    const eventTitle = data.event
      ? (
          await db
            .select({ title: schema.events.title })
            .from(schema.events)
            .where(eq(schema.events.id, data.event))
            .limit(1)
        )[0]?.title
      : undefined;

    return {
      recipients: all.filter(
        (contact) => !suppressedEmails.has(contact.email) && !formEmails.has(contact.email),
      ),
      excludedByFormCount: all.filter((contact) => formEmails.has(contact.email)).length,
      suppressedCount: all.filter((contact) => suppressedEmails.has(contact.email)).length,
      eventTitle,
    };
  });

// 群发 dedupKey：内容 + 收件人集合一致即视为同一封（防手滑重复发送）。
// 催办场景换收件人 → key 变化 → 正常发送；内容/收件人完全相同的重复提交会被跳过。
async function bulkEmailDedupKey(input: {
  subject: string;
  cc: string;
  bcc: string;
  html: string;
  recipients: { email: string }[];
}): Promise<string> {
  const emails = input.recipients
    .map((recipient) => recipient.email)
    .sort()
    .join(",");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      `${input.subject}\n${input.cc}\n${input.bcc}\n${input.html}\n${emails}`,
    ),
  );
  const hex = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  return `bulk:${hex}`;
}

// 逗号分隔的多邮箱校验（支持单地址，也支持 "a@b.com, c@d.com"）
function isValidEmailList(value: string): boolean {
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 && parts.every((part) => z.email().safeParse(part).success);
}

function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const bulkRecipientSchema = z.object({
  contactId: z.string(),
  email: z.string().toLowerCase().pipe(z.email()),
  name: z.string(),
});

export const sendBulkEmail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orgId: z.string().min(1),
      subject: z.string().trim().min(1).max(200),
      cc: z
        .string()
        .trim()
        .optional()
        .refine((value) => !value || isValidEmailList(value), "Invalid CC email"),
      bcc: z
        .string()
        .trim()
        .optional()
        .refine((value) => !value || isValidEmailList(value), "Invalid BCC email"),
      html: z.string(),
      text: z.string(),
      groups: z.array(z.string().min(1)).optional(),
      students: z.array(z.string().min(1)).optional(),
      event: z.string().min(1).optional(),
      excludeForm: z.boolean().optional(),
      recipients: z.array(bulkRecipientSchema).min(1),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();

    // 服务端重算受众做白名单：客户端只能发送真实受众 ∩ 自己提交的收件人，
    // 防止伪造任意地址群发（TOCTOU 无实际风险：受众变化只会让合法收件人更少）
    const selection = {
      groupIds: data.groups ?? [],
      studentIds: data.students ?? [],
      eventId: data.event,
    };
    const [allowed, formEmails] = await Promise.all([
      resolveAudienceContactsForSelection(db, data.orgId, selection),
      data.excludeForm && data.event
        ? submittedFormEmailsForEvent(db, data.orgId, data.event)
        : Promise.resolve(new Set<string>()),
    ]);
    const allowedEmails = new Set(allowed.map((contact) => contact.email));
    const invalid = data.recipients.filter((recipient) => !allowedEmails.has(recipient.email));
    if (invalid.length > 0) {
      return { ok: false as const, error: "Some recipients are outside the resolved audience." };
    }
    const subject = data.subject.trim();
    const html = data.html.trim();
    const text = data.text.trim();
    if (!html && !text) {
      return { ok: false as const, error: "Message body is required." };
    }

    // 退订过滤：群发是运营邮件，尊重偏好（与 update 邮件一致）
    const memberships = await membershipsForEmails(
      db,
      data.orgId,
      data.recipients.map((recipient) => recipient.email),
    );
    const suppressedEmails = new Set(
      memberships.filter((m) => m.operationalEmailOptOut).map((m) => m.email),
    );

    const cc = data.cc ?? "";
    const bcc = data.bcc ?? "";
    const dedupKey = await bulkEmailDedupKey({
      subject,
      cc,
      bcc,
      html,
      recipients: data.recipients,
    });
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: data.orgId,
        kind: "bulk",
        subject,
        body: text || htmlToText(html),
        cc: cc || undefined,
        bcc: bcc || undefined,
        objectType: "bulk",
        objectId: dedupKey,
        dedupKey,
        audience: data.recipients,
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
        queuedCount: 0,
        suppressedCount: prepared.suppressedCount,
      };
    }

    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "email_send.requested",
      objectType: "email_send",
      objectId: prepared.sendId,
      summary: {
        kind: "bulk",
        recipientCount: data.recipients.length,
        queued: prepared.queuedCount,
        suppressed: prepared.suppressedCount,
        excludedByForm: formEmails.size,
      },
    });
    // 发送完成即清空该成员的草稿（可能尚未自动保存，按成员清理最稳）
    await deleteMemberDraftsCore(db, data.orgId, ctx.membershipId);
    await enqueueEmailRecipients(db, prepared.sendId);
    return {
      ok: true as const,
      deduplicated: false,
      sendId: prepared.sendId,
      queuedCount: prepared.queuedCount,
      suppressedCount: prepared.suppressedCount,
    };
  });

// ---------------------------------------------------------------------------
// 写信草稿（自动保存 + 恢复）
// ---------------------------------------------------------------------------

export const saveEmailDraft = createServerFn({ method: "POST" })
  .validator(
    z.object({
      orgId: z.string().min(1),
      subject: z.string().max(200),
      cc: z.string().max(500).optional(),
      bcc: z.string().max(500).optional(),
      html: z.string(),
      text: z.string(),
      recipients: z.array(bulkRecipientSchema),
      selection: z.object({
        groups: z.array(z.string()).optional(),
        students: z.array(z.string()).optional(),
        event: z.string().optional(),
        excludeForm: z.boolean().optional(),
      }),
    }),
  )
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const result = await saveEmailDraftCore(
      db,
      data.orgId,
      ctx.membershipId,
      {
        subject: data.subject,
        cc: data.cc ?? "",
        bcc: data.bcc ?? "",
        html: data.html,
        text: data.text,
        recipients: data.recipients,
        selection: data.selection,
      },
      Date.now(),
    );
    return { ok: true as const, draftId: result.draftId };
  });

export const listEmailDrafts = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return listEmailDraftsCore(db, data.orgId, ctx.membershipId);
  });

export const deleteEmailDraft = createServerFn({ method: "POST" })
  .validator(z.object({ orgId: z.string().min(1), draftId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    await deleteEmailDraftCore(db, data.orgId, ctx.membershipId, data.draftId);
    return { ok: true as const };
  });
