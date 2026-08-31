import { expect, type Locator, type Page, test } from "./fixtures.ts";
import {
  fillField,
  loginViaMagicLink,
  pressButton,
  uniqueEmail,
  waitForHydration,
} from "./helpers.ts";

function futureLocalDateTime(days = 7): { date: string; time: string } {
  const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  const part = (value: number) => String(value).padStart(2, "0");
  return {
    date: `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}`,
    time: "18:00",
  };
}

function currentSydneyMonthDateTime(): { date: string; dateTime: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? "2026";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const date = `${year}-${month}-15`;
  return { date, dateTime: `${date}T18:00` };
}

async function createOrganization(page: Page, name: string): Promise<string> {
  await loginViaMagicLink(page, uniqueEmail("e2e-ui"));
  await page.goto("/new-org");
  await fillField(page.locator("#org-name"), name);
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const orgId = new URL(page.url()).pathname.split("/")[2];
  expect(orgId).toBeTruthy();
  return orgId ?? "";
}

async function chooseOption(page: Page, trigger: Locator, option: string): Promise<void> {
  await waitForHydration(trigger);
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function createDraftEvent(page: Page, orgId: string, title: string): Promise<void> {
  await page.goto(`/o/${orgId}/events`);
  await pressButton(page, "New event");
  await expect(page.getByRole("heading", { name: "New event" })).toBeVisible();
  await expect(page.locator('[data-slot="drawer-popup"] [data-slot="frame"]')).toBeVisible();
  await fillField(page.locator("#event-title"), title);
  const startsAt = futureLocalDateTime();
  await fillField(page.locator("#event-starts-date"), startsAt.date);
  await fillField(page.locator("#event-starts-time"), startsAt.time);
  await pressButton(page, "Create draft");
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
}

async function createDraftEventAt(
  page: Page,
  orgId: string,
  title: string,
  startsAt: string,
): Promise<void> {
  await page.goto(`/o/${orgId}/events`);
  await pressButton(page, "New event");
  await fillField(page.locator("#event-title"), title);
  const [date, time] = startsAt.split("T");
  await fillField(page.locator("#event-starts-date"), date ?? "");
  await fillField(page.locator("#event-starts-time"), time ?? "");
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

async function importMembers(page: Page, orgId: string, names: string[]): Promise<void> {
  const rows = names.map(
    (name, index) =>
      `${name},Contact ${index},member-${Date.now()}-${index}@test.local,parent,active`,
  );
  const csv = ["studentName,contactName,contactEmail,relationship,status", ...rows].join("\n");
  await page.goto(`/o/${orgId}/import`);
  const fileInput = page.locator("#settings-csv-file");
  await waitForHydration(fileInput);
  await fileInput.setInputFiles({
    buffer: Buffer.from(csv),
    mimeType: "text/csv",
    name: "members.csv",
  });
  await expect(
    page.getByText(new RegExp(`${names.length} rows.*${names.length} valid`)),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm import" }).click();
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

test("Overview staff 视图：左侧 Groups 多选发邮件，右侧 Work in Progress 按时间排序可进详情", async ({
  page,
}) => {
  const orgId = await createOrganization(page, `Staff overview ${Date.now()}`);
  const groupName = `WIP Group ${Date.now()}`;
  await page.goto(`/o/${orgId}/groups`);
  await pressButton(page, "New group");
  await fillField(page.locator("#group-name"), groupName);
  await pressButton(page, "Create group");
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();

  const titles = Array.from({ length: 2 }, (_, index) => `WIP item ${index + 1} ${Date.now()}`);
  // 两个不同时间，确保 WIP 按时间排序
  const base = currentSydneyMonthDateTime();
  await createDraftEventAt(page, orgId, titles[0] ?? "", `${base.date}T10:00`);
  await createDraftEventAt(page, orgId, titles[1] ?? "", `${base.date}T18:00`);

  await page.goto(`/o/${orgId}`);
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work in Progress" })).toBeVisible();
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();

  const emailButton = page.getByRole("button", { name: /^Email/ });
  await expect(emailButton).toBeDisabled();
  const groupCheckbox = page.getByRole("checkbox", { name: `Select ${groupName}` });
  await waitForHydration(groupCheckbox);
  await groupCheckbox.click();
  await expect(emailButton).toBeEnabled();
  await expect(emailButton).toContainText("1");

  await emailButton.click();
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/emails`));
  await expect(page.getByRole("heading", { name: "Email" })).toBeVisible();
  await page.goto(`/o/${orgId}`);

  // WIP 按时间排序：早的在前
  const wipLinks = page.getByRole("link").filter({ hasText: /WIP item/ });
  await expect(wipLinks).toHaveCount(2);
  await expect(wipLinks.first()).toContainText(titles[0] ?? "");
  await wipLinks.first().click();
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/events/`));
  await expect(page.getByRole("heading", { name: titles[0] ?? "", exact: true })).toBeVisible();
});

test("Overview staff 不再有日历快捷创建，parent 保留日历但无快捷创建", async ({ page }) => {
  const orgId = await createOrganization(page, `No quick create ${Date.now()}`);
  const { date } = currentSydneyMonthDateTime();
  // staff 视图：没有日期快捷创建、没有 toggle
  await page.goto(`/o/${orgId}`);
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Work in Progress" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Show events" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Show rehearsals" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: `Create on ${date}` })).toHaveCount(0);

  // parent 视角：有日历，但也没有快捷创建入口
  const parentEmail = uniqueEmail("e2e-parent-nocreate");
  const studentName = `NoCreate student ${Date.now()}`;
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), studentName);
  await fillField(page.locator("#contact-name"), "Parent Contact");
  await fillField(page.locator("#contact-email"), parentEmail);
  await pressButton(page, "Add student");
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();
  await pressButton(page, "Invite parent");
  await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible();
  await page.goto("/dev/outbox");
  const invite = page.locator('article[data-kind="invite"]', { hasText: parentEmail }).first();
  await expect(invite).toBeVisible();
  const body = await invite.locator("pre").innerText();
  const inviteLink = body.match(/http:\/\/[^\s]+\/invite\/[^\s]+/)?.[0] ?? "";
  expect(inviteLink).toContain("/invite/");
  await page.goto(inviteLink);
  await page.goto(`/o/${orgId}`);
  // parent 能看到月历（h2 为月份标题），但也没有快捷创建
  await expect(page.locator("h2").first()).toBeVisible();
  await expect(page.getByRole("button", { name: `Create on ${date}` })).toHaveCount(0);
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

test("Members 搜索、状态筛选和翻页写入 URL", async ({ page }) => {
  const orgId = await createOrganization(page, `Members ${Date.now()}`);
  const names = Array.from(
    { length: 11 },
    (_, index) => `Pagination Member ${String(index).padStart(2, "0")}`,
  );
  await importMembers(page, orgId, names);

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
  await page.getByRole("button", { name: "Go to next page" }).click();
  await expect(page).toHaveURL(/page=2/);
  await expect(page.getByText("Showing 11–11 of 11")).toBeVisible();
});

test("parent 仍看到有权限的活动卡片而不是 staff 管理表", async ({ page }) => {
  const orgId = await createOrganization(page, `Parent ${Date.now()}`);
  const studentName = `Parent student ${Date.now()}`;
  const parentEmail = uniqueEmail("e2e-parent");
  const eventTitle = `Parent event ${Date.now()}`;
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), studentName);
  await fillField(page.locator("#contact-name"), "Parent Contact");
  await fillField(page.locator("#contact-email"), parentEmail);
  await pressButton(page, "Add student");
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  await createDraftEvent(page, orgId, eventTitle);
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

  // parent 在 Overview 也没有快捷创建入口
  await page.goto(`/o/${orgId}`);
  await expect(page.getByRole("button", { name: /Create on \d{4}/ })).toHaveCount(0);
});

