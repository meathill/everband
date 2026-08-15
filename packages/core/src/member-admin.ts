// staff 侧的成员管理核心（学生列表 / 编辑 / 分组维护）。
// members.ts 管的是录入与邮箱归并规则，这里管录入之后的日常维护，两者互不依赖。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import type { StudentStatus } from "@everband/domain";
import { validateStudentGroup } from "@everband/domain";
import type { GroupStatus, ListResult, SortOrder, StudentStatusFilter } from "@everband/validation";
import { toOffset } from "@everband/validation";
import { and, asc, count, desc, eq, gte, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";
import { recordAudit } from "./audit.ts";

export interface StudentContactRow {
  contactId: string;
  contactName: string;
  contactEmail: string;
  relationship: string;
  contactUserId: string | null;
}

export interface OrgStudentRow {
  id: string;
  name: string;
  status: StudentStatus;
  groupId: string | null;
  groupName: string | null;
  createdAt: number;
  /** 该学生的联系人；列表直接带上，行内"邀请家长"才不用再打一趟往返 */
  contacts: StudentContactRow[];
}

export interface ListStudentsInput {
  page: number;
  pageSize: number;
  sort: string;
  order: SortOrder;
  q?: string;
  status: StudentStatusFilter;
  /** groupId，"all"（不限）或 "unassigned"（无分组） */
  group: string;
}

// 排序白名单：key 与 studentsListSchema 的 sortFields 一一对应，避免把用户输入拼进 SQL
const SORT_COLUMNS = {
  name: schema.students.name,
  createdAt: schema.students.createdAt,
  status: schema.students.status,
} as const;

// LIKE 的通配符转义：用户搜 "50%" 不应该变成任意匹配
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * staff 学生列表。
 *
 * 归档语义：`status === "all"` 排除 archived——归档学生是历史记录，默认视图不看；
 * 要看必须显式选 `status="archived"`（与 studentsListSchema 的注释是同一条规则）。
 */
export async function listStudentsCore(
  db: Database,
  orgId: string,
  input: ListStudentsInput,
): Promise<ListResult<OrgStudentRow>> {
  const conditions: (SQL | undefined)[] = [eq(schema.students.organizationId, orgId)];

  if (input.status === "all") {
    conditions.push(ne(schema.students.status, "archived"));
  } else {
    conditions.push(eq(schema.students.status, input.status));
  }
  if (input.group === "unassigned") {
    conditions.push(isNull(schema.students.groupId));
  } else if (input.group !== "all") {
    conditions.push(eq(schema.students.groupId, input.group));
  }
  if (input.q) {
    // SQLite 的 LIKE 对 ASCII 本就大小写不敏感，两侧都 lower() 才覆盖非 ASCII 的一致行为
    const pattern = `%${escapeLikePattern(input.q.toLowerCase())}%`;
    conditions.push(sql`lower(${schema.students.name}) LIKE ${pattern} ESCAPE '\\'`);
  }

  const where = and(...conditions);
  const column = SORT_COLUMNS[input.sort as keyof typeof SORT_COLUMNS] ?? SORT_COLUMNS.name;
  const direction = input.order === "desc" ? desc : asc;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: schema.students.id,
        name: schema.students.name,
        status: schema.students.status,
        groupId: schema.students.groupId,
        groupName: schema.groups.name,
        createdAt: schema.students.createdAt,
      })
      .from(schema.students)
      .leftJoin(schema.groups, eq(schema.students.groupId, schema.groups.id))
      .where(where)
      // id 兜底保证同值行的顺序稳定，翻页不会出现重复/丢行
      .orderBy(direction(column), asc(schema.students.id))
      .limit(input.pageSize)
      .offset(toOffset(input.page, input.pageSize)),
    db.select({ value: count() }).from(schema.students).where(where),
  ]);

  // 本页学生的联系人一次查完，避免每行一条查询
  const pageIds = rows.map((row) => row.id);
  const links =
    pageIds.length > 0
      ? await db
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
          .where(
            and(
              eq(schema.studentContacts.organizationId, orgId),
              inArray(schema.studentContacts.studentId, pageIds),
            ),
          )
      : [];
  const contactsByStudent = new Map<string, StudentContactRow[]>();
  for (const { studentId, ...contact } of links) {
    const list = contactsByStudent.get(studentId);
    if (list) {
      list.push(contact);
    } else {
      contactsByStudent.set(studentId, [contact]);
    }
  }

  return {
    items: rows.map((row) => ({ ...row, contacts: contactsByStudent.get(row.id) ?? [] })),
    total: totals[0]?.value ?? 0,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export type MemberWriteResult = { ok: true } | { ok: false; error: string };

export interface UpdateStudentCoreInput {
  name?: string;
  /** null 表示移出分组，undefined 表示不改 */
  groupId?: string | null;
}

/** 改名 / 换组。状态不在这里改（走 updateStudentStatusCore），所以状态机无需参与。 */
export async function updateStudentCore(
  db: Database,
  orgId: string,
  studentId: string,
  input: UpdateStudentCoreInput,
  actorMembershipId: string,
): Promise<MemberWriteResult> {
  const rows = await db
    .select({ status: schema.students.status, groupId: schema.students.groupId })
    .from(schema.students)
    .where(and(eq(schema.students.id, studentId), eq(schema.students.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "Student not found." };
  }

  if (input.groupId !== undefined) {
    const groupCheck = validateStudentGroup(current.status, input.groupId);
    if (!groupCheck.valid) {
      return { ok: false, error: `${groupCheck.reason}.` };
    }
    if (input.groupId !== null && input.groupId !== current.groupId) {
      const groups = await db
        .select({ status: schema.groups.status })
        .from(schema.groups)
        .where(and(eq(schema.groups.id, input.groupId), eq(schema.groups.organizationId, orgId)))
        .limit(1);
      const group = groups[0];
      if (!group) {
        return { ok: false, error: "Group not found in this organization." };
      }
      if (group.status === "archived") {
        return { ok: false, error: "That group is archived. Restore it first." };
      }
    }
  }

  await db
    .update(schema.students)
    .set({ name: input.name, groupId: input.groupId })
    .where(and(eq(schema.students.id, studentId), eq(schema.students.organizationId, orgId)));

  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "student.updated",
    objectType: "student",
    objectId: studentId,
    summary: { name: input.name ?? null, groupId: input.groupId ?? null },
  });
  return { ok: true };
}

