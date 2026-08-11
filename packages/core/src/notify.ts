// 通知与邮件 fan-out 核心（PRD §5.5）。
// prepareEmailSend：生产侧一次性落"任务 + 受众快照"（dedupKey 幂等）；
// processEmailSend：消费侧逐收件人发送（消费前状态检查，重投不重发）。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import type { EmailSender } from "@everband/integrations/email";
import type { ListResult, NotificationFilter } from "@everband/validation";
import { toOffset } from "@everband/validation";
import { and, asc, count, desc, eq, inArray, isNull } from "drizzle-orm";
import type { AudienceContact } from "./events.ts";

export interface PrepareEmailSendInput {
  organizationId: string;
  kind: string;
  subject: string;
  body: string;
  objectType: string;
  objectId: string;
  dedupKey: string;
  audience: AudienceContact[];
  // 已退订非必要运营邮件的地址（快照中标记 suppressed，不发送）
  suppressedEmails: ReadonlySet<string>;
  requestedByMembershipId: string;
}

export interface PrepareEmailSendResult {
  sendId: string;
  created: boolean;
  queuedCount: number;
  suppressedCount: number;
}

export async function prepareEmailSend(
  db: Database,
  input: PrepareEmailSendInput,
  now: number,
): Promise<PrepareEmailSendResult> {
  const existing = await db
    .select({ id: schema.emailSends.id })
    .from(schema.emailSends)
    .where(eq(schema.emailSends.dedupKey, input.dedupKey))
    .limit(1);
  const found = existing[0];
  if (found) {
    return { sendId: found.id, created: false, queuedCount: 0, suppressedCount: 0 };
  }

  const sendId = generateId(ID_PREFIXES.emailSend);
  const queued = input.audience.filter((contact) => !input.suppressedEmails.has(contact.email));
  const suppressed = input.audience.filter((contact) => input.suppressedEmails.has(contact.email));

  await db.insert(schema.emailSends).values({
    id: sendId,
    organizationId: input.organizationId,
    kind: input.kind,
    subject: input.subject,
    body: input.body,
    objectType: input.objectType,
    objectId: input.objectId,
    requestedByMembershipId: input.requestedByMembershipId,
    dedupKey: input.dedupKey,
    status: "queued",
    recipientCount: input.audience.length,
    suppressedCount: suppressed.length,
    createdAt: now,
  });
  if (input.audience.length > 0) {
    await db.insert(schema.emailSendRecipients).values(
      input.audience.map((contact) => ({
        id: generateId(ID_PREFIXES.emailSendRecipient),
        sendId,
        organizationId: input.organizationId,
        email: contact.email,
        contactId: contact.contactId,
        status: input.suppressedEmails.has(contact.email)
          ? ("suppressed" as const)
          : ("queued" as const),
      })),
    );
  }
  return { sendId, created: true, queuedCount: queued.length, suppressedCount: suppressed.length };
}

// 消费者：逐收件人发送。重投递安全——只处理仍为 queued 的收件人。
export async function processEmailSend(
  db: Database,
  sender: EmailSender,
  sendId: string,
  now: number,
): Promise<{ processed: boolean }> {
  const claimed = await db
    .update(schema.emailSends)
    .set({ status: "processing" })
    .where(
      and(
        eq(schema.emailSends.id, sendId),
        inArray(schema.emailSends.status, ["queued", "processing"]),
      ),
    )
    .returning({
      id: schema.emailSends.id,
      subject: schema.emailSends.subject,
      body: schema.emailSends.body,
      kind: schema.emailSends.kind,
    });
  const send = claimed[0];
  if (!send) {
    return { processed: false };
  }

  const recipients = await db
    .select({ id: schema.emailSendRecipients.id, email: schema.emailSendRecipients.email })
    .from(schema.emailSendRecipients)
    .where(
      and(
        eq(schema.emailSendRecipients.sendId, sendId),
        eq(schema.emailSendRecipients.status, "queued"),
      ),
    );

  for (const recipient of recipients) {
    const result = await sender.send({
      to: recipient.email,
      subject: send.subject,
      text: send.body,
      kind: send.kind,
    });
    await db
      .update(schema.emailSendRecipients)
      .set(
        result.ok
          ? { status: "sent", sentAt: now, attemptCount: 1 }
          : { status: "failed", error: result.error, attemptCount: 1 },
      )
      .where(eq(schema.emailSendRecipients.id, recipient.id));
  }

  // 汇总终态：任何 queued 之外的组合 → succeeded / partial / failed
  const rows = await db
    .select({ status: schema.emailSendRecipients.status })
    .from(schema.emailSendRecipients)
    .where(eq(schema.emailSendRecipients.sendId, sendId));
  const sent = rows.filter((row) => row.status === "sent").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const finalStatus = failed === 0 ? "succeeded" : sent === 0 ? "failed" : "partial";
  await db
    .update(schema.emailSends)
    .set({ status: finalStatus, sentCount: sent, failedCount: failed, finishedAt: now })
    .where(eq(schema.emailSends.id, sendId));
  return { processed: true };
}

