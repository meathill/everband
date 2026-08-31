// 通知与邮件 fan-out 核心（PRD §5.5）。
// prepareEmailSend：生产侧一次性落"任务 + 受众快照"（dedupKey 幂等）；
// processEmailRecipient：消费侧逐收件人发送（queue 消息 = 一封邮件，
// 重投不重发，投递 2 次失败标 failed，最后一条消息触发任务终态汇总）。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import type { EmailSender } from "@everband/integrations/email";
import type { ListResult, NotificationFilter } from "@everband/validation";
import { toOffset } from "@everband/validation";
import { and, asc, count, desc, eq, inArray, isNull, ne, or, type SQL } from "drizzle-orm";
import type { AudienceContact } from "./events.ts";
import { resolveEventAudienceContacts } from "./events.ts";

export interface PrepareEmailSendInput {
  organizationId: string;
  kind: string;
  subject: string;
  body: string;
  html?: string;
  // 抄送；群发时每封邮件同一地址（例如经办 staff 留底），多地址逗号分隔
  cc?: string;
  // 密送（同 cc，多地址逗号分隔）
  bcc?: string;
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
    html: input.html ?? null,
    cc: input.cc ?? null,
    bcc: input.bcc ?? null,
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

// 投递上限：一条收件人消息最多尝试 2 次（首次 + 1 次重试），仍失败即标 failed 终态
export const MAX_SEND_ATTEMPTS = 2;

// 终态失败：重试不会改变结果，直接标 failed，不浪费投递机会
const PERMANENT_SEND_ERROR_PREFIXES = [
  "E_RECIPIENT_SUPPRESSED",
  "E_RECIPIENT_NOT_ALLOWED",
  "E_VALIDATION_ERROR",
  "E_FIELD_MISSING",
  "E_SENDER_NOT_VERIFIED",
  "E_SENDER_DOMAIN_NOT_AVAILABLE",
  "E_CONTENT_TOO_LARGE",
  "E_HEADER",
];

// 错误分级：临时错误（限流/瞬时故障）允许重试；其余（含未知错误）也重试一次，
// 由 MAX_SEND_ATTEMPTS 兜底，避免偶发网络问题直接判死
export function isRetryableSendError(error: string): boolean {
  return !PERMANENT_SEND_ERROR_PREFIXES.some((prefix) => error.startsWith(prefix));
}

export type ProcessEmailRecipientOutcome = "sent" | "failed" | "retryable" | "skipped";

/**
 * 消费者：处理单个收件人（queue 消息 = 一封邮件，平台负责并行与重投）。
 * 重投安全——状态非 queued 直接跳过；投递失败按错误分级：
 * 终态错误标 failed；临时错误在未达到 MAX_SEND_ATTEMPTS 前保持 queued（返回
 * retryable 让调用方重试），次数耗尽标 failed。
 * 每个收件人处理完做一次"任务收尾检查"：无剩余 queued 时幂等覆盖写终态汇总。
 */
export async function processEmailRecipient(
  db: Database,
  sender: EmailSender,
  input: { sendId: string; recipientId: string; attempts: number; now: number },
): Promise<{ outcome: ProcessEmailRecipientOutcome; error?: string }> {
  const recipients = await db
    .select({
      id: schema.emailSendRecipients.id,
      email: schema.emailSendRecipients.email,
      status: schema.emailSendRecipients.status,
    })
    .from(schema.emailSendRecipients)
    .where(
      and(
        eq(schema.emailSendRecipients.id, input.recipientId),
        eq(schema.emailSendRecipients.sendId, input.sendId),
      ),
    )
    .limit(1);
  const recipient = recipients[0];
  if (recipient?.status !== "queued") {
    return { outcome: "skipped" };
  }

  const sends = await db
    .select({
      subject: schema.emailSends.subject,
      body: schema.emailSends.body,
      html: schema.emailSends.html,
      cc: schema.emailSends.cc,
      bcc: schema.emailSends.bcc,
      kind: schema.emailSends.kind,
    })
    .from(schema.emailSends)
    .where(eq(schema.emailSends.id, input.sendId))
    .limit(1);
  const send = sends[0];
  if (!send) {
    await markRecipientFailed(db, input.sendId, recipient.id, "send task missing");
    return { outcome: "failed", error: "send task missing" };
  }

  const result = await sender.send({
    to: recipient.email,
    subject: send.subject,
    text: send.body,
    html: send.html ?? undefined,
    cc: send.cc ?? undefined,
    bcc: send.bcc ?? undefined,
    kind: send.kind,
  });
  if (result.ok) {
    await db
      .update(schema.emailSendRecipients)
      .set({ status: "sent", sentAt: input.now, attemptCount: input.attempts })
      .where(eq(schema.emailSendRecipients.id, recipient.id));
    await finalizeEmailSendIfDone(db, input.sendId);
    return { outcome: "sent" };
  }

  // 失败分级：终态直接 failed；临时错误 2 次内返回 retryable，耗尽后 failed
  const retryable = isRetryableSendError(result.error);
  if (!retryable || input.attempts >= MAX_SEND_ATTEMPTS) {
    await markRecipientFailed(db, input.sendId, recipient.id, result.error);
    return { outcome: "failed", error: result.error };
  }
  await db
    .update(schema.emailSendRecipients)
    .set({ attemptCount: input.attempts })
    .where(eq(schema.emailSendRecipients.id, recipient.id));
  return { outcome: "retryable", error: result.error };
}

async function markRecipientFailed(
  db: Database,
  sendId: string,
  recipientId: string,
  error: string,
): Promise<void> {
  await db
    .update(schema.emailSendRecipients)
    .set({ status: "failed", error, attemptCount: MAX_SEND_ATTEMPTS })
    .where(eq(schema.emailSendRecipients.id, recipientId));
  await finalizeEmailSendIfDone(db, sendId);
}

// 任务收尾：无剩余 queued/processing 收件人时，覆盖写终态汇总。
// 幂等覆盖写 → 并发下多个收件人消息同时收尾也安全；最后一条必然触发。
async function finalizeEmailSendIfDone(db: Database, sendId: string): Promise<void> {
  const rows = await db
    .select({ status: schema.emailSendRecipients.status })
    .from(schema.emailSendRecipients)
    .where(eq(schema.emailSendRecipients.sendId, sendId));
  const pending = rows.filter((row) => row.status === "queued").length;
  if (pending > 0) {
    return;
  }
  const sent = rows.filter((row) => row.status === "sent").length;
  const failed = rows.filter((row) => row.status === "failed").length;
  const finalStatus = failed === 0 ? "succeeded" : sent === 0 ? "failed" : "partial";
  await db
    .update(schema.emailSends)
    .set({ status: finalStatus, sentCount: sent, failedCount: failed, finishedAt: Date.now() })
    .where(eq(schema.emailSends.id, sendId));
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

// ---------------------------------------------------------------------------
// 群发受众（群发邮件）
// ---------------------------------------------------------------------------

export interface AudienceSelection {
  /** 目标 group 的 id 列表（active 学生） */
  groupIds?: string[];
  /** 目标学生的 id 列表（active 学生） */
  studentIds?: string[];
  /** 目标 event（复用其受众规则：isOrgWide 或 eventGroups） */
  eventId?: string;
}

/**
 * 群发受众：group / student / event 三种来源取并集，只含 active 学生的联系人，
 * 按最终邮箱去重（PRD §5.1）。退订与 RSVP 排除由调用方另行叠加。
 */
export async function resolveAudienceContactsForSelection(
  db: Database,
  orgId: string,
  selection: AudienceSelection,
): Promise<AudienceContact[]> {
  const byEmail = new Map<string, AudienceContact>();

  if (selection.eventId) {
    for (const contact of await resolveEventAudienceContacts(db, orgId, selection.eventId)) {
      if (!byEmail.has(contact.email)) {
        byEmail.set(contact.email, contact);
      }
    }
  }

  const idParts: SQL[] = [];
  if (selection.groupIds?.length) {
    idParts.push(inArray(schema.students.groupId, selection.groupIds));
  }
  if (selection.studentIds?.length) {
    idParts.push(inArray(schema.students.id, selection.studentIds));
  }
  if (idParts.length > 0) {
    const rows = await db
      .select({
        contactId: schema.contacts.id,
        email: schema.contacts.email,
        name: schema.contacts.name,
      })
      .from(schema.students)
      .innerJoin(schema.studentContacts, eq(schema.studentContacts.studentId, schema.students.id))
      .innerJoin(schema.contacts, eq(schema.contacts.id, schema.studentContacts.contactId))
      .where(
        and(
          eq(schema.students.organizationId, orgId),
          eq(schema.students.status, "active"),
          or(...idParts),
        ),
      );
    for (const row of rows) {
      if (!byEmail.has(row.email)) {
        byEmail.set(row.email, row);
      }
    }
  }

  return [...byEmail.values()];
}

/**
 * 已提交指定 event 主表单（如 RSVP）的 active 家长邮箱。
 * 催办场景：从收件人里剔除这些人，只发给没交表单的家庭。
 */
export async function submittedFormEmailsForEvent(
  db: Database,
  orgId: string,
  eventId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ email: schema.memberships.invitedEmail })
    .from(schema.formSubmissions)
    .innerJoin(schema.eventForms, eq(schema.eventForms.id, schema.formSubmissions.formId))
    .innerJoin(schema.memberships, eq(schema.memberships.id, schema.formSubmissions.membershipId))
    .where(
      and(
        eq(schema.eventForms.organizationId, orgId),
        eq(schema.eventForms.eventId, eventId),
        eq(schema.memberships.status, "active"),
      ),
    );
  return new Set(rows.map((row) => row.email));
}