test("Groups 全流程：建组、成员分组、事件受众", async ({ page }) => {
  const orgId = await createOrganization(page, `Groups ${Date.now()}`);
  const groupName = `Flutes ${Date.now()}`;

  // 建组
  await page.goto(`/o/${orgId}/groups`);
  await expect(page.getByRole("heading", { name: "Groups" })).toBeVisible();
  await pressButton(page, "New group");
  await fillField(page.locator("#group-name"), groupName);
  await pressButton(page, "Create group");
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();

  // 成员表单选组并显示在表格
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), "Group Student");
  await fillField(page.locator("#contact-name"), "Group Contact");
  await fillField(page.locator("#contact-email"), uniqueEmail("e2e-group"));
  await chooseOption(page, page.getByRole("combobox", { name: "Assigned group" }), groupName);
  await pressButton(page, "Add student");
  await expect(page.getByText("Group Student", { exact: true })).toBeVisible();
  // 列表只读展示分组（编辑入口收敛到抽屉），行内不应再有换组下拉
  await expect(
    page.getByRole("row").filter({ has: page.getByText("Group Student") }),
  ).toContainText(groupName);
  await expect(page.getByRole("combobox", { name: "Group for Group Student" })).toHaveCount(0);

  // 事件受众选择指定分组
  await page.goto(`/o/${orgId}/events`);
  await pressButton(page, "New event");
  await fillField(page.locator("#event-title"), "Group event");
  await page.getByRole("checkbox", { name: "Whole organization" }).uncheck();
  await expect(page.getByRole("checkbox", { name: "Whole organization" })).not.toBeChecked();
  await page.getByRole("checkbox", { name: groupName, exact: true }).check();
  const startsAt = futureLocalDateTime();
  await fillField(page.locator("#event-starts-date"), startsAt.date);
  await fillField(page.locator("#event-starts-time"), startsAt.time);
  await pressButton(page, "Create draft");
  await expect(page.getByRole("link", { name: "Group event", exact: true })).toBeVisible();

  // 详情页显示受众组名
  await page.getByRole("link", { name: "Group event", exact: true }).click();
  await expect(page.getByText(`Audience: ${groupName}`)).toBeVisible();
});

