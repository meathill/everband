import {
  canParentAccessEvent,
  FormError,
  getFormById,
  recordAudit,
  upsertSubmission,
} from "@everband/core";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  createEventFormSchema,
  eventIdSchema,
  formIdSchema,
  submitFormSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { and, eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { AuthError, requireMembership, STAFF_ROLES } from "./guards.ts";

export const createEventForm = createServerFn({ method: "POST" })
  .validator(createEventFormSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const formId = generateId(ID_PREFIXES.eventForm);
    try {
      await db.insert(schema.eventForms).values({
        id: formId,
        organizationId: data.orgId,
        eventId: data.eventId,
        kind: data.kind,
        configJson: data.options ? JSON.stringify({ options: data.options }) : null,
        status: "open",
        createdByMembershipId: ctx.membershipId,
        createdAt: Date.now(),
      });
    } catch {
      // eventId UNIQUE：每活动最多一个主表单
      return { ok: false as const, error: "This event already has a form." };
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "form.opened",
      objectType: "event_form",
      objectId: formId,
      summary: { eventId: data.eventId, kind: data.kind },
    });
    return { ok: true as const, formId };
  });

export const closeEventForm = createServerFn({ method: "POST" })
  .validator(formIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    const rows = await db
      .update(schema.eventForms)
      .set({ status: "closed", closedAt: now, closedByMembershipId: ctx.membershipId })
      .where(
        and(
          eq(schema.eventForms.id, data.formId),
          eq(schema.eventForms.organizationId, data.orgId),
          eq(schema.eventForms.status, "open"),
        ),
      )
      .returning({ id: schema.eventForms.id });
    if (rows.length === 0) {
      return { ok: false as const, error: "Form not found or already closed." };
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "form.closed",
      objectType: "event_form",
      objectId: data.formId,
    });
    return { ok: true as const };
  });

// 活动的表单 + 当前用户自己的提交（parent 用）；staff 另有 results
export const getEventForm = createServerFn({ method: "GET" })
  .validator(eventIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const forms = await db
      .select()
      .from(schema.eventForms)
      .where(
        and(
          eq(schema.eventForms.eventId, data.eventId),
          eq(schema.eventForms.organizationId, data.orgId),
        ),
      )
      .limit(1);
    const form = forms[0];
    if (!form) {
      return { form: null, mySubmission: null };
    }
    const submissions = await db
      .select()
      .from(schema.formSubmissions)
      .where(
        and(
          eq(schema.formSubmissions.formId, form.id),
          eq(schema.formSubmissions.membershipId, ctx.membershipId),
        ),
      )
      .limit(1);
    const mine = submissions[0];
    return {
      form: {
        id: form.id,
        kind: form.kind,
        status: form.status,
        options: form.configJson
          ? ((JSON.parse(form.configJson) as { options?: string[] }).options ?? null)
          : null,
      },
      mySubmission: mine
        ? { payload: JSON.parse(mine.payloadJson), updatedAt: mine.updatedAt }
        : null,
    };
  });

export const submitEventForm = createServerFn({ method: "POST" })
  .validator(submitFormSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId);
    const form = await getFormById(db, data.orgId, data.formId);
    if (!form) {
      return { ok: false as const, error: "Form not found." };
    }
    // 只有活动受众中的 parent 可以提交（staff 也可提交便于测试自己的表单）
    const isStaff = ctx.role === "owner" || ctx.role === "staff";
    if (!isStaff) {
      const allowed = await canParentAccessEvent(db, data.orgId, ctx.user.id, form.eventId);
      if (!allowed) {
        throw new AuthError("forbidden");
      }
    }
    try {
      await upsertSubmission(db, data.orgId, form, ctx.membershipId, data.payload, Date.now());
    } catch (cause) {
      if (cause instanceof FormError) {
        return { ok: false as const, error: cause.message };
      }
      throw cause;
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "form.submitted",
      objectType: "event_form",
      objectId: data.formId,
    });
    return { ok: true as const };
  });

// staff：提交结果列表（联系人邮箱通过 membership 邮箱展示）
export const listFormResults = createServerFn({ method: "GET" })
  .validator(formIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return db
      .select({
        id: schema.formSubmissions.id,
        payloadJson: schema.formSubmissions.payloadJson,
        submittedAt: schema.formSubmissions.submittedAt,
        updatedAt: schema.formSubmissions.updatedAt,
        email: schema.memberships.invitedEmail,
      })
      .from(schema.formSubmissions)
      .innerJoin(schema.memberships, eq(schema.memberships.id, schema.formSubmissions.membershipId))
      .where(
        and(
          eq(schema.formSubmissions.formId, data.formId),
          eq(schema.formSubmissions.organizationId, data.orgId),
        ),
      )
      .orderBy(schema.formSubmissions.updatedAt);
  });