// ---------------------------------------------------------------------------
// 发送历史（staff 看全部；家长只看发给自己的）
// ---------------------------------------------------------------------------

export type EmailSendRow = typeof schema.emailSends.$inferSelect;

export async function listEmailSendsCore(db: Database, orgId: string): Promise<EmailSendRow[]> {
  return db
    .select()
    .from(schema.emailSends)
    .where(eq(schema.emailSends.organizationId, orgId))
    .orderBy(desc(schema.emailSends.createdAt))
    .limit(50);
}

/**
 * 家长视角：发给指定邮箱的邮件（收件人快照匹配）。
 * suppressed（退订没发出去的）不展示；queued/sent/failed 都如实显示。
 * email_send_recipients 有 (sendId, email) 唯一约束，同一封不会重复出现。
 */
export async function listMySentEmailsCore(
  db: Database,
  orgId: string,
  email: string,
): Promise<EmailSendRow[]> {
  return db
    .selectDistinct({
      id: schema.emailSends.id,
      organizationId: schema.emailSends.organizationId,
      kind: schema.emailSends.kind,
      subject: schema.emailSends.subject,
      body: schema.emailSends.body,
      html: schema.emailSends.html,
      cc: schema.emailSends.cc,
      bcc: schema.emailSends.bcc,
      objectType: schema.emailSends.objectType,
      objectId: schema.emailSends.objectId,
      requestedByMembershipId: schema.emailSends.requestedByMembershipId,
      dedupKey: schema.emailSends.dedupKey,
      status: schema.emailSends.status,
      recipientCount: schema.emailSends.recipientCount,
      sentCount: schema.emailSends.sentCount,
      failedCount: schema.emailSends.failedCount,
      suppressedCount: schema.emailSends.suppressedCount,
      createdAt: schema.emailSends.createdAt,
      finishedAt: schema.emailSends.finishedAt,
    })
    .from(schema.emailSends)
    .innerJoin(
      schema.emailSendRecipients,
      eq(schema.emailSendRecipients.sendId, schema.emailSends.id),
    )
    .where(
      and(
        eq(schema.emailSends.organizationId, orgId),
        eq(schema.emailSendRecipients.email, email),
        ne(schema.emailSendRecipients.status, "suppressed"),
      ),
    )
    .orderBy(desc(schema.emailSends.createdAt))
    .limit(50);
}
