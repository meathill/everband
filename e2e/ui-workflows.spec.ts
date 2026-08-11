import { expect, type Locator, type Page, test } from "@playwright/test";
import {
  fillField,
  loginViaMagicLink,
  pressButton,
  uniqueEmail,
  waitForHydration,
} from "./helpers.ts";

function futureLocalDateTime(days = 7): string {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const part = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T18:00`;
}

async function createOrganization(page: Page, name: string): Promise<string> {
  await loginViaMagicLink(page, uniqueEmail("e2e-ui"));
  await page.goto("/new-org");
  await fillField(page.locator("#org-name"), name);
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name })).toBeVisible();
  const orgId = new URL(page.url()).pathname.split("/")[2];
  expect(orgId).toBeTruthy();
  return orgId ?? "";
}

async function createGroup(page: Page, orgId: string, name: string): Promise<void> {
  await page.goto(`/o/${orgId}/groups`);
  await pressButton(page, "New group");
  await fillField(page.locator("#group-name"), name);
  await pressButton(page, "Create group");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

async function chooseOption(page: Page, trigger: Locator, option: string): Promise<void> {
  await waitForHydration(trigger);
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function createDraftEvent(
  page: Page,
  orgId: string,
  title: string,
  audience?: string,
): Promise<void> {
  await page.goto(`/o/${orgId}/events`);
  await pressButton(page, "New event");
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  await expect(page.locator('[data-slot="drawer-popup"] [data-slot="frame"]')).toBeVisible();
  await fillField(page.locator("#event-title"), title);
  await fillField(page.locator("#event-starts"), futureLocalDateTime());
  const audienceCheckbox = page.getByRole("checkbox", {
    name: audience ?? "Whole organization",
  });
  await waitForHydration(audienceCheckbox);
  await audienceCheckbox.click();
  await pressButton(page, "Create draft");
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
}

async function publishEvent(page: Page, title: string): Promise<void> {
  const publish = page.getByRole("button", { name: `Publish ${title}` });
  await waitForHydration(publish);
  await publish.click();
  const confirm = page.getByRole("button", { name: "Publish", exact: true });
  await waitForHydration(confirm);
  await confirm.click();
  await expect(page.getByText("Event published", { exact: true })).toBeVisible();
}

async function importMembers(
  page: Page,
  orgId: string,
  groupName: string,
  names: string[],
): Promise<void> {
  const rows = names.map(
    (name, index) =>
      `${name},Contact ${index},member-${Date.now()}-${index}@test.local,parent,${groupName},active`,
  );
  const csv = ["studentName,contactName,contactEmail,relationship,groupName,status", ...rows].join(
    "\n",
  );
  await page.goto(`/o/${orgId}/import`);
  const fileInput = page.locator("#csv-file");
  await waitForHydration(fileInput);
  await fileInput.setInputFiles({
    buffer: Buffer.from(csv),
    mimeType: "text/csv",
    name: "members.csv",
  });
  await expect(
    page.getByText(new RegExp(`${names.length} rows.*${names.length} valid`)),
  ).toBeVisible();
  await pressButton(page, "Confirm import");
  await expect(page.getByText(/Import queued/)).toBeVisible();
}

async function openMobileSidebar(page: Page): Promise<void> {
  const sidebar = page.getByRole("dialog", { name: "Sidebar" });
  if (await sidebar.isVisible()) return;
  const trigger = page.locator('[data-slot="sidebar-trigger"]');
  await waitForHydration(trigger);
  await trigger.click();
  await expect(sidebar).toBeVisible();
}

test("侧边栏高亮、桌面折叠持久化与移动端 Sheet", async ({ page }) => {
  const orgId = await createOrganization(page, `Sidebar ${Date.now()}`);
  const isMobile = (page.viewportSize()?.width ?? 0) < 768;

  if (isMobile) {
    await openMobileSidebar(page);
    await expect(page.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "data-active",
      "true",
    );
  } else {
    const sidebar = page.locator('[data-slot="sidebar"][data-state]');
    await expect(sidebar).toHaveAttribute("data-state", "expanded");
    await page.locator('[data-slot="sidebar-trigger"]').click();
    await expect(sidebar).toHaveAttribute("data-state", "collapsed");
    await expect
      .poll(
        async () =>
          (await page.context().cookies()).find((cookie) => cookie.name === "sidebar_state")?.value,
      )
      .toBe("false");
    await page.reload();
    await expect(page.locator('[data-slot="sidebar"][data-state]')).toHaveAttribute(
      "data-state",
      "collapsed",
    );
  }

  if (isMobile) await openMobileSidebar(page);
  await page.getByRole("link", { name: "Events" }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/events`));
  if (isMobile) await openMobileSidebar(page);
  await expect(page.getByRole("link", { name: "Events" })).toHaveAttribute("data-active", "true");
});

