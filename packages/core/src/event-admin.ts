// staff 侧的活动管理核心（列表 / 编辑 / 删除）。
// events.ts 管的是受众与可见性，这里管的是 staff 的 CRUD，两者互不依赖。

import type { Database } from "@everband/db";
import { schema } from "@everband/db";
import type { EventStatus } from "@everband/domain";
import type {
  EventStatusFilter,
  EventTimeFilter,
  ListResult,
  SortOrder,
} from "@everband/validation";
import { toOffset } from "@everband/validation";
import { and, asc, count, desc, eq, gte, inArray, lt, or, type SQL, sql } from "drizzle-orm";
import { recordAudit } from "./audit.ts";

export interface OrgEventRow {
  id: string;
  title: string;
  type: string;
  description: string | null;
  startsAtUtc: number;
  endsAtUtc: number | null;
  location: string | null;
  status: EventStatus;
  isOrgWide: boolean;
  createdAt: number;
  /** 受众 group（isOrgWide 时为空）；列表直接带上，编辑抽屉才不用再打一趟往返 */
  groupIds: string[];
}

export interface ListOrgEventsInput {
  page: number;
  pageSize: number;
  sort: string;
  order: SortOrder;
  q?: string;
  status: EventStatusFilter;
  time: EventTimeFilter;
}

// 排序白名单：key 与 eventsListSchema 的 sortFields 一一对应，避免把用户输入拼进 SQL
const SORT_COLUMNS = {
  startsAtUtc: schema.events.startsAtUtc,
  createdAt: schema.events.createdAt,
  title: schema.events.title,
} as const;

// LIKE 的通配符转义：用户搜 "50%" 不应该变成任意匹配
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function listOrgEventsCore(
  db: Database,
  orgId: string,
  input: ListOrgEventsInput,
  nowUtcMs: number,
): Promise<ListResult<OrgEventRow>> {
  const conditions: (SQL | undefined)[] = [eq(schema.events.organizationId, orgId)];

  if (input.status !== "all") {
    conditions.push(eq(schema.events.status, input.status));
  }
  if (input.time === "upcoming") {
    conditions.push(gte(schema.events.startsAtUtc, nowUtcMs));
  } else if (input.time === "past") {
    conditions.push(lt(schema.events.startsAtUtc, nowUtcMs));
  }
  if (input.q) {
    // SQLite 的 LIKE 对 ASCII 本就大小写不敏感，但两侧都 lower() 才能覆盖非 ASCII 的一致行为
    const pattern = `%${escapeLikePattern(input.q.toLowerCase())}%`;
    conditions.push(
      or(
        sql`lower(${schema.events.title}) LIKE ${pattern} ESCAPE '\\'`,
        sql`lower(${schema.events.location}) LIKE ${pattern} ESCAPE '\\'`,
      ),
    );
  }

  const where = and(...conditions);
  const column = SORT_COLUMNS[input.sort as keyof typeof SORT_COLUMNS] ?? SORT_COLUMNS.startsAtUtc;
  const direction = input.order === "desc" ? desc : asc;

  const [rows, totals] = await Promise.all([
    db
      .select({
        id: schema.events.id,
        title: schema.events.title,
        type: schema.events.type,
        description: schema.events.description,
        startsAtUtc: schema.events.startsAtUtc,
        endsAtUtc: schema.events.endsAtUtc,
        location: schema.events.location,
        status: schema.events.status,
        isOrgWide: schema.events.isOrgWide,
        createdAt: schema.events.createdAt,
      })
      .from(schema.events)
      .where(where)
      // id 兜底保证同值行的顺序稳定，翻页不会出现重复/丢行
      .orderBy(direction(column), asc(schema.events.id))
      .limit(input.pageSize)
      .offset(toOffset(input.page, input.pageSize)),
    db.select({ value: count() }).from(schema.events).where(where),
  ]);

  // 本页活动的受众一次查完（命中 event_groups 主键前缀），避免每行一条查询
  const pageIds = rows.map((row) => row.id);
  const groupRows =
    pageIds.length > 0
      ? await db
          .select({ eventId: schema.eventGroups.eventId, groupId: schema.eventGroups.groupId })
          .from(schema.eventGroups)
          .where(
            and(
              eq(schema.eventGroups.organizationId, orgId),
              inArray(schema.eventGroups.eventId, pageIds),
            ),
          )
      : [];
  const groupsByEvent = new Map<string, string[]>();
  for (const row of groupRows) {
    const list = groupsByEvent.get(row.eventId);
    if (list) {
      list.push(row.groupId);
    } else {
      groupsByEvent.set(row.eventId, [row.groupId]);
    }
  }

  return {
    items: rows.map((row) => ({ ...row, groupIds: groupsByEvent.get(row.id) ?? [] })),
    total: totals[0]?.value ?? 0,
    page: input.page,
    pageSize: input.pageSize,
  };
}

export type EventWriteResult = { ok: true } | { ok: false; error: string };

export interface UpdateEventCoreInput {
  title?: string;
  // null 表示清空该可选字段，undefined 表示不改
  description?: string | null;
  location?: string | null;
  startsAtUtc?: number;
  endsAtUtc?: number | null;
  isOrgWide?: boolean;
  groupIds?: string[];
}

// published 之后仍可改的字段：补充说明、地点、结束时间。
// 标题与开始时间已经进过 parent 的邮件与日程，改了等于换了一个活动，走取消 + 新建。
const PUBLISHED_EDITABLE_FIELDS = ["description", "location", "endsAtUtc"] as const;

async function assertGroupsInOrg(
  db: Database,
  orgId: string,
  groupIds: string[],
): Promise<boolean> {
  if (groupIds.length === 0) {
    return true;
  }
  const owned = await db
    .select({ id: schema.groups.id })
    .from(schema.groups)
    .where(and(eq(schema.groups.organizationId, orgId), inArray(schema.groups.id, groupIds)));
  return owned.length === groupIds.length;
}

