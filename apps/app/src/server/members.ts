import {
  addContactToStudent,
  createStudentCore,
  listStudentsCore,
  MemberError,
  recordAudit,
  updateGroupCore,
  updateStudentCore,
  updateStudentStatusCore,
} from "@everband/core";
import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  addStudentContactSchema,
  createGroupSchema,
  createStudentSchema,
  createTermSchema,
  inviteParentSchema,
  listGroupsSchema,
  orgIdSchema,
  studentsPageSchema,
  updateGroupSchema,
  updateStudentSchema,
  updateStudentStatusSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";
import { createInvite } from "./invites.ts";

function toError(cause: unknown): { ok: false; error: string } {
  if (cause instanceof MemberError) {
    return { ok: false, error: cause.message };
  }
  throw cause;
}

export const listStudents = createServerFn({ method: "GET" })
  .validator(studentsPageSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return listStudentsCore(db, data.orgId, data);
  });

export const createStudent = createServerFn({ method: "POST" })
  .validator(createStudentSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const now = Date.now();
    try {
      const result = await createStudentCore(
        db,
        data.orgId,
        { name: data.name, status: data.status, groupId: data.groupId, contact: data.contact },
        ctx.membershipId,
        now,
      );
      await recordAudit(db, {
        organizationId: data.orgId,
        actorMembershipId: ctx.membershipId,
        action: "student.created",
        objectType: "student",
        objectId: result.studentId,
        summary: { name: data.name, status: data.status, groupId: data.groupId ?? null },
      });
      return { ok: true as const, ...result };
    } catch (cause) {
      return toError(cause);
    }
  });

export const updateStudentStatus = createServerFn({ method: "POST" })
  .validator(updateStudentStatusSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    try {
      await updateStudentStatusCore(
        db,
        data.orgId,
        data.studentId,
        data.status,
        data.groupId,
        ctx.membershipId,
        Date.now(),
      );
      await recordAudit(db, {
        organizationId: data.orgId,
        actorMembershipId: ctx.membershipId,
        action: "student.status_changed",
        objectType: "student",
        objectId: data.studentId,
        summary: { status: data.status, groupId: data.groupId ?? null },
      });
      return { ok: true as const };
    } catch (cause) {
      return toError(cause);
    }
  });

export const updateStudent = createServerFn({ method: "POST" })
  .validator(updateStudentSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return updateStudentCore(
      db,
      data.orgId,
      data.studentId,
      { name: data.name, groupId: data.groupId },
      ctx.membershipId,
    );
  });

export const addStudentContact = createServerFn({ method: "POST" })
  .validator(addStudentContactSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    try {
      const result = await addContactToStudent(
        db,
        data.orgId,
        data.studentId,
        data.contact,
        Date.now(),
      );
      await recordAudit(db, {
        organizationId: data.orgId,
        actorMembershipId: ctx.membershipId,
        action: "student.contact_added",
        objectType: "student",
        objectId: data.studentId,
        summary: { contactId: result.contactId, relationship: data.contact.relationship },
      });
      return { ok: true as const, ...result };
    } catch (cause) {
      return toError(cause);
    }
  });

export const inviteParent = createServerFn({ method: "POST" })
  .validator(inviteParentSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const contacts = await db
      .select({ email: schema.contacts.email })
      .from(schema.contacts)
      .where(
        and(eq(schema.contacts.id, data.contactId), eq(schema.contacts.organizationId, data.orgId)),
      )
      .limit(1);
    const contact = contacts[0];
    if (!contact) {
      return { ok: false as const, error: "Contact not found." };
    }
    return createInvite(db, ctx, contact.email, "parent", getRequestUrl().origin);
  });

// status 默认 active：分组选择器只该看到在用的分组，管理页显式传 archived / all
export const listGroups = createServerFn({ method: "GET" })
  .validator(listGroupsSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId);
    return db
      .select()
      .from(schema.groups)
      .where(
        and(
          eq(schema.groups.organizationId, data.orgId),
          ...(data.status === "all" ? [] : [eq(schema.groups.status, data.status)]),
        ),
      )
      .orderBy(asc(schema.groups.name));
  });

export const createGroup = createServerFn({ method: "POST" })
  .validator(createGroupSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const groupId = generateId(ID_PREFIXES.group);
    try {
      await db.insert(schema.groups).values({
        id: groupId,
        organizationId: data.orgId,
        name: data.name,
        description: data.description ?? null,
        createdAt: Date.now(),
      });
    } catch {
      return { ok: false as const, error: "A group with this name already exists." };
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "group.created",
      objectType: "group",
      objectId: groupId,
      summary: { name: data.name },
    });
    return { ok: true as const, groupId };
  });

export const updateGroup = createServerFn({ method: "POST" })
  .validator(updateGroupSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    return updateGroupCore(
      db,
      data.orgId,
      data.groupId,
      { name: data.name, status: data.status },
      ctx.membershipId,
    );
  });

export const listTerms = createServerFn({ method: "GET" })
  .validator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    return db
      .select()
      .from(schema.terms)
      .where(eq(schema.terms.organizationId, data.orgId))
      .orderBy(asc(schema.terms.startDate));
  });

export const createTerm = createServerFn({ method: "POST" })
  .validator(createTermSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    const ctx = await requireMembership(db, data.orgId, STAFF_ROLES);
    const termId = generateId(ID_PREFIXES.term);
    try {
      await db.insert(schema.terms).values({
        id: termId,
        organizationId: data.orgId,
        name: data.name,
        startDate: data.startDate,
        endDate: data.endDate,
        createdAt: Date.now(),
      });
    } catch {
      return { ok: false as const, error: "A term with this name already exists." };
    }
    await recordAudit(db, {
      organizationId: data.orgId,
      actorMembershipId: ctx.membershipId,
      action: "term.created",
      objectType: "term",
      objectId: termId,
      summary: { name: data.name, startDate: data.startDate, endDate: data.endDate },
    });
    return { ok: true as const, termId };
  });
