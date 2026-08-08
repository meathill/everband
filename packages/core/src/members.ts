// 成员域核心：只依赖 db 的可测函数。
// 邮箱归并规则（PRD §5.1）：组织内按规范化邮箱唯一，邮箱优先于姓名；
// 已存在联系人则复用（含其 household），不重复建档。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import {
  canTransitionStudent,
  generateId,
  ID_PREFIXES,
  type StudentStatus,
  validateStudentGroup,
} from "@everband/domain";
import type { ContactInput } from "@everband/validation";
import { and, eq, isNull } from "drizzle-orm";

export class MemberError extends Error {}

export interface UpsertContactResult {
  contactId: string;
  householdId: string;
  created: boolean;
}

// 按邮箱归并联系人：命中即复用（姓名/电话不覆盖，以先录入者为准），
// 未命中则新建 household + contact
export async function upsertContact(
  db: Database,
  orgId: string,
  input: ContactInput,
  now: number,
): Promise<UpsertContactResult> {
  const existing = await db
    .select({ id: schema.contacts.id, householdId: schema.contacts.householdId })
    .from(schema.contacts)
    .where(and(eq(schema.contacts.organizationId, orgId), eq(schema.contacts.email, input.email)))
    .limit(1);
  const found = existing[0];
  if (found) {
    return { contactId: found.id, householdId: found.householdId, created: false };
  }
  const householdId = generateId(ID_PREFIXES.household);
  const contactId = generateId(ID_PREFIXES.contact);
  await db.batch([
    db.insert(schema.households).values({
      id: householdId,
      organizationId: orgId,
      name: `${input.name} household`,
      createdAt: now,
    }),
    db.insert(schema.contacts).values({
      id: contactId,
      organizationId: orgId,
      householdId,
      name: input.name,
      email: input.email,
      phone: input.phone ?? null,
      createdAt: now,
    }),
  ]);
  return { contactId, householdId, created: true };
}

async function assertGroupInOrg(db: Database, orgId: string, groupId: string): Promise<void> {
  const rows = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(and(eq(schema.groups.id, groupId), eq(schema.groups.organizationId, orgId)))
    .limit(1);
  if (!rows[0]) {
    throw new MemberError("Group not found in this organization");
  }
}

export interface CreateStudentCoreInput {
  name: string;
  status: StudentStatus;
  groupId?: string;
  contact: ContactInput;
}

export async function createStudentCore(
  db: Database,
  orgId: string,
  input: CreateStudentCoreInput,
  actorMembershipId: string,
  now: number,
): Promise<{ studentId: string; contactId: string; householdId: string }> {
  const groupCheck = validateStudentGroup(input.status, input.groupId ?? null);
  if (!groupCheck.valid) {
    throw new MemberError(groupCheck.reason ?? "Invalid group");
  }
  if (input.groupId) {
    await assertGroupInOrg(db, orgId, input.groupId);
  }
  const { contactId, householdId } = await upsertContact(db, orgId, input.contact, now);
  const studentId = generateId(ID_PREFIXES.student);
  await db.batch([
    db.insert(schema.students).values({
      id: studentId,
      organizationId: orgId,
      householdId,
      name: input.name,
      status: input.status,
      groupId: input.groupId ?? null,
      statusChangedAt: now,
      statusChangedByMembershipId: actorMembershipId,
      createdAt: now,
    }),
    db.insert(schema.studentContacts).values({
      organizationId: orgId,
      studentId,
      contactId,
      relationship: input.contact.relationship,
    }),
  ]);
  return { studentId, contactId, householdId };
}

// 给已有学生追加联系人（邮箱归并 + 关系去重）
export async function addContactToStudent(
  db: Database,
  orgId: string,
  studentId: string,
  input: ContactInput,
  now: number,
): Promise<UpsertContactResult> {
  const studentRows = await db
    .select({ id: schema.students.id })
    .from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.organizationId, orgId)))
    .limit(1);
  if (!studentRows[0]) {
    throw new MemberError("Student not found");
  }
  const result = await upsertContact(db, orgId, input, now);
  await db
    .insert(schema.studentContacts)
    .values({
      organizationId: orgId,
      studentId,
      contactId: result.contactId,
      relationship: input.relationship,
    })
    .onConflictDoNothing();
  return result;
}

// 状态变更：校验状态机 + active/group 约束，记录操作者与时间（PRD §5.1）
export async function updateStudentStatusCore(
  db: Database,
  orgId: string,
  studentId: string,
  status: StudentStatus,
  groupId: string | undefined,
  actorMembershipId: string,
  now: number,
): Promise<void> {
  const rows = await db
    .select({ status: schema.students.status, groupId: schema.students.groupId })
    .from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) {
    throw new MemberError("Student not found");
  }
  if (!canTransitionStudent(current.status, status)) {
    throw new MemberError(`Cannot change status from ${current.status} to ${status}`);
  }
  const nextGroupId = groupId !== undefined ? groupId : (current.groupId ?? undefined);
  const groupCheck = validateStudentGroup(status, nextGroupId ?? null);
  if (!groupCheck.valid) {
    throw new MemberError(groupCheck.reason ?? "Invalid group");
  }
  if (nextGroupId && nextGroupId !== current.groupId) {
    await assertGroupInOrg(db, orgId, nextGroupId);
  }
  await db
    .update(schema.students)
    .set({
      status,
      groupId: nextGroupId ?? null,
      statusChangedAt: now,
      statusChangedByMembershipId: actorMembershipId,
    })
    .where(and(eq(schema.students.id, studentId), eq(schema.students.organizationId, orgId)));
}

// parent 登录后：把该邮箱名下尚未关联的联系人挂到 user（跨组织按邮箱匹配）
export async function linkContactsToUser(
  db: Database,
  email: string,
  userId: string,
): Promise<void> {
  await db
    .update(schema.contacts)
    .set({ userId })
    .where(and(eq(schema.contacts.email, email), isNull(schema.contacts.userId)));
}