export async function updateEventCore(
  db: Database,
  orgId: string,
  eventId: string,
  input: UpdateEventCoreInput,
  actorMembershipId: string,
  now: number,
): Promise<EventWriteResult> {
  const rows = await db
    .select({ status: schema.events.status })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "Event not found." };
  }
  if (current.status === "cancelled" || current.status === "completed") {
    return { ok: false, error: `A ${current.status} event can no longer be edited.` };
  }

  const touched = Object.keys(input).filter(
    (key) => input[key as keyof UpdateEventCoreInput] !== undefined,
  );
  if (current.status === "published") {
    const blocked = touched.filter(
      (key) =>
        !PUBLISHED_EDITABLE_FIELDS.includes(key as (typeof PUBLISHED_EDITABLE_FIELDS)[number]),
    );
    if (blocked.length > 0) {
      return {
        ok: false,
        error: "A published event only allows changes to its description, location and end time.",
      };
    }
  }

  const isAudienceChange = input.isOrgWide !== undefined || input.groupIds !== undefined;
  const nextGroupIds = input.isOrgWide ? [] : (input.groupIds ?? []);
  if (isAudienceChange) {
    if (input.isOrgWide === false && nextGroupIds.length === 0) {
      return { ok: false, error: "Pick at least one group, or make the event organization-wide." };
    }
    if (!(await assertGroupsInOrg(db, orgId, nextGroupIds))) {
      return { ok: false, error: "One of the selected groups does not exist." };
    }
  }

  await db
    .update(schema.events)
    .set({
      title: input.title,
      description: input.description,
      location: input.location,
      startsAtUtc: input.startsAtUtc,
      endsAtUtc: input.endsAtUtc,
      isOrgWide: input.isOrgWide,
      updatedAt: now,
    })
    .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, orgId)));

  if (isAudienceChange) {
    // 受众整体替换：先清空再写入，避免逐条 diff
    await db
      .delete(schema.eventGroups)
      .where(
        and(eq(schema.eventGroups.organizationId, orgId), eq(schema.eventGroups.eventId, eventId)),
      );
    if (nextGroupIds.length > 0) {
      await db
        .insert(schema.eventGroups)
        .values(nextGroupIds.map((groupId) => ({ organizationId: orgId, eventId, groupId })));
    }
  }

  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "event.updated",
    objectType: "event",
    objectId: eventId,
    summary: { status: current.status, fields: touched },
  });
  return { ok: true };
}

export type DeleteDraftEventResult = { ok: true; r2Keys: string[] } | { ok: false; error: string };

/**
 * 硬删草稿活动。草稿从未对 parent 可见，也不可能产生已发出的邮件，
 * 所以连同它的更新/表单/附件一并清理，不留孤儿行。
 *
 * 附件只清 ownerType = "event" 的：产品里附件上传入口只挂在活动上，
 * event_update 类型的附件没有创建路径，多删一次查询没有收益。
 *
 * R2 对象不在 core 删（core 只依赖 db），把 r2Key 返回给持有绑定的调用方处理。
 */
export async function deleteDraftEventCore(
  db: Database,
  orgId: string,
  eventId: string,
  actorMembershipId: string,
): Promise<DeleteDraftEventResult> {
  const rows = await db
    .select({ status: schema.events.status, title: schema.events.title })
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, orgId)))
    .limit(1);
  const current = rows[0];
  if (!current) {
    return { ok: false, error: "Event not found." };
  }
  if (current.status !== "draft") {
    return { ok: false, error: "Only draft events can be deleted. Cancel it instead." };
  }

  const attachmentRows = await db
    .select({ r2Key: schema.attachments.r2Key })
    .from(schema.attachments)
    .where(
      and(
        eq(schema.attachments.organizationId, orgId),
        eq(schema.attachments.ownerType, "event"),
        eq(schema.attachments.ownerId, eventId),
      ),
    );

  // D1 没有交互式事务，用 batch 让这组删除在同一个事务里按依赖顺序执行
  await db.batch([
    db.delete(schema.formSubmissions).where(
      inArray(
        schema.formSubmissions.formId,
        db
          .select({ id: schema.eventForms.id })
          .from(schema.eventForms)
          .where(
            and(
              eq(schema.eventForms.organizationId, orgId),
              eq(schema.eventForms.eventId, eventId),
            ),
          ),
      ),
    ),
    db
      .delete(schema.eventForms)
      .where(
        and(eq(schema.eventForms.organizationId, orgId), eq(schema.eventForms.eventId, eventId)),
      ),
    db
      .delete(schema.eventUpdates)
      .where(
        and(
          eq(schema.eventUpdates.organizationId, orgId),
          eq(schema.eventUpdates.eventId, eventId),
        ),
      ),
    db
      .delete(schema.attachments)
      .where(
        and(
          eq(schema.attachments.organizationId, orgId),
          eq(schema.attachments.ownerType, "event"),
          eq(schema.attachments.ownerId, eventId),
        ),
      ),
    db
      .delete(schema.eventGroups)
      .where(
        and(eq(schema.eventGroups.organizationId, orgId), eq(schema.eventGroups.eventId, eventId)),
      ),
    db
      .delete(schema.events)
      .where(and(eq(schema.events.id, eventId), eq(schema.events.organizationId, orgId))),
  ]);

  await recordAudit(db, {
    organizationId: orgId,
    actorMembershipId,
    action: "event.deleted",
    objectType: "event",
    objectId: eventId,
    summary: { title: current.title },
  });
  return { ok: true, r2Keys: attachmentRows.map((row) => row.r2Key) };
}
