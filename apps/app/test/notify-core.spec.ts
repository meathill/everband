import { env } from "cloudflare:test";
import {
  listEmailSendsCore,
  listMySentEmailsCore,
  listNotificationsCore,
  markAllNotificationsReadCore,
  markNotificationReadCore,
  prepareEmailSend,
  processEmailRecipient,
  resolveAudienceContactsForSelection,
  submittedFormEmailsForEvent,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import type { EmailSender, SendResult } from "@everband/integrations/email";
import { MockEmailSender } from "@everband/integrations/email";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_500_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedOrg(): Promise<{ orgId: string; membershipId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  await db.insert(schema.organizations).values({
    id: orgId,
    name: unique("Org"),
    type: "band",
    timezone: "Australia/Sydney",
    createdAt: NOW,
  });
  await db.insert(schema.memberships).values({
    id: membershipId,
    organizationId: orgId,
    role: "owner",
    status: "active",
    invitedEmail: `${unique("o")}@test.local`,
    createdAt: NOW,
  });
  return { orgId, membershipId };
}

function audienceOf(...emails: string[]) {
  return emails.map((email) => ({
    contactId: generateId(ID_PREFIXES.contact),
    email,
    name: email,
  }));
}

async function seedNotification(
  orgId: string,
  membershipId: string,
  createdAt: number,
  readAt: number | null = null,
): Promise<string> {
  const id = generateId(ID_PREFIXES.notification);
  await db.insert(schema.notifications).values({
    id,
    organizationId: orgId,
    membershipId,
    type: "event-update",
    title: unique("Notice"),
    readAt,
    createdAt,
  });
  return id;
}

// 学生 + 联系人：多个学生可共享同一邮箱（去重场景，共享时复用 contactId），
// group 可为 null（未分组）
async function seedStudent(
  orgId: string,
  groupId: string | null,
  contactEmails: string[],
  sharedContactId?: string,
): Promise<{ studentId: string; contactId: string }> {
  const householdId = generateId(ID_PREFIXES.household);
  await db.insert(schema.households).values({
    id: householdId,
    organizationId: orgId,
    name: unique("HH"),
    createdAt: NOW,
  });
  const studentId = generateId(ID_PREFIXES.student);
  await db.insert(schema.students).values({
    id: studentId,
    organizationId: orgId,
    householdId,
    name: unique("S"),
    status: "active",
    groupId,
    statusChangedAt: NOW,
    createdAt: NOW,
  });
  let firstContactId = sharedContactId;
  for (const email of contactEmails) {
    const contactId = firstContactId ?? generateId(ID_PREFIXES.contact);
    if (!firstContactId) {
      await db.insert(schema.contacts).values({
        id: contactId,
        organizationId: orgId,
        householdId,
        name: unique("C"),
        email,
        createdAt: NOW,
      });
    }
    firstContactId = contactId;
    await db.insert(schema.studentContacts).values({
      organizationId: orgId,
      studentId,
      contactId,
      relationship: "parent",
    });
  }
  return { studentId, contactId: firstContactId };
}

describe("notifications inbox", () => {
  it("分页稳定、未读筛选与未读总数互不混淆", async () => {
    const { orgId, membershipId } = await seedOrg();
    const oldest = await seedNotification(orgId, membershipId, NOW - 2);
    const middle = await seedNotification(orgId, membershipId, NOW - 1, NOW);
    const newest = await seedNotification(orgId, membershipId, NOW);

    const first = await listNotificationsCore(db, membershipId, {
      page: 1,
      pageSize: 2,
      filter: "all",
    });
    const second = await listNotificationsCore(db, membershipId, {
      page: 2,
      pageSize: 2,
      filter: "all",
    });
    expect(first.total).toBe(3);
    expect(first.unreadCount).toBe(2);
    expect(first.items.map((row) => row.id)).toEqual([newest, middle]);
    expect(second.items.map((row) => row.id)).toEqual([oldest]);

    const unread = await listNotificationsCore(db, membershipId, {
      page: 1,
      pageSize: 20,
      filter: "unread",
    });
    expect(unread.total).toBe(2);
    expect(unread.unreadCount).toBe(2);
    expect(new Set(unread.items.map((row) => row.id))).toEqual(new Set([newest, oldest]));
  });

  it("单条已读不能越过 membership，全部已读只修改本人", async () => {
    const { orgId, membershipId } = await seedOrg();
    const otherMembershipId = generateId(ID_PREFIXES.membership);
    await db.insert(schema.memberships).values({
      id: otherMembershipId,
      organizationId: orgId,
      role: "parent",
      status: "active",
      invitedEmail: `${unique("parent")}@test.local`,
      createdAt: NOW,
    });
    const mine = await seedNotification(orgId, membershipId, NOW);
    const theirs = await seedNotification(orgId, otherMembershipId, NOW);

    expect((await markNotificationReadCore(db, membershipId, theirs, NOW + 1)).ok).toBe(false);
    expect((await markNotificationReadCore(db, membershipId, mine, NOW + 1)).ok).toBe(true);
    expect((await markNotificationReadCore(db, membershipId, mine, NOW + 2)).ok).toBe(false);

    await seedNotification(orgId, membershipId, NOW + 2);
    expect((await markAllNotificationsReadCore(db, membershipId, NOW + 3)).updated).toBe(1);
    const rows = await db
      .select({ id: schema.notifications.id, readAt: schema.notifications.readAt })
      .from(schema.notifications)
      .where(eq(schema.notifications.organizationId, orgId));
    expect(rows.find((row) => row.id === theirs)?.readAt).toBeNull();
    expect(rows.filter((row) => row.id !== theirs).every((row) => row.readAt !== null)).toBe(true);
  });
});

describe("prepareEmailSend（快照 + 幂等 + 退订 + cc）", () => {
  it("dedupKey 相同的第二次请求不创建新任务", async () => {
    const { orgId, membershipId } = await seedOrg();
    const dedupKey = unique("dk");
    const input = {
      organizationId: orgId,
      kind: "event-update",
      subject: "S",
      body: "B",
      objectType: "event_update",
      objectId: "upd_x",
      dedupKey,
      audience: audienceOf(`${unique("a")}@test.local`),
      suppressedEmails: new Set<string>(),
      requestedByMembershipId: membershipId,
    };
    const first = await prepareEmailSend(db, input, NOW);
    const second = await prepareEmailSend(db, input, NOW + 1);
    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.sendId).toBe(first.sendId);
  });

  it("退订地址进入快照但标记 suppressed；cc 存入任务", async () => {
    const { orgId, membershipId } = await seedOrg();
    const optedOut = `${unique("opt")}@test.local`;
    const normal = `${unique("n")}@test.local`;
    const result = await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "event-update",
        subject: "S",
        body: "B",
        cc: "cc@test.local",
        objectType: "event_update",
        objectId: "upd_y",
        dedupKey: unique("dk"),
        audience: audienceOf(optedOut, normal),
        suppressedEmails: new Set([optedOut]),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );
    expect(result.queuedCount).toBe(1);
    expect(result.suppressedCount).toBe(1);
    const rows = await db
      .select()
      .from(schema.emailSendRecipients)
      .where(eq(schema.emailSendRecipients.sendId, result.sendId));
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.email === optedOut)?.status).toBe("suppressed");
    expect(rows.find((r) => r.email === normal)?.status).toBe("queued");
    const sends = await db
      .select({ cc: schema.emailSends.cc })
      .from(schema.emailSends)
      .where(eq(schema.emailSends.id, result.sendId));
    expect(sends[0]?.cc).toBe("cc@test.local");
  });
});

