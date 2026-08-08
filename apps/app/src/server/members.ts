import { schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import {
  addStudentContactSchema,
  createGroupSchema,
  createStudentSchema,
  createTermSchema,
  inviteParentSchema,
  orgIdSchema,
  updateStudentStatusSchema,
} from "@everband/validation";
import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { and, asc, eq } from "drizzle-orm";
import { recordAudit } from "./audit.ts";
import { getDb } from "./context.ts";
import { requireMembership, STAFF_ROLES } from "./guards.ts";
import { createInvite } from "./invites.ts";
import {
  addContactToStudent,
  createStudentCore,
  MemberError,
  updateStudentStatusCore,
} from "./members-core.ts";

function toError(cause: unknown): { ok: false; error: string } {
  if (cause instanceof MemberError) {
    return { ok: false, error: cause.message };
  }
  throw cause;
}

export const listStudents = createServerFn({ method: "GET" })
  .inputValidator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId, STAFF_ROLES);
    const students = await db
      .select({
        id: schema.students.id,
        name: schema.students.name,
        status: schema.students.status,
        groupId: schema.students.groupId,
        groupName: schema.groups.name,
        householdId: schema.students.householdId,
      })
      .from(schema.students)
      .leftJoin(schema.groups, eq(schema.students.groupId, schema.groups.id))
      .where(eq(schema.students.organizationId, data.orgId))
      .orderBy(asc(schema.students.name));

    const links = await db
      .select({
        studentId: schema.studentContacts.studentId,
        contactId: schema.contacts.id,
        contactName: schema.contacts.name,
        contactEmail: schema.contacts.email,
        relationship: schema.studentContacts.relationship,
        contactUserId: schema.contacts.userId,
      })
      .from(schema.studentContacts)
      .innerJoin(schema.contacts, eq(schema.studentContacts.contactId, schema.contacts.id))
      .where(eq(schema.studentContacts.organizationId, data.orgId));

    return students.map((student) => ({
      ...student,
      contacts: links.filter((link) => link.studentId === student.id),
    }));
  });

export const createStudent = createServerFn({ method: "POST" })
  .inputValidator(createStudentSchema)
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
  .inputValidator(updateStudentStatusSchema)
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

export const addStudentContact = createServerFn({ method: "POST" })
  .inputValidator(addStudentContactSchema)
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
  .inputValidator(inviteParentSchema)
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

export const listGroups = createServerFn({ method: "GET" })
  .inputValidator(orgIdSchema)
  .handler(async ({ data }) => {
    const db = getDb();
    await requireMembership(db, data.orgId);
    return db
      .select()
      .from(schema.groups)
      .where(eq(schema.groups.organizationId, data.orgId))
      .orderBy(asc(schema.groups.name));
  });

export const createGroup = createServerFn({ method: "POST" })
  .inputValidator(createGroupSchema)
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

export const listTerms = createServerFn({ method: "GET" })
  .inputValidator(orgIdSchema)
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
  .inputValidator(createTermSchema)
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
