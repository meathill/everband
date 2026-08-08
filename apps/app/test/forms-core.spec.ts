import { env } from "cloudflare:test";
import { FormError, getFormById, upsertSubmission } from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_400_000_000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${NOW}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

async function seedForm(
  kind: "rsvp" | "choice" = "rsvp",
  options?: string[],
): Promise<{ orgId: string; formId: string; membershipId: string }> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const eventId = generateId(ID_PREFIXES.event);
  const formId = generateId(ID_PREFIXES.eventForm);
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
    role: "parent",
    status: "active",
    invitedEmail: `${unique("p")}@test.local`,
    createdAt: NOW,
  });
  await db.insert(schema.events).values({
    id: eventId,
    organizationId: orgId,
    title: unique("Event"),
    startsAtUtc: NOW + 86400000,
    isOrgWide: true,
    status: "published",
    createdByMembershipId: membershipId,
    createdAt: NOW,
    updatedAt: NOW,
  });
  await db.insert(schema.eventForms).values({
    id: formId,
    organizationId: orgId,
    eventId,
    kind,
    configJson: options ? JSON.stringify({ options }) : null,
    status: "open",
    createdByMembershipId: membershipId,
    createdAt: NOW,
  });
  return { orgId, formId, membershipId };
}

describe("表单提交（PRD §5.3/§11.4）", () => {
  it("同一 parent 重复提交只保留一份（更新而非新增）", async () => {
    const { orgId, formId, membershipId } = await seedForm();
    const form = await getFormById(db, orgId, formId);
    expect(form).not.toBeNull();
    if (!form) {
      return;
    }

    await upsertSubmission(db, orgId, form, membershipId, { kind: "rsvp", response: "yes" }, NOW);
    await upsertSubmission(
      db,
      orgId,
      form,
      membershipId,
      { kind: "rsvp", response: "no", note: "Changed plans" },
      NOW + 1000,
    );

    const rows = await db
      .select()
      .from(schema.formSubmissions)
      .where(
        and(
          eq(schema.formSubmissions.formId, formId),
          eq(schema.formSubmissions.membershipId, membershipId),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(JSON.parse(rows[0]?.payloadJson ?? "{}").response).toBe("no");
    expect(rows[0]?.submittedAt).toBe(NOW);
    expect(rows[0]?.updatedAt).toBe(NOW + 1000);
  });

  it("表单关闭后拒绝提交与修改", async () => {
    const { orgId, formId, membershipId } = await seedForm();
    await db
      .update(schema.eventForms)
      .set({ status: "closed", closedAt: NOW })
      .where(eq(schema.eventForms.id, formId));
    const form = await getFormById(db, orgId, formId);
    if (!form) {
      return;
    }
    await expect(
      upsertSubmission(db, orgId, form, membershipId, { kind: "rsvp", response: "yes" }, NOW),
    ).rejects.toThrow(FormError);
  });

  it("choice 提交必须命中配置选项；kind 不匹配拒绝", async () => {
    const { orgId, formId, membershipId } = await seedForm("choice", ["Small", "Large"]);
    const form = await getFormById(db, orgId, formId);
    if (!form) {
      return;
    }
    await expect(
      upsertSubmission(db, orgId, form, membershipId, { kind: "choice", choice: "Medium" }, NOW),
    ).rejects.toThrow(FormError);
    await expect(
      upsertSubmission(db, orgId, form, membershipId, { kind: "rsvp", response: "yes" }, NOW),
    ).rejects.toThrow(FormError);
    await upsertSubmission(db, orgId, form, membershipId, { kind: "choice", choice: "Large" }, NOW);
    const rows = await db
      .select()
      .from(schema.formSubmissions)
      .where(eq(schema.formSubmissions.formId, formId));
    expect(rows).toHaveLength(1);
  });
});