test("Group 成员管理：添加无分组学生与移出", async ({ page }) => {
  const orgId = await createOrganization(page, `Group members ${Date.now()}`);
  const groupName = `Brass ${Date.now()}`;

  // 建组 + 两个无分组学生
  await page.goto(`/o/${orgId}/groups`);
  await pressButton(page, "New group");
  await fillField(page.locator("#group-name"), groupName);
  await pressButton(page, "Create group");
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();

  async function addStudent(name: string): Promise<void> {
    await page.goto(`/o/${orgId}/members`);
    await pressButton(page, "Add student");
    await fillField(page.locator("#student-name"), name);
    await fillField(page.locator("#contact-name"), `${name} Contact`);
    await fillField(page.locator("#contact-email"), uniqueEmail("e2e-group-member"));
    await pressButton(page, "Add student");
    await expect(page.getByText(name, { exact: true })).toBeVisible();
  }
  await addStudent("Member One");
  await addStudent("Loose Student");

  // 打开成员抽屉：成员区为空，无分组学生可选
  await page.goto(`/o/${orgId}/groups`);
  await pressButton(page, `Members of ${groupName}`);
  await expect(page.getByRole("heading", { name: groupName })).toBeVisible();
  await expect(page.getByText("Members (0)", { exact: true })).toBeVisible();
  await expect(page.getByText("No members yet.")).toBeVisible();

  // 添加 Member One
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Unassigned student" }),
    "Member One",
  );
  await pressButton(page, "Add");
  await expect(page.getByText("Members (1)", { exact: true })).toBeVisible();
  await expect(page.getByText("Member One", { exact: true })).toBeVisible();

  // 添加后列表移除该学生，只剩 Loose Student 可再选
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Unassigned student" }),
    "Loose Student",
  );
  await pressButton(page, "Add");
  await expect(page.getByText("Members (2)", { exact: true })).toBeVisible();

  // 移出 Member One 回到无分组
  await page.getByRole("button", { name: "Move Member One out" }).click();
  await expect(page.getByText("Members (1)", { exact: true })).toBeVisible();
  await expect(page.getByText("Member One", { exact: true })).not.toBeVisible();
  await expect(page.getByText("Loose Student", { exact: true })).toBeVisible();

  // 关抽屉后在 Members 页确认分组是只读展示且数据正确
  await pressButton(page, "Done");
  await page.goto(`/o/${orgId}/members`);
  await expect(
    page.getByRole("row").filter({ has: page.getByText("Loose Student") }),
  ).toContainText(groupName);
  await expect(
    page.getByRole("row").filter({ has: page.getByText("Member One") }),
  ).not.toContainText(groupName);
});

