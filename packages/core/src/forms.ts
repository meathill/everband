// 表单提交核心（PRD §5.3）：一人一份有效提交（幂等更新）、关闭后只读。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { type FormPayload, validatePayloadAgainstConfig } from "@everband/validation";
import { and, eq } from "drizzle-orm";

export class FormError extends Error {}

export interface FormRecord {
  id: string;
  eventId: string;
  kind: "rsvp" | "volunteer" | "choice" | "text";
  options: string[] | null;
  status: "open" | "closed";
}

export async function getFormById(
  db: Database,
  orgId: string,
  formId: string,
): Promise<FormRecord | null> {
  const rows = await db
    .select()
    .from(schema.eventForms)
    .where(and(eq(schema.eventForms.id, formId), eq(schema.eventForms.organizationId, orgId)))
    .limit(1);
  const form = rows[0];
  if (!form) {
    return null;
  }
  let options: string[] | null = null;
  if (form.configJson) {
    try {
      const parsed = JSON.parse(form.configJson) as { options?: string[] };
      options = parsed.options ?? null;
    } catch {
      options = null;
    }
  }
  return { id: form.id, eventId: form.eventId, kind: form.kind, options, status: form.status };
}

// 提交/修改：UNIQUE(formId,membershipId) + onConflictDoUpdate 落实
// "截止前可修改、同一 parent 只有一份"（PRD §5.3）
export async function upsertSubmission(
  db: Database,
  orgId: string,
  form: FormRecord,
  membershipId: string,
  payload: FormPayload,
  now: number,
): Promise<void> {
  if (form.status !== "open") {
    throw new FormError("This form is closed.");
  }
  const check = validatePayloadAgainstConfig(payload, form.kind, form.options);
  if (!check.valid) {
    throw new FormError(check.reason ?? "Invalid submission");
  }
  await db
    .insert(schema.formSubmissions)
    .values({
      id: generateId(ID_PREFIXES.formSubmission),
      organizationId: orgId,
      formId: form.id,
      membershipId,
      payloadJson: JSON.stringify(payload),
      submittedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [schema.formSubmissions.formId, schema.formSubmissions.membershipId],
      set: {
        payloadJson: JSON.stringify(payload),
        updatedAt: now,
      },
    });
}