async function recipientRows(sendId: string) {
  return db
    .select({ id: schema.emailSendRecipients.id, email: schema.emailSendRecipients.email })
    .from(schema.emailSendRecipients)
    .where(eq(schema.emailSendRecipients.sendId, sendId));
}

function findRecipientRow(
  rows: { id: string; email: string }[],
  email: string,
): { id: string; email: string } {
  const row = rows.find((candidate) => candidate.email === email);
  if (!row) {
    throw new Error(`missing recipient row: ${email}`);
  }
  return row;
}

// 固定错误 sender：可重试/终态错误各测各的
class FixedErrorSender implements EmailSender {
  constructor(private readonly error: string) {}
  async send(): Promise<SendResult> {
    return { ok: false, error: this.error };
  }
}

describe("processEmailRecipient（逐收件人 + 错误分级 + 收尾汇总）", () => {
  it("发送成功（含 cc）；重投不重发；suppressed 不发送；收尾 succeeded", async () => {
    const { orgId, membershipId } = await seedOrg();
    const optedOut = `${unique("s")}@test.local`;
    const normal = `${unique("m")}@test.local`;
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "bulk",
        subject: "S",
        body: "B",
        cc: "cc@test.local",
        objectType: "bulk",
        objectId: "obj",
        dedupKey: unique("dk"),
        audience: audienceOf(optedOut, normal),
        suppressedEmails: new Set([optedOut]),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );
    const rows = await recipientRows(prepared.sendId);
    const normalRow = findRecipientRow(rows, normal);

    const sender = new MockEmailSender();
    const result = await processEmailRecipient(db, sender, {
      sendId: prepared.sendId,
      recipientId: normalRow.id,
      attempts: 1,
      now: NOW,
    });
    expect(result.outcome).toBe("sent");
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe(normal);
    expect(sender.sent[0]?.cc).toBe("cc@test.local");

    // 重投同一条消息：状态非 queued → 直接跳过
    const again = await processEmailRecipient(db, sender, {
      sendId: prepared.sendId,
      recipientId: normalRow.id,
      attempts: 2,
      now: NOW + 1,
    });
    expect(again.outcome).toBe("skipped");
    expect(sender.sent).toHaveLength(1);

    // suppressed 的收件人没有消息，但任务汇总要收敛
    const sends = await db
      .select()
      .from(schema.emailSends)
      .where(eq(schema.emailSends.id, prepared.sendId));
    expect(sends[0]?.status).toBe("succeeded");
    expect(sends[0]?.sentCount).toBe(1);
  });

  it("终态错误（E_RECIPIENT_SUPPRESSED）首次投递即 failed，不重试", async () => {
    const { orgId, membershipId } = await seedOrg();
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "bulk",
        subject: "S",
        body: "B",
        objectType: "bulk",
        objectId: "obj",
        dedupKey: unique("dk"),
        audience: audienceOf(`${unique("a")}@test.local`),
        suppressedEmails: new Set<string>(),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );
    const rows = await recipientRows(prepared.sendId);
    const row = rows[0];
    if (!row) {
      throw new Error("missing recipient row");
    }

    const result = await processEmailRecipient(
      db,
      new FixedErrorSender("E_RECIPIENT_SUPPRESSED: bounce"),
      {
        sendId: prepared.sendId,
        recipientId: row.id,
        attempts: 1,
        now: NOW,
      },
    );
    expect(result.outcome).toBe("failed");

    const failed = await db
      .select({
        status: schema.emailSendRecipients.status,
        error: schema.emailSendRecipients.error,
      })
      .from(schema.emailSendRecipients)
      .where(eq(schema.emailSendRecipients.id, row.id));
    expect(failed[0]?.status).toBe("failed");
    expect(failed[0]?.error).toBe("E_RECIPIENT_SUPPRESSED: bounce");
  });

  it("临时错误：第一次 retryable 保持 queued，第二次 failed", async () => {
    const { orgId, membershipId } = await seedOrg();
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "bulk",
        subject: "S",
        body: "B",
        objectType: "bulk",
        objectId: "obj",
        dedupKey: unique("dk"),
        audience: audienceOf(`${unique("a")}@test.local`),
        suppressedEmails: new Set<string>(),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );
    const rows = await recipientRows(prepared.sendId);
    const row = rows[0];
    if (!row) {
      throw new Error("missing recipient row");
    }
    const sender = new FixedErrorSender("E_RATE_LIMIT_EXCEEDED: slow down");

    const first = await processEmailRecipient(db, sender, {
      sendId: prepared.sendId,
      recipientId: row.id,
      attempts: 1,
      now: NOW,
    });
    expect(first.outcome).toBe("retryable");
    const afterFirst = await db
      .select({
        status: schema.emailSendRecipients.status,
        attemptCount: schema.emailSendRecipients.attemptCount,
      })
      .from(schema.emailSendRecipients)
      .where(eq(schema.emailSendRecipients.id, row.id));
    expect(afterFirst[0]?.status).toBe("queued");
    expect(afterFirst[0]?.attemptCount).toBe(1);

    const second = await processEmailRecipient(db, sender, {
      sendId: prepared.sendId,
      recipientId: row.id,
      attempts: 2,
      now: NOW + 1,
    });
    expect(second.outcome).toBe("failed");

    const sends = await db
      .select({ status: schema.emailSends.status, failedCount: schema.emailSends.failedCount })
      .from(schema.emailSends)
      .where(eq(schema.emailSends.id, prepared.sendId));
    expect(sends[0]?.status).toBe("failed");
    expect(sends[0]?.failedCount).toBe(1);
  });

  it("部分失败 → partial：最后一条收件人消息触发汇总", async () => {
    const { orgId, membershipId } = await seedOrg();
    const a = `${unique("a")}@test.local`;
    const b = `${unique("b")}@test.local`;
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "bulk",
        subject: "S",
        body: "B",
        objectType: "bulk",
        objectId: "obj",
        dedupKey: unique("dk"),
        audience: audienceOf(a, b),
        suppressedEmails: new Set<string>(),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );
    const rows = await recipientRows(prepared.sendId);
    const rowA = findRecipientRow(rows, a);
    const rowB = findRecipientRow(rows, b);

    // 先处理失败的一封（attempts=2，rate limit 仍失败 → failed）
    const failResult = await processEmailRecipient(
      db,
      new FixedErrorSender("E_RATE_LIMIT_EXCEEDED: nope"),
      { sendId: prepared.sendId, recipientId: rowA.id, attempts: 2, now: NOW },
    );
    expect(failResult.outcome).toBe("failed");

    // 此时还有 b 未处理，任务不收敛
    const pending = await db
      .select({ status: schema.emailSends.status })
      .from(schema.emailSends)
      .where(eq(schema.emailSends.id, prepared.sendId));
    expect(pending[0]?.status).toBe("queued");

    const okResult = await processEmailRecipient(db, new MockEmailSender(), {
      sendId: prepared.sendId,
      recipientId: rowB.id,
      attempts: 1,
      now: NOW,
    });
    expect(okResult.outcome).toBe("sent");

    const sends = await db
      .select()
      .from(schema.emailSends)
      .where(eq(schema.emailSends.id, prepared.sendId));
    expect(sends[0]?.status).toBe("partial");
    expect(sends[0]?.sentCount).toBe(1);
    expect(sends[0]?.failedCount).toBe(1);
  });
});