test("Member 状态与分组编辑收敛到编辑抽屉", async ({ page }) => {
  const orgId = await createOrganization(page, `Member edit ${Date.now()}`);
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), "Status Student");
  await fillField(page.locator("#contact-name"), "Status Contact");
  await fillField(page.locator("#contact-email"), uniqueEmail("e2e-status"));
  await pressButton(page, "Add student");
  await expect(page.getByText("Status Student", { exact: true })).toBeVisible();

  // 列表里没有行内状态/分组选择器，编辑只能从抽屉进
  await expect(page.getByRole("combobox", { name: /Status for/ })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: /Group for/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Edit Status Student" }).click();
  await expect(page.getByRole("heading", { name: "Edit student" })).toBeVisible();
  await chooseOption(page, page.getByRole("combobox", { name: "Status" }), "Withdrawn");
  await pressButton(page, "Save changes");
  await expect(page.getByRole("heading", { name: "Edit student" })).not.toBeVisible();
  await expect(
    page.getByRole("row").filter({ has: page.getByText("Status Student") }),
  ).toContainText("Withdrawn");
});

test("左下角 Feedback 入口提交到 feedback.meathill.com", async ({ page }) => {
  await createOrganization(page, `Feedback ${Date.now()}`);
  let submitted: { url: string; body: unknown } | null = null;
  await page.route("**/api/feedbacks", async (route) => {
    submitted = { url: route.request().url(), body: route.request().postDataJSON() };
    await route.fulfill({ status: 201, json: { success: true } });
  });

  // 用户菜单里有只读版本号与反馈入口
  if ((page.viewportSize()?.width ?? 0) < 768) {
    await openMobileSidebar(page);
  }
  await page.getByRole("button", { name: /@test\.local/ }).click();
  await expect(page.getByText("Version dev", { exact: true })).toBeVisible();
  await page.getByRole("menuitem", { name: "Send feedback" }).click();

  await expect(page.getByRole("heading", { name: "Send feedback" })).toBeVisible();
  await page.fill("#feedback-content", "Bug report");
  await page.getByRole("button", { name: "Send feedback" }).click();
  await expect(page.getByText("we've received your feedback")).toBeVisible();

  expect(submitted?.url).toBe("https://feedback.meathill.com/api/feedbacks");
  const body = submitted?.body as {
    appId?: string;
    content?: string;
    version?: string;
    contact?: string;
  };
  expect(body).toMatchObject({
    appId: "everband-app",
    content: "Bug report",
    version: "dev",
  });
  expect(body.contact).toMatch(/@test\.local/);
});

