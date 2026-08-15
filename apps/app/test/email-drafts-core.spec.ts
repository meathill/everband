import { env } from "cloudflare:test";
import {
  deleteEmailDraftCore,
  deleteMemberDraftsCore,
  listEmailDraftsCore,
  saveEmailDraftCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_500_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}`;
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

const CONTENT = {
  subject: "Rehearsal reminder",
  cc: "cc@test.local",
  html: "<p>Please RSVP.</p>",
  text: "Please RSVP.",
  recipients: [
    { contactId: "ct_x", email: "parent@test.local", name: "Parent" },
    { contactId: "ct_y", email: "other@test.local", name: "Other" },
  ],
  selection: { groups: ["grp_a"], excludeForm: true },
};

describe("email drafts（自动保存草稿）", () => {
  it("保存后可完整恢复（含收件人快照与受众选择）", async () => {
    const { orgId, membershipId } = await seedOrg();
    const { draftId } = await saveEmailDraftCore(db, orgId, membershipId, CONTENT, NOW);

    const drafts = await listEmailDraftsCore(db, orgId, membershipId);
    expect(drafts).toHaveLength(1);
    const draft = drafts[0];
    expect(draft?.id).toBe(draftId);
    expect(draft?.subject).toBe(CONTENT.subject);
    expect(draft?.cc).toBe(CONTENT.cc);
    expect(draft?.html).toBe(CONTENT.html);
    expect(draft?.text).toBe(CONTENT.text);
    expect(draft?.recipients).toEqual(CONTENT.recipients);
    expect(draft?.selection).toEqual(CONTENT.selection);
  });

  it("同成员再次保存是覆盖（同一 id，updatedAt 更新）", async () => {
    const { orgId, membershipId } = await seedOrg();
    const first = await saveEmailDraftCore(db, orgId, membershipId, CONTENT, NOW);
    const second = await saveEmailDraftCore(
      db,
      orgId,
      membershipId,
      { ...CONTENT, subject: "Changed" },
      NOW + 100,
    );
    expect(second.draftId).toBe(first.draftId);

    const drafts = await listEmailDraftsCore(db, orgId, membershipId);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.subject).toBe("Changed");
    expect(drafts[0]?.updatedAt).toBe(NOW + 100);
  });

  it("不同成员与不同组织互不干扰", async () => {
    const orgA = await seedOrg();
    const orgB = await seedOrg();
    const otherMembershipId = generateId(ID_PREFIXES.membership);
    await db.insert(schema.memberships).values({
      id: otherMembershipId,
      organizationId: orgA.orgId,
      role: "staff",
      status: "active",
      invitedEmail: `${unique("s")}@test.local`,
      createdAt: NOW,
    });

    await saveEmailDraftCore(db, orgA.orgId, orgA.membershipId, CONTENT, NOW);
    await saveEmailDraftCore(
      db,
      orgA.orgId,
      otherMembershipId,
      { ...CONTENT, subject: "Mine" },
      NOW,
    );
    await saveEmailDraftCore(db, orgB.orgId, orgB.membershipId, CONTENT, NOW);

    expect((await listEmailDraftsCore(db, orgA.orgId, orgA.membershipId))[0]?.subject).toBe(
      CONTENT.subject,
    );
    expect((await listEmailDraftsCore(db, orgA.orgId, otherMembershipId))[0]?.subject).toBe("Mine");
    expect(await listEmailDraftsCore(db, orgB.orgId, orgB.membershipId)).toHaveLength(1);
  });

  it("删除只能删自己的草稿；删除后列表为空", async () => {
    const { orgId, membershipId } = await seedOrg();
    const otherMembershipId = generateId(ID_PREFIXES.membership);
    await db.insert(schema.memberships).values({
      id: otherMembershipId,
      organizationId: orgId,
      role: "staff",
      status: "active",
      invitedEmail: `${unique("s")}@test.local`,
      createdAt: NOW,
    });
    const { draftId } = await saveEmailDraftCore(db, orgId, membershipId, CONTENT, NOW);
    await saveEmailDraftCore(db, orgId, otherMembershipId, CONTENT, NOW);

    // 他人删除我的草稿 → 不允许
    const otherDelete = await deleteEmailDraftCore(db, orgId, otherMembershipId, draftId);
    expect(otherDelete.ok).toBe(false);
    expect(await listEmailDraftsCore(db, orgId, membershipId)).toHaveLength(1);

    const mine = await deleteEmailDraftCore(db, orgId, membershipId, draftId);
    expect(mine.ok).toBe(true);
    expect(await listEmailDraftsCore(db, orgId, membershipId)).toHaveLength(0);
  });

  it("发送成功后按成员清空草稿：无 draftId 也能清理（debounce 窗口内发送）", async () => {
    const { orgId, membershipId } = await seedOrg();
    const otherMembershipId = generateId(ID_PREFIXES.membership);
    await db.insert(schema.memberships).values({
      id: otherMembershipId,
      organizationId: orgId,
      role: "staff",
      status: "active",
      invitedEmail: `${unique("s")}@test.local`,
      createdAt: NOW,
    });
    await saveEmailDraftCore(db, orgId, membershipId, CONTENT, NOW);

    await deleteMemberDraftsCore(db, orgId, membershipId);

    expect(await listEmailDraftsCore(db, orgId, membershipId)).toHaveLength(0);
    // 其他人的草稿不受影响
    await saveEmailDraftCore(db, orgId, otherMembershipId, CONTENT, NOW);
    expect(await listEmailDraftsCore(db, orgId, otherMembershipId)).toHaveLength(1);
  });

  it("损坏的 recipients_json 容错为空列表，不阻塞页面", async () => {
    const { orgId, membershipId } = await seedOrg();
    const { draftId } = await saveEmailDraftCore(db, orgId, membershipId, CONTENT, NOW);
    await db
      .update(schema.emailDrafts)
      .set({ recipientsJson: "{not-json" })
      .where(eq(schema.emailDrafts.id, draftId));

    const drafts = await listEmailDraftsCore(db, orgId, membershipId);
    expect(drafts[0]?.recipients).toEqual([]);
    expect(drafts[0]?.subject).toBe(CONTENT.subject);
  });
});