describe("resolveAudienceContactsForSelection（三来源并集 + 邮箱去重）", () => {
  it("group 来源：只含该组 active 学生；多学生共享邮箱去重", async () => {
    const { orgId } = await seedOrg();
    const groupId = generateId(ID_PREFIXES.group);
    await db.insert(schema.groups).values({
      id: groupId,
      organizationId: orgId,
      name: unique("G"),
      status: "active",
      createdAt: NOW,
    });
    const sharedEmail = `${unique("a")}@test.local`;
    const first = await seedStudent(orgId, groupId, [sharedEmail]);
    // 另一个学生共享同一邮箱（共享 contact，业务上归并）
    await seedStudent(orgId, groupId, [sharedEmail], first.contactId);
    // 未分组学生不属于该 group
    await seedStudent(orgId, null, [`${unique("x")}@test.local`]);

    const contacts = await resolveAudienceContactsForSelection(db, orgId, { groupIds: [groupId] });
    expect(contacts).toHaveLength(1);
    expect(contacts[0]?.email).toBe(sharedEmail);
  });

  it("student 来源 + group 来源取并集去重", async () => {
    const { orgId } = await seedOrg();
    const groupId = generateId(ID_PREFIXES.group);
    await db.insert(schema.groups).values({
      id: groupId,
      organizationId: orgId,
      name: unique("G"),
      status: "active",
      createdAt: NOW,
    });
    const gEmail = `${unique("g")}@test.local`;
    const sEmail = `${unique("s")}@test.local`;
    const inGroup = await seedStudent(orgId, groupId, [gEmail]);
    const solo = await seedStudent(orgId, null, [sEmail]);

    const contacts = await resolveAudienceContactsForSelection(db, orgId, {
      groupIds: [groupId],
      studentIds: [solo.studentId, inGroup.studentId],
    });
    expect(new Set(contacts.map((c) => c.email))).toEqual(new Set([sEmail, gEmail]));
  });

  it("event 来源：复用事件受众规则（eventGroups）", async () => {
    const { orgId, membershipId } = await seedOrg();
    const groupId = generateId(ID_PREFIXES.group);
    await db.insert(schema.groups).values({
      id: groupId,
      organizationId: orgId,
      name: unique("G"),
      status: "active",
      createdAt: NOW,
    });
    const inAudience = `${unique("ev")}@test.local`;
    const outside = `${unique("no")}@test.local`;
    await seedStudent(orgId, groupId, [inAudience]);
    await seedStudent(orgId, null, [outside]);

    const eventId = generateId(ID_PREFIXES.event);
    await db.insert(schema.events).values({
      id: eventId,
      organizationId: orgId,
      title: unique("Evt"),
      startsAtUtc: NOW,
      isOrgWide: false,
      status: "published",
      createdByMembershipId: membershipId,
      createdAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(schema.eventGroups).values({
      organizationId: orgId,
      eventId,
      groupId,
    });

    const contacts = await resolveAudienceContactsForSelection(db, orgId, { eventId });
    expect(contacts.map((c) => c.email)).toEqual([inAudience]);
  });
});

describe("submittedFormEmailsForEvent（RSVP 排除）", () => {
  it("返回已提交该 event 表单的 active 家长邮箱", async () => {
    const { orgId, membershipId } = await seedOrg();
    const parentMembershipId = generateId(ID_PREFIXES.membership);
    const parentEmail = `${unique("parent")}@test.local`;
    await db.insert(schema.memberships).values({
      id: parentMembershipId,
      organizationId: orgId,
      role: "parent",
      status: "active",
      invitedEmail: parentEmail,
      createdAt: NOW,
    });

    const eventId = generateId(ID_PREFIXES.event);
    await db.insert(schema.events).values({
      id: eventId,
      organizationId: orgId,
      title: unique("Evt"),
      startsAtUtc: NOW,
      isOrgWide: true,
      status: "published",
      createdByMembershipId: membershipId,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const formId = generateId(ID_PREFIXES.eventForm);
    await db.insert(schema.eventForms).values({
      id: formId,
      organizationId: orgId,
      eventId,
      kind: "rsvp",
      status: "open",
      createdByMembershipId: membershipId,
      createdAt: NOW,
    });
    await db.insert(schema.formSubmissions).values({
      id: generateId(ID_PREFIXES.formSubmission),
      organizationId: orgId,
      formId,
      membershipId: parentMembershipId,
      payloadJson: "{}",
      submittedAt: NOW,
      updatedAt: NOW,
    });

    const emails = await submittedFormEmailsForEvent(db, orgId, eventId);
    expect(emails).toEqual(new Set([parentEmail]));
  });

  it("只统计 active 成员；其他 event 的提交不影响", async () => {
    const { orgId, membershipId } = await seedOrg();
    const suspendedMembershipId = generateId(ID_PREFIXES.membership);
    await db.insert(schema.memberships).values({
      id: suspendedMembershipId,
      organizationId: orgId,
      role: "parent",
      status: "suspended",
      invitedEmail: `${unique("gone")}@test.local`,
      createdAt: NOW,
    });

    const eventId = generateId(ID_PREFIXES.event);
    await db.insert(schema.events).values({
      id: eventId,
      organizationId: orgId,
      title: unique("Evt"),
      startsAtUtc: NOW,
      isOrgWide: true,
      status: "published",
      createdByMembershipId: membershipId,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const formId = generateId(ID_PREFIXES.eventForm);
    await db.insert(schema.eventForms).values({
      id: formId,
      organizationId: orgId,
      eventId,
      kind: "rsvp",
      status: "open",
      createdByMembershipId: membershipId,
      createdAt: NOW,
    });
    // 两个提交：active 的 owner + suspended 的家长；只有 active 的会返回
    await db.insert(schema.formSubmissions).values({
      id: generateId(ID_PREFIXES.formSubmission),
      organizationId: orgId,
      formId,
      membershipId,
      payloadJson: "{}",
      submittedAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(schema.formSubmissions).values({
      id: generateId(ID_PREFIXES.formSubmission),
      organizationId: orgId,
      formId,
      membershipId: suspendedMembershipId,
      payloadJson: "{}",
      submittedAt: NOW,
      updatedAt: NOW,
    });

    const emails = await submittedFormEmailsForEvent(db, orgId, eventId);
    expect(emails.size).toBe(1);
  });
});

describe("listEmailSendsCore / listMySentEmailsCore（staff 全部，家长只看发给自己的）", () => {
  async function seedSend(
    orgId: string,
    membershipId: string,
    audienceEmails: string[],
    dedupKey?: string,
  ) {
    return prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "bulk",
        subject: unique("S"),
        body: "body",
        objectType: "bulk",
        objectId: "obj",
        dedupKey: dedupKey ?? unique("dk"),
        audience: audienceOf(...audienceEmails),
        suppressedEmails: new Set<string>(),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );
  }

  it("staff 视角看到全部发送任务；家长只看发给自己的且排除 suppressed", async () => {
    const { orgId, membershipId } = await seedOrg();
    const parentEmail = `${unique("parent")}@test.local`;
    const otherEmail = `${unique("other")}@test.local`;
    // 发给家长的一封（含另一个收件人）
    const toParent = await seedSend(orgId, membershipId, [parentEmail, otherEmail]);
    // 只有别人的一封（家长不可见）
    await seedSend(orgId, membershipId, [otherEmail]);
    // 家长被退订的一封（recipient 状态 suppressed，家长不可见）
    await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "bulk",
        subject: unique("S"),
        body: "body",
        objectType: "bulk",
        objectId: "obj",
        dedupKey: unique("dk"),
        audience: audienceOf(parentEmail),
        suppressedEmails: new Set([parentEmail]),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );

    const all = await listEmailSendsCore(db, orgId);
    expect(all).toHaveLength(3);

    const mine = await listMySentEmailsCore(db, orgId, parentEmail);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.id).toBe(toParent.sendId);
  });

  it("只看到本组织的邮件：同一邮箱在其他组织的发送不可见", async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const email = `${unique("a")}@test.local`;
    const inA = await seedSend(orgA.orgId, orgA.membershipId, [email]);
    // orgB 也发过该邮箱 → 不影响 orgA 的家长视角
    await seedSend(orgB.orgId, orgB.membershipId, [email]);

    const mine = await listMySentEmailsCore(db, orgA.orgId, email);
    expect(mine).toHaveLength(1);
    expect(mine[0]?.id).toBe(inA.sendId);
  });
});