test("群发邮件：选组 → 写信页 → 收件人微调 → 发送入队 → 历史可见", async ({ page }) => {
  const orgId = await createOrganization(page, `Email ${Date.now()}`);
  const groupName = `Email Group ${Date.now()}`;
  const contactEmail = uniqueEmail("e2e-email");

  // 建组 + 一个带联系人的学生
  await page.goto(`/o/${orgId}/groups`);
  await pressButton(page, "New group");
  await fillField(page.locator("#group-name"), groupName);
  await pressButton(page, "Create group");
  await expect(page.getByText(groupName, { exact: true })).toBeVisible();

  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), "Email Student");
  await fillField(page.locator("#contact-name"), "Email Contact");
  await fillField(page.locator("#contact-email"), contactEmail);
  await pressButton(page, "Add student");
  await expect(page.getByText("Email Student", { exact: true })).toBeVisible();

  // 通过组成员抽屉把学生加进组
  await page.goto(`/o/${orgId}/groups`);
  await pressButton(page, `Members of ${groupName}`);
  await chooseOption(
    page,
    page.getByRole("combobox", { name: "Unassigned student" }),
    "Email Student",
  );
  await pressButton(page, "Add");
  await expect(page.getByText("Members (1)", { exact: true })).toBeVisible();
  await pressButton(page, "Done");

  // 勾选组 → Email 按钮 → 写信页
  const groupCheckbox = page.getByRole("checkbox", { name: `Select ${groupName}` });
  await waitForHydration(groupCheckbox);
  await groupCheckbox.click();
  await expect(groupCheckbox).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Email 1", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/emails`));

  // 写信页：来源、收件人列表与计数
  await expect(page.getByRole("heading", { name: "Email", exact: true })).toBeVisible();
  await expect(page.getByText(contactEmail, { exact: true })).toBeVisible();
  await expect(page.getByText("1 of 1 selected", { exact: true })).toBeVisible();

  // 取消勾选再勾回（收件人微调路径）
  const rowCheckbox = page.getByRole("checkbox", { name: /^Include / });
  await waitForHydration(rowCheckbox);
  await rowCheckbox.click();
  await expect(page.getByText("0 of 1 selected", { exact: true })).toBeVisible();
  await rowCheckbox.click();
  await expect(page.getByText("1 of 1 selected", { exact: true })).toBeVisible();

  // 填内容（等草稿自动保存，验证发送后草稿被清理）并发送（dev 模式落 outbox，入队即返回）
  await fillField(page.locator("#email-subject"), "Rehearsal reminder");
  await page.locator('[contenteditable="true"]').fill("Please RSVP by Friday.");
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send email", exact: true }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Send email", exact: true })
    .click();
  await expect(page.getByText(/Email queued for 1 recipient/)).toBeVisible();

  // 发送后回到邮件中心，发送历史可见（queued ≠ delivered 如实展示）
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/emails(\\?|$)`));
  await expect(page.getByText("Rehearsal reminder", { exact: true })).toBeVisible();
});

test("群发草稿：写信自动保存、列表可恢复、恢复后内容完整", async ({ page }) => {
  const orgId = await createOrganization(page, `Email draft ${Date.now()}`);

  // 新建邮件（无受众来源，纯草稿）
  await page.goto(`/o/${orgId}/emails`);
  await pressButton(page, "New email");
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/emails\\?compose=true`));

  // 写内容 → debounce 1s 自动保存
  await fillField(page.locator("#email-subject"), "Draft subject");
  await page.locator('[contenteditable="true"]').fill("Draft body content");
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();

  // 回列表：草稿卡片出现
  await pressButton(page, "All emails");
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/emails(\\?|$)`));
  await expect(page.getByText("Drafts", { exact: true })).toBeVisible();
  await expect(page.getByText("Draft subject", { exact: true })).toBeVisible();

  // 恢复草稿：内容回填
  await page.getByText("Draft subject", { exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/o/${orgId}/emails\\?draft=`));
  await expect(page.locator("#email-subject")).toHaveValue("Draft subject");
  await expect(page.locator('[contenteditable="true"]')).toContainText("Draft body content");
});