// 站内通知：按 membership 批量写入
export async function createNotifications(
  db: Database,
  organizationId: string,
  membershipIds: string[],
  content: {
    type: string;
    title: string;
    linkPath?: string;
    objectType?: string;
    objectId?: string;
  },
  now: number,
): Promise<void> {
  if (membershipIds.length === 0) {
    return;
  }
  await db.insert(schema.notifications).values(
    membershipIds.map((membershipId) => ({
      id: generateId(ID_PREFIXES.notification),
      organizationId,
      membershipId,
      type: content.type,
      title: content.title,
      linkPath: content.linkPath ?? null,
      objectType: content.objectType ?? null,
      objectId: content.objectId ?? null,
      createdAt: now,
    })),
  );
}

// ---------------------------------------------------------------------------
// 收件箱（本人数据，调用方已经确认过 membership 归属，这里只按 membershipId 取）
// ---------------------------------------------------------------------------

export interface NotificationRow {
  id: string;
  type: string;
  title: string;
  linkPath: string | null;
  createdAt: number;
  readAt: number | null;
}

export interface ListNotificationsInput {
  page: number;
  pageSize: number;
  filter: NotificationFilter;
}

/**
 * 收件箱分页。排序固定"最新在前"（通知没有第二种有意义的排法），
 * unreadCount 一并返回：顶部的 "Mark all read" 要据此决定是否可用，
 * 而 unread 筛选下的 total 并不能代表全部未读数。
 */
export async function listNotificationsCore(
  db: Database,
  membershipId: string,
  input: ListNotificationsInput,
): Promise<ListResult<NotificationRow> & { unreadCount: number }> {
  const mine = eq(schema.notifications.membershipId, membershipId);
  const where =
    input.filter === "unread" ? and(mine, isNull(schema.notifications.readAt)) : and(mine);

  const [rows, totals, unread] = await Promise.all([
    db
      .select({
        id: schema.notifications.id,
        type: schema.notifications.type,
        title: schema.notifications.title,
        linkPath: schema.notifications.linkPath,
        createdAt: schema.notifications.createdAt,
        readAt: schema.notifications.readAt,
      })
      .from(schema.notifications)
      .where(where)
      // id 兜底：同毫秒写入的一批通知（fan-out 是批量插入）顺序才稳定，翻页不会重复或丢行
      .orderBy(desc(schema.notifications.createdAt), asc(schema.notifications.id))
      .limit(input.pageSize)
      .offset(toOffset(input.page, input.pageSize)),
    db.select({ value: count() }).from(schema.notifications).where(where),
    db
      .select({ value: count() })
      .from(schema.notifications)
      .where(and(mine, isNull(schema.notifications.readAt))),
  ]);

  return {
    items: rows,
    total: totals[0]?.value ?? 0,
    page: input.page,
    pageSize: input.pageSize,
    unreadCount: unread[0]?.value ?? 0,
  };
}

/** 单条标记已读。已读的再点一次不做事（WHERE 里带 readAt IS NULL）。 */
export async function markNotificationReadCore(
  db: Database,
  membershipId: string,
  notificationId: string,
  now: number,
): Promise<{ ok: boolean }> {
  const updated = await db
    .update(schema.notifications)
    .set({ readAt: now })
    .where(
      and(
        eq(schema.notifications.id, notificationId),
        eq(schema.notifications.membershipId, membershipId),
        isNull(schema.notifications.readAt),
      ),
    )
    .returning({ id: schema.notifications.id });
  return { ok: updated.length > 0 };
}

/** 全部标记已读，返回本次真正被改动的条数。 */
export async function markAllNotificationsReadCore(
  db: Database,
  membershipId: string,
  now: number,
): Promise<{ updated: number }> {
  const updated = await db
    .update(schema.notifications)
    .set({ readAt: now })
    .where(
      and(eq(schema.notifications.membershipId, membershipId), isNull(schema.notifications.readAt)),
    )
    .returning({ id: schema.notifications.id });
  return { updated: updated.length };
}

// 受众邮箱 → 对应的 active membership（站内通知目标 + 退订过滤都用它）
export async function membershipsForEmails(
  db: Database,
  organizationId: string,
  emails: string[],
): Promise<{ membershipId: string; email: string; operationalEmailOptOut: boolean }[]> {
  if (emails.length === 0) {
    return [];
  }
  const rows = await db
    .select({
      membershipId: schema.memberships.id,
      email: schema.memberships.invitedEmail,
      operationalEmailOptOut: schema.memberships.operationalEmailOptOut,
    })
    .from(schema.memberships)
    .where(
      and(
        eq(schema.memberships.organizationId, organizationId),
        eq(schema.memberships.status, "active"),
        inArray(schema.memberships.invitedEmail, emails),
      ),
    );
  return rows;
}