export interface UpdateGroupCoreInput {
  name?: string;
  status?: GroupStatus;
}

/**
 * 改名 / 归档 / 恢复分组。
 *
 * 归档前必须没有东西还指着它：分组一旦归档就从所有选择器里消失，留下的引用只会变成
 * 界面上选不回来的悬空值。三类拦截：在册学生（非 archived）、draft/published 活动、
 * active 排练 series（isEnabled 且未来仍有 scheduled 场次——active 的判定与
 * listRehearsalSeriesCore 一致；这种 series 还会继续生成排班）。
 */
export async function updateGroupCore(
  db: Database,
  orgId: string,
  groupId: string,
  input: UpdateGroupCoreInput,
  actorMembershipId: string,
  nowUtcMs: number,
): Promise<MemberWriteResult> {
  const rows = await db
    .select({ status: schema.groups.status })
    .from(schema.groups)
    .where(and(eq(schema.groups.id, groupId), eq(schema.groups.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "Group not found." };
  }

  if (input.status === "archived" && current.status !== "archived") {
    const [students, events, series] = await Promise.all([
      db
        .select({ value: count() })
        .from(schema.students)
        .where(
          and(
            eq(schema.students.organizationId, orgId),
            eq(schema.students.groupId, groupId),
            ne(schema.students.status, "archived"),
          ),
        ),
      db
        .select({ value: count() })
        .from(schema.eventGroups)
        .innerJoin(schema.events, eq(schema.events.id, schema.eventGroups.eventId))
        .where(
          and(
            eq(schema.eventGroups.organizationId, orgId),
            eq(schema.eventGroups.groupId, groupId),
            inArray(schema.events.status, ["draft", "published"]),
          ),
        ),
      // 未来仍排着场次的启用中 series：不拦下来会继续给一个选不到的组生成排班
      db
        .select({ value: count() })
        .from(schema.rehearsalOccurrences)
        .innerJoin(
          schema.rehearsalSeries,
          eq(schema.rehearsalSeries.id, schema.rehearsalOccurrences.seriesId),
        )
        .where(
          and(
            eq(schema.rehearsalSeries.organizationId, orgId),
            eq(schema.rehearsalSeries.groupId, groupId),
            eq(schema.rehearsalSeries.isEnabled, true),
            eq(schema.rehearsalOccurrences.status, "scheduled"),
            gte(schema.rehearsalOccurrences.startsAtUtc, nowUtcMs),
          ),
        ),
    ]);
    if ((students[0]?.value ?? 0) > 0) {
      return { ok: false, error: "Move the remaining students out of this group first." };
    }
    if ((events[0]?.value ?? 0) > 0) {
      return {
        ok: false,
        error: "This group is still the audience of a draft or published event.",
      };
    }
    if ((series[0]?.value ?? 0) > 0) {
      return { ok: false, error: "End the rehearsal series for this group first." };
    }
  }

  try {
    await db
      .update(schema.groups)
      .set({ name: input.name, status: input.status })
      .where(and(eq(schema.groups.id, groupId), eq(schema.groups.organizationId, orgId)));
  } catch {
    return { ok: false, error: "A group with this name already exists." };
  }

  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "group.updated",
    objectType: "group",
    objectId: groupId,
    summary: { name: input.name ?? null, status: input.status ?? current.status },
  });
  return { ok: true };
}