test("parent 在 Emails 页只看到发给自己的邮件，且没有写信入口", async ({ page }) => {
  const orgId = await createOrganization(page, `Parent email ${Date.now()}`);
  const studentName = `Email student ${Date.now()}`;
  const parentEmail = uniqueEmail("e2e-parent-email");
  const subject = `Parent message ${Date.now()}`;

  // 加学生（联系人即家长邮箱）
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), studentName);
  await fillField(page.locator("#contact-name"), "Parent Contact");
  await fillField(page.locator("#contact-email"), parentEmail);
  await pressButton(page, "Add student");
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();

  // staff 从 Members 选中该学生发一封邮件
  const rowCheckbox = page.getByRole("checkbox", { name: `Select ${studentName}` });
  await waitForHydration(rowCheckbox);
  await rowCheckbox.click();
  await page.getByRole("button", { name: "Email 1", exact: true }).click();
  await fillField(page.locator("#email-subject"), subject);
  await page.locator('[contenteditable="true"]').fill("Only you can see this.");
  await expect(page.getByText("Draft saved", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Send email", exact: true }).first().click();
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: "Send email", exact: true })
    .click();
  await expect(page.getByText(/Email queued for 1 recipient/)).toBeVisible();

  // 邀请家长并接受
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Invite parent");
  await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible();
  await page.goto("/dev/outbox");
  const invite = page.locator('article[data-kind="invite"]', { hasText: parentEmail }).first();
  await expect(invite).toBeVisible();
  const inviteLink =
    (await invite.locator("pre").innerText()).match(/http:\/\/[^\s]+\/invite\/[^\s]+/)?.[0] ?? "";
  expect(inviteLink).toContain("/invite/");
  await page.goto(inviteLink);

  // 家长视角：Emails 页只有发给自己的邮件，可展开看正文；无写信按钮
  await page.goto(`/o/${orgId}/emails`);
  await expect(page.getByText(subject, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "New email" })).not.toBeVisible();
  // 父列表用 ul>button 非标准结构，移动端热区易遮挡；用键盘激活兜底
  const rowBtn = page.getByRole("button", { name: new RegExp(subject) });
  await waitForHydration(rowBtn);
  await rowBtn.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Only you can see this.", { exact: true })).toBeVisible();
});

test("Overview 月份切换只刷新日历（parent 视图）：标题保持、月标签变化、Today 有标注", async ({
  page,
}) => {
  const orgId = await createOrganization(page, `Calendar nav ${Date.now()}`);
  // parent 视图保留月历，staff 已改为 Groups+WIP，此用例改为以 parent 身份验证月历
  const parentEmail = uniqueEmail("e2e-parent-cal");
  const studentName = `Cal student ${Date.now()}`;
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), studentName);
  await fillField(page.locator("#contact-name"), "Parent Contact");
  await fillField(page.locator("#contact-email"), parentEmail);
  await pressButton(page, "Add student");
  await expect(page.getByText(studentName, { exact: true })).toBeVisible();
  await pressButton(page, "Invite parent");
  await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible();
  await page.goto("/dev/outbox");
  const invite = page.locator('article[data-kind="invite"]', { hasText: parentEmail }).first();
  await expect(invite).toBeVisible();
  const body = await invite.locator("pre").innerText();
  const inviteLink = body.match(/http:\/\/[^\s]+\/invite\/[^\s]+/)?.[0] ?? "";
  expect(inviteLink).toContain("/invite/");
  await page.goto(inviteLink);
  await page.goto(`/o/${orgId}`);

  // 整页骨架会出现 h1 消失；局部刷新时 h1 全程可见
  const overviewHeading = page.getByRole("heading", { name: "Overview" });
  await expect(overviewHeading).toBeVisible();

  // Today 标注：组织时区（Sydney）的今天在日历格子里有 primary 圆点（先于切月断言）
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = `${parts.find((p) => p.type === "year")?.value}-${parts.find((p) => p.type === "month")?.value}-${parts.find((p) => p.type === "day")?.value}`;
  const todayDot = page.locator(`[data-date="${today}"] time`);
  await expect(todayDot).toHaveClass(/bg-primary/);

  const monthLabel = page.locator("h2");
  const before = await monthLabel.innerText();
  const nextButton = page.getByRole("button", { name: "Next month", exact: true });
  await waitForHydration(nextButton);
  await nextButton.click();

  await expect(overviewHeading).toBeVisible();
  await expect(monthLabel).not.toHaveText(before);
});
