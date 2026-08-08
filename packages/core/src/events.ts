// 活动受众解析（PRD §5.2/§6.3）。
// parent 可见性：自己 active 学生所在 group 的活动 + 组织范围活动；
// 邮件受众（M7 复用）：目标 group 的 active 学生联系人按邮箱去重。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import type { TimeWindow } from "@everband/domain";
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";

// parent（登录用户）在组织内可触达的 groupId 集合：
// contacts.userId = user → student_contacts → active students → groupId
export async function parentGroupIds(
  db: Database,
  orgId: string,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ groupId: schema.students.groupId })
    .from(schema.contacts)
    .innerJoin(schema.studentContacts, eq(schema.studentContacts.contactId, schema.contacts.id))
    .innerJoin(schema.students, eq(schema.studentContacts.studentId, schema.students.id))
    .where(
      and(
        eq(schema.contacts.organizationId, orgId),
        eq(schema.contacts.userId, userId),
        eq(schema.students.status, "active"),
      ),
    );
  return rows.map((row) => row.groupId).filter((value): value is string => value !== null);
}

export async function canParentAccessEvent(
  db: Database,
  orgId: string,
  userId: string,
  eventId: string,
): Promise<boolean> {
  const events = await db
    .select({ isOrgWide: schema.events.isOrgWide, status: schema.events.status })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, orgId)))
    .limit(1);
  const event = events[0];
  if (!event || event.status === "draft") {
    return false;
  }
  if (event.isOrgWide) {
    // 组织范围活动：任何本组织的 parent 可见
    return true;
  }
  const groupIds = await parentGroupIds(db, orgId, userId);
  if (groupIds.length === 0) {
    return false;
  }
  const hit = await db
    .select({ eventId: schema.eventGroups.eventId })
    .from(schema.eventGroups)
    .where(
      and(
        eq(schema.eventGroups.organizationId, orgId),
        eq(schema.eventGroups.eventId, eventId),
        inArray(schema.eventGroups.groupId, groupIds),
      ),
    )
    .limit(1);
  return hit.length > 0;
}

export interface ParentEventRow {
  id: string;
  title: string;
  type: string;
  startsAtUtc: number;
  endsAtUtc: number | null;
  location: string | null;
  status: "published" | "cancelled";
  isOrgWide: boolean;
}

// parent 的未来 30 天活动（组织时区窗口由调用方计算）；
// published 正常显示，cancelled 保留并标注取消
export async function listParentEvents(
  db: Database,
  orgId: string,
  userId: string,
  window: TimeWindow,
): Promise<ParentEventRow[]> {
  const groupIds = await parentGroupIds(db, orgId, userId);
  const audienceCondition =
    groupIds.length > 0
      ? or(
          eq(schema.events.isOrgWide, true),
          inArray(
            schema.events.id,
            db
              .select({ id: schema.eventGroups.eventId })
              .from(schema.eventGroups)
              .where(
                and(
                  eq(schema.eventGroups.organizationId, orgId),
                  inArray(schema.eventGroups.groupId, groupIds),
                ),
              ),
          ),
        )
      : eq(schema.events.isOrgWide, true);

  const rows = await db
    .select({
      id: schema.events.id,
      title: schema.events.title,
      type: schema.events.type,
      startsAtUtc: schema.events.startsAtUtc,
      endsAtUtc: schema.events.endsAtUtc,
      location: schema.events.location,
      status: schema.events.status,
      isOrgWide: schema.events.isOrgWide,
    })
    .from(schema.events)
    .where(
      and(
        eq(schema.events.organizationId, orgId),
        inArray(schema.events.status, ["published", "cancelled"]),
        gte(schema.events.startsAtUtc, window.startUtcMs),
        lte(schema.events.startsAtUtc, window.endUtcMs),
        audienceCondition,
      ),
    )
    .orderBy(schema.events.startsAtUtc);
  return rows as ParentEventRow[];
}

export interface AudienceContact {
  contactId: string;
  email: string;
  name: string;
}

// 邮件受众（M7）：目标 group（或全组织）active 学生的联系人，按邮箱去重
export async function resolveEventAudienceContacts(
  db: Database,
  orgId: string,
  eventId: string,
): Promise<AudienceContact[]> {
  const events = await db
    .select({ isOrgWide: schema.events.isOrgWide })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, orgId)))
    .limit(1);
  const event = events[0];
  if (!event) {
    return [];
  }

  const studentCondition = event.isOrgWide
    ? and(eq(schema.students.organizationId, orgId), eq(schema.students.status, "active"))
    : and(
        eq(schema.students.organizationId, orgId),
        eq(schema.students.status, "active"),
        inArray(
          schema.students.groupId,
          db
            .select({ id: schema.eventGroups.groupId })
            .from(schema.eventGroups)
            .where(
              and(
                eq(schema.eventGroups.organizationId, orgId),
                eq(schema.eventGroups.eventId, eventId),
              ),
            ),
        ),
      );

  const rows = await db
    .select({
      contactId: schema.contacts.id,
      email: schema.contacts.email,
      name: schema.contacts.name,
    })
    .from(schema.students)
    .innerJoin(schema.studentContacts, eq(schema.studentContacts.studentId, schema.students.id))
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.studentContacts.contactId))
    .where(studentCondition);

  // 按最终邮箱去重（PRD §5.1：多学生/多 group 指向同一邮箱只留一条）
  const byEmail = new Map<string, AudienceContact>();
  for (const row of rows) {
    if (!byEmail.has(row.email)) {
      byEmail.set(row.email, row);
    }
  }
  return [...byEmail.values()];
}