test("Drawer 创建活动，Frame 表单提交后 URL 不变", async ({ page }) => {
  const orgId = await createOrganization(page, `Drawer ${Date.now()}`);
  await page.goto(`/o/${orgId}/events`);
  const listPath = new URL(page.url()).pathname;
  const title = `Drawer event ${Date.now()}`;

  await createDraftEvent(page, orgId, title);

  expect(new URL(page.url()).pathname).toBe(listPath);
  await expect(page.getByRole("heading", { name: "New event" })).not.toBeVisible();
});

test("活动删除确认与 published 取消均刷新列表并显示 toast", async ({ page }) => {
  const orgId = await createOrganization(page, `Lifecycle ${Date.now()}`);
  const deletedTitle = `Delete me ${Date.now()}`;
  const cancelledTitle = `Cancel me ${Date.now()}`;
  await createDraftEvent(page, orgId, deletedTitle);
  await createDraftEvent(page, orgId, cancelledTitle);

  await page.getByRole("button", { name: `Delete ${deletedTitle}` }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("Event deleted", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: deletedTitle, exact: true })).not.toBeVisible();

  await publishEvent(page, cancelledTitle);
  await page.getByRole("button", { name: `Cancel ${cancelledTitle}` }).click();
  await page.getByRole("button", { name: "Cancel event", exact: true }).click();
  await expect(page.getByText("Event cancelled", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("row").filter({ has: page.getByRole("link", { name: cancelledTitle }) }),
  ).toContainText("cancelled");
});

test("Members 搜索、筛选和翻页状态写入 URL", async ({ page }) => {
  const orgId = await createOrganization(page, `Members ${Date.now()}`);
  const groupName = `Group ${Date.now()}`;
  const names = Array.from(
    { length: 11 },
    (_, index) => `Pagination Member ${String(index).padStart(2, "0")}`,
  );
  await createGroup(page, orgId, groupName);
  await importMembers(page, orgId, groupName, names);

  await page.goto(`/o/${orgId}/members?pageSize=10`);
  await expect
    .poll(
      async () => {
        await page.reload();
        return page.getByText(names[0] ?? "", { exact: true }).count();
      },
      { timeout: 20_000 },
    )
    .toBe(1);
  await expect(page.getByText("Showing 1–10 of 11")).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Search students" });
  await fillField(search, names[10] ?? "");
  await search.press("Enter");
  await expect(page).toHaveURL(/q=Pagination(?:\+|%20)Member(?:\+|%20)10/);
  await expect(page.getByText(names[10] ?? "", { exact: true })).toBeVisible();
  await expect(page.getByText(names[0] ?? "", { exact: true })).not.toBeVisible();

  await fillField(search, "");
  await search.press("Enter");
  await chooseOption(page, page.getByRole("combobox", { name: "Filter by status" }), "Active");
  await expect(page).toHaveURL(/status=active/);
  await chooseOption(page, page.getByRole("combobox", { name: "Filter by group" }), groupName);
  await expect(page).toHaveURL(/group=grp_/);
  await page.getByRole("button", { name: "Go to next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Showing 11–11 of 11")).toBeVisible();
});

test("parent 仍看到 30 天活动卡片而不是 staff 管理表", async ({ page }) => {
  const orgId = await createOrganization(page, `Parent ${Date.now()}`);
  const groupName = `Parent group ${Date.now()}`;
  const studentName = `Parent student ${Date.now()}`;
  const parentEmail = uniqueEmail("e2e-parent");
  const eventTitle = `Parent event ${Date.now()}`;
  await createGroup(page, orgId, groupName);

  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), studentName);
  await fillField(page.locator("#contact-name"), "Parent Contact");
  await fillField(page.locator("#contact-email"), parentEmail);
  await chooseOption(page, page.locator("#student-group"), groupName);
  await pressButton(page, "Add student");
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  await createDraftEvent(page, orgId, eventTitle, groupName);
  await publishEvent(page, eventTitle);

  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Invite parent");
  await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible();
  await page.goto("/dev/outbox");
  const invite = page.locator('article[data-kind="invite"]', { hasText: parentEmail }).first();
  await expect(invite).toBeVisible();
  const body = await invite.locator("pre").innerText();
  const inviteLink = body.match(/http:\/\/[^\s]+\/invite\/[^\s]+/)?.[0] ?? "";
  expect(inviteLink).toContain("/invite/");
  await page.goto(inviteLink);
  await page.goto(`/o/${orgId}/events`);

  await expect(page.getByRole("heading", { name: "Upcoming events" })).toBeVisible();
  await expect(page.getByRole("link", { name: eventTitle })).toBeVisible();
  await expect(page.getByRole("button", { name: "New event" })).not.toBeVisible();
  await expect(page.locator("table")).not.toBeVisible();
});
