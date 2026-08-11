import { env } from "cloudflare:test";
import {
  deleteDraftEventCore,
  type ListOrgEventsInput,
  listOrgEventsCore,
  updateEventCore,
} from "@everband/core";
import { createDb, schema } from "@everband/db";
import { generateId, ID_PREFIXES } from "@everband/domain";
import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

const db = createDb(env.DB);
const NOW = 1_754_300_000_000;
const DAY = 24 * 3600 * 1000;

let seq = 0;
function unique(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}-${Math.random().toString(36).slice(2, 6)}`;
}

interface Seeded {
  orgId: string;
  membershipId: string;
  groupA: string;
  groupB: string;
}

async function seed(): Promise<Seeded> {
  const orgId = generateId(ID_PREFIXES.organization);
  const membershipId = generateId(ID_PREFIXES.membership);
  const groupA = generateId(ID_PREFIXES.group);
  const groupB = generateId(ID_PREFIXES.group);
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
    invitedEmail: `${unique("owner")}@test.local`,
    createdAt: NOW,
  });
  await db.insert(schema.groups).values([
    { id: groupA, organizationId: orgId, name: unique("A"), createdAt: NOW },
    { id: groupB, organizationId: orgId, name: unique("B"), createdAt: NOW },
  ]);
  return { orgId, membershipId, groupA, groupB };
}

interface SeedEventOptions {
  title?: string;
  location?: string | null;
  status?: "draft" | "published" | "cancelled" | "completed";
  startsAtUtc?: number;
  createdAt?: number;
  isOrgWide?: boolean;
  groupIds?: string[];
}

async function seedEvent(seeded: Seeded, options: SeedEventOptions = {}): Promise<string> {
  const eventId = generateId(ID_PREFIXES.event);
  await db.insert(schema.events).values({
    id: eventId,
    organizationId: seeded.orgId,
    title: options.title ?? unique("Event"),
    location: options.location ?? null,
    startsAtUtc: options.startsAtUtc ?? NOW + DAY,
    isOrgWide: options.isOrgWide ?? false,
    status: options.status ?? "draft",
    createdByMembershipId: seeded.membershipId,
    createdAt: options.createdAt ?? NOW,
    updatedAt: NOW,
  });
  for (const groupId of options.groupIds ?? []) {
    await db.insert(schema.eventGroups).values({ organizationId: seeded.orgId, eventId, groupId });
  }
  return eventId;
}

const BASE_QUERY: ListOrgEventsInput = {
  page: 1,
  pageSize: 20,
  sort: "startsAtUtc",
  order: "asc",
  status: "all",
  time: "all",
};

function list(seeded: Seeded, patch: Partial<ListOrgEventsInput> = {}, now = NOW) {
  return listOrgEventsCore(db, seeded.orgId, { ...BASE_QUERY, ...patch }, now);
}

async function auditActions(orgId: string, objectId: string): Promise<string[]> {
  const rows = await db
    .select({ action: schema.auditEntries.action })
    .from(schema.auditEntries)
    .where(
      and(
        eq(schema.auditEntries.organizationId, orgId),
        eq(schema.auditEntries.objectId, objectId),
      ),
    );
  return rows.map((row) => row.action);
}

describe("listOrgEventsCore 分页", () => {
  it("total 是筛选后的总数，翻页边界不重不漏", async () => {
    const seeded = await seed();
    for (let index = 0; index < 5; index += 1) {
      await seedEvent(seeded, { startsAtUtc: NOW + index * DAY });
    }

    const first = await list(seeded, { pageSize: 2 });
    expect(first.total).toBe(5);
    expect(first.items).toHaveLength(2);
    expect(first.page).toBe(1);

    const second = await list(seeded, { page: 2, pageSize: 2 });
    const third = await list(seeded, { page: 3, pageSize: 2 });
    expect(second.items).toHaveLength(2);
    // 最后一页只剩 1 条
    expect(third.items).toHaveLength(1);

    const ids = [...first.items, ...second.items, ...third.items].map((row) => row.id);
    expect(new Set(ids).size).toBe(5);

    // 越界页返回空但 total 不变
    const beyond = await list(seeded, { page: 9, pageSize: 2 });
    expect(beyond.items).toHaveLength(0);
    expect(beyond.total).toBe(5);
  });
});

describe("listOrgEventsCore 排序", () => {
  it("startsAtUtc asc/desc 与 title 排序都按白名单落到对应列", async () => {
    const seeded = await seed();
    const early = await seedEvent(seeded, { startsAtUtc: NOW + DAY, title: "Zulu rehearsal" });
    const late = await seedEvent(seeded, { startsAtUtc: NOW + 3 * DAY, title: "Alpha concert" });

    const asc = await list(seeded, { order: "asc", sort: "startsAtUtc" });
    expect(asc.items.map((row) => row.id)).toEqual([early, late]);

    const desc = await list(seeded, { order: "desc", sort: "startsAtUtc" });
    expect(desc.items.map((row) => row.id)).toEqual([late, early]);

    const byTitle = await list(seeded, { order: "asc", sort: "title" });
    expect(byTitle.items.map((row) => row.id)).toEqual([late, early]);
  });

  it("非法排序字段回落到 startsAtUtc，不会拼进 SQL", async () => {
    const seeded = await seed();
    const early = await seedEvent(seeded, { startsAtUtc: NOW + DAY });
    const late = await seedEvent(seeded, { startsAtUtc: NOW + 2 * DAY });

    const rows = await list(seeded, { sort: "title; drop table events" });
    expect(rows.items.map((row) => row.id)).toEqual([early, late]);
  });
});

describe("listOrgEventsCore 筛选", () => {
  it("status 筛选只返回对应状态", async () => {
    const seeded = await seed();
    const draft = await seedEvent(seeded, { status: "draft" });
    await seedEvent(seeded, { status: "published" });
    await seedEvent(seeded, { status: "cancelled" });

    const drafts = await list(seeded, { status: "draft" });
    expect(drafts.total).toBe(1);
    expect(drafts.items[0]?.id).toBe(draft);
    expect((await list(seeded, { status: "all" })).total).toBe(3);
  });

  it("time 按 startsAtUtc 与当前时间比较", async () => {
    const seeded = await seed();
    const past = await seedEvent(seeded, { startsAtUtc: NOW - DAY });
    const future = await seedEvent(seeded, { startsAtUtc: NOW + DAY });

    const upcoming = await list(seeded, { time: "upcoming" });
    expect(upcoming.items.map((row) => row.id)).toEqual([future]);

    const history = await list(seeded, { time: "past" });
    expect(history.items.map((row) => row.id)).toEqual([past]);

    expect((await list(seeded, { time: "all" })).total).toBe(2);
  });
});

describe("listOrgEventsCore 搜索", () => {
  it("q 命中 title 与 location，且大小写不敏感", async () => {
    const seeded = await seed();
    const byTitle = await seedEvent(seeded, { title: "Winter Gala" });
    const byLocation = await seedEvent(seeded, { title: "Rehearsal", location: "Main HALL" });
    await seedEvent(seeded, { title: "Bake sale", location: "Car park" });

    const gala = await list(seeded, { q: "winter" });
    expect(gala.items.map((row) => row.id)).toEqual([byTitle]);

    const hall = await list(seeded, { q: "main hall" });
    expect(hall.items.map((row) => row.id)).toEqual([byLocation]);

    // 通配符被转义，不会退化成"匹配所有"
    expect((await list(seeded, { q: "%" })).total).toBe(0);
  });
});

describe("updateEventCore", () => {
  it("draft 可改全部字段，受众同步到 event_groups", async () => {
    const seeded = await seed();
    const eventId = await seedEvent(seeded, { groupIds: [seeded.groupA] });

    const result = await updateEventCore(
      db,
      seeded.orgId,
      eventId,
      {
        title: "Renamed",
        description: "New body",
        location: "New hall",
        startsAtUtc: NOW + 5 * DAY,
        endsAtUtc: NOW + 6 * DAY,
        isOrgWide: false,
        groupIds: [seeded.groupB],
      },
      seeded.membershipId,
      NOW + 1,
    );
    expect(result.ok).toBe(true);

    const rows = await list(seeded);
    const row = rows.items[0];
    expect(row?.title).toBe("Renamed");
    expect(row?.location).toBe("New hall");
    expect(row?.startsAtUtc).toBe(NOW + 5 * DAY);
    // 旧 group 被替换掉而不是追加
    expect(row?.groupIds).toEqual([seeded.groupB]);
    expect(await auditActions(seeded.orgId, eventId)).toContain("event.updated");
  });

  it("draft 改成 org-wide 会清空 event_groups", async () => {
    const seeded = await seed();
    const eventId = await seedEvent(seeded, { groupIds: [seeded.groupA, seeded.groupB] });

    const result = await updateEventCore(
      db,
      seeded.orgId,
      eventId,
      { isOrgWide: true, groupIds: [] },
      seeded.membershipId,
      NOW + 1,
    );
    expect(result.ok).toBe(true);
    expect((await list(seeded)).items[0]?.groupIds).toEqual([]);
  });

  it("published 只放开 description/location/endsAtUtc", async () => {
    const seeded = await seed();
    const eventId = await seedEvent(seeded, { status: "published", title: "Locked" });

    const allowed = await updateEventCore(
      db,
      seeded.orgId,
      eventId,
      { description: "Bring a chair", location: "Gym", endsAtUtc: NOW + 2 * DAY },
      seeded.membershipId,
      NOW + 1,
    );
    expect(allowed.ok).toBe(true);

    const blocked = await updateEventCore(
      db,
      seeded.orgId,
      eventId,
      { title: "Renamed" },
      seeded.membershipId,
      NOW + 2,
    );
    expect(blocked).toEqual({
      ok: false,
      error: "A published event only allows changes to its description, location and end time.",
    });

    const audienceBlocked = await updateEventCore(
      db,
      seeded.orgId,
      eventId,
      { isOrgWide: true },
      seeded.membershipId,
      NOW + 3,
    );
    expect(audienceBlocked.ok).toBe(false);

    // 被拒的调用不能改到数据
    expect((await list(seeded)).items[0]?.title).toBe("Locked");
  });

  it("cancelled/completed 一律拒绝", async () => {
    const seeded = await seed();
    const cancelled = await seedEvent(seeded, { status: "cancelled" });
    const completed = await seedEvent(seeded, { status: "completed" });

    for (const eventId of [cancelled, completed]) {
      const result = await updateEventCore(
        db,
        seeded.orgId,
        eventId,
        { description: "late note" },
        seeded.membershipId,
        NOW + 1,
      );
      expect(result.ok).toBe(false);
    }
    expect(await auditActions(seeded.orgId, cancelled)).not.toContain("event.updated");
  });

  it("受众为空或 group 不属于本组织时报可读错误", async () => {
    const seeded = await seed();
    const other = await seed();
    const eventId = await seedEvent(seeded, { groupIds: [seeded.groupA] });

    const empty = await updateEventCore(
      db,
      seeded.orgId,
      eventId,
      { isOrgWide: false, groupIds: [] },
      seeded.membershipId,
      NOW + 1,
    );
    expect(empty).toEqual({
      ok: false,
      error: "Pick at least one group, or make the event organization-wide.",
    });

    const foreign = await updateEventCore(
      db,
      seeded.orgId,
      eventId,
      { isOrgWide: false, groupIds: [other.groupA] },
      seeded.membershipId,
      NOW + 2,
    );
    expect(foreign).toEqual({ ok: false, error: "One of the selected groups does not exist." });
    // 受众没有被半途清空
    expect((await list(seeded)).items[0]?.groupIds).toEqual([seeded.groupA]);
  });
});

describe("deleteDraftEventCore", () => {
  it("draft 删成功并清理更新/表单/附件/受众，返回 r2Key", async () => {
    const seeded = await seed();
    const eventId = await seedEvent(seeded, { groupIds: [seeded.groupA] });
    const updateId = generateId(ID_PREFIXES.eventUpdate);
    const formId = generateId(ID_PREFIXES.eventForm);
    const attachmentId = generateId(ID_PREFIXES.attachment);
    const r2Key = `org/${seeded.orgId}/event/${eventId}/${attachmentId}`;

    await db.insert(schema.eventUpdates).values({
      id: updateId,
      organizationId: seeded.orgId,
      eventId,
      title: "Draft note",
      body: "Body",
      status: "draft",
      createdByMembershipId: seeded.membershipId,
      createdAt: NOW,
    });
    await db.insert(schema.eventForms).values({
      id: formId,
      organizationId: seeded.orgId,
      eventId,
      kind: "rsvp",
      status: "open",
      createdByMembershipId: seeded.membershipId,
      createdAt: NOW,
    });
    await db.insert(schema.formSubmissions).values({
      id: generateId(ID_PREFIXES.formSubmission),
      organizationId: seeded.orgId,
      formId,
      membershipId: seeded.membershipId,
      payloadJson: "{}",
      submittedAt: NOW,
      updatedAt: NOW,
    });
    await db.insert(schema.attachments).values({
      id: attachmentId,
      organizationId: seeded.orgId,
      ownerType: "event",
      ownerId: eventId,
      r2Key,
      fileName: "plan.pdf",
      contentType: "application/pdf",
      sizeBytes: 10,
      uploadedByMembershipId: seeded.membershipId,
      createdAt: NOW,
    });

    const result = await deleteDraftEventCore(db, seeded.orgId, eventId, seeded.membershipId);
    expect(result).toEqual({ ok: true, r2Keys: [r2Key] });

    expect((await list(seeded)).total).toBe(0);
    const leftovers = await Promise.all([
      db.select().from(schema.eventUpdates).where(eq(schema.eventUpdates.eventId, eventId)),
      db.select().from(schema.eventForms).where(eq(schema.eventForms.eventId, eventId)),
      db.select().from(schema.formSubmissions).where(eq(schema.formSubmissions.formId, formId)),
      db.select().from(schema.attachments).where(eq(schema.attachments.ownerId, eventId)),
      db.select().from(schema.eventGroups).where(eq(schema.eventGroups.eventId, eventId)),
    ]);
    for (const rows of leftovers) {
      expect(rows).toHaveLength(0);
    }
    expect(await auditActions(seeded.orgId, eventId)).toContain("event.deleted");
  });

  it("非 draft 拒删且不落 audit", async () => {
    const seeded = await seed();
    const eventId = await seedEvent(seeded, { status: "published" });

    const result = await deleteDraftEventCore(db, seeded.orgId, eventId, seeded.membershipId);
    expect(result).toEqual({
      ok: false,
      error: "Only draft events can be deleted. Cancel it instead.",
    });
    expect((await list(seeded)).total).toBe(1);
    expect(await auditActions(seeded.orgId, eventId)).not.toContain("event.deleted");
  });

  it("跨组织删不到别人的活动", async () => {
    const seeded = await seed();
    const other = await seed();
    const eventId = await seedEvent(other);

    const result = await deleteDraftEventCore(db, seeded.orgId, eventId, seeded.membershipId);
    expect(result.ok).toBe(false);
    expect((await list(other)).total).toBe(1);
  });
});
