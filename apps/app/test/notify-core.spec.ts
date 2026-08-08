import { env } from "cloudflare:test";
import { prepareEmailSend, processEmailSend } from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
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

describe("prepareEmailSend（快照 + 幂等 + 退订）", () => {
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

  it("退订地址进入快照但标记 suppressed", async () => {
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
  });
});

describe("processEmailSend（消费幂等 + partial 汇总）", () => {
  it("发送成功后重投不重发；suppressed 不发送", async () => {
    const { orgId, membershipId } = await seedOrg();
    const optedOut = `${unique("s")}@test.local`;
    const normal = `${unique("m")}@test.local`;
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "event-update",
        subject: "S",
        body: "B",
        objectType: "event_update",
        objectId: "upd_z",
        dedupKey: unique("dk"),
        audience: audienceOf(optedOut, normal),
        suppressedEmails: new Set([optedOut]),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );

    const sender = new MockEmailSender();
    await processEmailSend(db, sender, prepared.sendId, NOW);
    expect(sender.sent).toHaveLength(1);
    expect(sender.sent[0]?.to).toBe(normal);

    // 模拟重投：状态回 processing 再消费一次 → 不再发送
    await db
      .update(schema.emailSends)
      .set({ status: "processing" })
      .where(eq(schema.emailSends.id, prepared.sendId));
    await processEmailSend(db, sender, prepared.sendId, NOW + 1);
    expect(sender.sent).toHaveLength(1);

    const sends = await db
      .select()
      .from(schema.emailSends)
      .where(eq(schema.emailSends.id, prepared.sendId));
    expect(sends[0]?.status).toBe("succeeded");
    expect(sends[0]?.sentCount).toBe(1);
  });

  it("部分失败 → partial，失败原因保留", async () => {
    const { orgId, membershipId } = await seedOrg();
    const a = `${unique("a")}@test.local`;
    const b = `${unique("b")}@test.local`;
    const prepared = await prepareEmailSend(
      db,
      {
        organizationId: orgId,
        kind: "event-update",
        subject: "S",
        body: "B",
        objectType: "event_update",
        objectId: "upd_p",
        dedupKey: unique("dk"),
        audience: audienceOf(a, b),
        suppressedEmails: new Set<string>(),
        requestedByMembershipId: membershipId,
      },
      NOW,
    );

    const sender = new MockEmailSender();
    sender.failNext = true; // 第一封失败，第二封成功
    await processEmailSend(db, sender, prepared.sendId, NOW);

    const sends = await db
      .select()
      .from(schema.emailSends)
      .where(eq(schema.emailSends.id, prepared.sendId));
    expect(sends[0]?.status).toBe("partial");
    expect(sends[0]?.sentCount).toBe(1);
    expect(sends[0]?.failedCount).toBe(1);

    const failedRows = await db
      .select()
      .from(schema.emailSendRecipients)
      .where(eq(schema.emailSendRecipients.sendId, prepared.sendId));
    expect(failedRows.find((r) => r.status === "failed")?.error).toBe("mock failure");
  });
});
