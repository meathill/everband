import { expect, type Locator, type Page, test } from "./fixtures.ts";
import {
  fillField,
  loginViaMagicLink,
  pressButton,
  uniqueEmail,
  waitForHydration,
} from "./helpers.ts";

async function chooseOption(page: Page, trigger: Locator, option: string): Promise<void> {
  await waitForHydration(trigger);
  await trigger.click();
  await page.getByRole("option", { name: option, exact: true }).click();
}

async function createOrganizationWithContact(page: Page): Promise<string> {
  await loginViaMagicLink(page, uniqueEmail("e2e-assets"));
  await page.goto("/new-org");
  await fillField(page.locator("#org-name"), `Equipment Test Band ${Date.now()}`);
  await pressButton(page, "Create organization");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  const orgId = new URL(page.url()).pathname.split("/")[2] ?? "";
  expect(orgId).toBeTruthy();

  await page.goto(`/o/${orgId}/settings`);
  await fillField(page.locator("#organization-contact-email"), "equipment-e2e@test.local");
  await pressButton(page, "Save organization");
  await expect(page.getByText("Organization settings saved", { exact: true })).toBeVisible();
  return orgId;
}

async function createStudent(page: Page, orgId: string, name: string): Promise<void> {
  await page.goto(`/o/${orgId}/members`);
  await pressButton(page, "Add student");
  await fillField(page.locator("#student-name"), name);
  await fillField(page.locator("#contact-name"), "Equipment Parent");
  await fillField(page.locator("#contact-email"), uniqueEmail("equipment-parent"));
  await pressButton(page, "Add student");
  await expect(page.getByText(name, { exact: true })).toBeVisible();
}

test("Staff 管理器材、下载二维码，公开卡脱敏并随退役恢复", async ({ page }) => {
  const orgId = await createOrganizationWithContact(page);
  const studentName = "Amy Williams";
  const assetName = `Alto saxophone ${Date.now()}`;
  await createStudent(page, orgId, studentName);

  await page.goto(`/o/${orgId}/assets`);
  await expect(page.getByRole("heading", { name: "Equipment" })).toBeVisible();
  await pressButton(page, "New equipment");
  await fillField(page.locator("#asset-name"), assetName);
  await fillField(page.locator("#asset-type"), "Instrument");
  await fillField(page.locator("#asset-serial"), "AS-014");
  await chooseOption(page, page.getByRole("combobox", { name: "Current holder" }), studentName);
  await fillField(page.locator("#asset-notes"), "Private repair note");
  await pressButton(page, "Add equipment");
  await expect(page.getByText("Equipment and QR code created", { exact: true })).toBeVisible();

  const row = page.getByRole("row").filter({ hasText: assetName });
  await expect(row).toContainText("Instrument");
  await expect(row).toContainText(studentName);
  await expect(row).toContainText("active");

  const downloadPromise = page.waitForEvent("download");
  await row.getByRole("button", { name: "Download QR as SVG" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^everband-ast_.*-qr\.svg$/);

  const publicHref = await row
    .getByRole("link", { name: "Open public equipment card" })
    .getAttribute("href");
  expect(publicHref).toMatch(/^\/a\/ast_/);
  await page.goto(publicHref ?? "");
  await expect(page.getByRole("heading", { name: assetName })).toBeVisible();
  await expect(page.getByText("Amy W.", { exact: true })).toBeVisible();
  await expect(page.getByText("equipment-e2e@test.local", { exact: true })).toBeVisible();
  await expect(page.getByText("Private repair note", { exact: true })).not.toBeVisible();

  await page.goto(`/o/${orgId}/assets`);
  const activeRow = page.getByRole("row").filter({ hasText: assetName });
  const editButton = activeRow.getByRole("button", { name: "Edit equipment" });
  await waitForHydration(editButton);
  await editButton.click();
  await fillField(page.locator("#asset-name"), `${assetName} updated`);
  await pressButton(page, "Save changes");
  await expect(page.getByText("Equipment updated", { exact: true })).toBeVisible();

  const updatedRow = page.getByRole("row").filter({ hasText: `${assetName} updated` });
  const retireTrigger = updatedRow.getByRole("button", { name: "Retire equipment" });
  await waitForHydration(retireTrigger);
  await retireTrigger.click();
  const retireConfirm = page.getByRole("button", { name: "Retire equipment", exact: true }).last();
  await waitForHydration(retireConfirm);
  await retireConfirm.click();
  await expect(page.getByText("Equipment retired", { exact: true })).toBeVisible();

  await page.goto(publicHref ?? "");
  await expect(
    page.getByRole("heading", { name: "This equipment label isn't active" }),
  ).toBeVisible();

  await page.goto(`/o/${orgId}/assets?status=retired`);
  const retiredRow = page.getByRole("row").filter({ hasText: `${assetName} updated` });
  const restoreTrigger = retiredRow.getByRole("button", { name: "Restore equipment" });
  await waitForHydration(restoreTrigger);
  await restoreTrigger.click();
  const restoreConfirm = page
    .getByRole("button", { name: "Restore equipment", exact: true })
    .last();
  await waitForHydration(restoreConfirm);
  await restoreConfirm.click();
  await expect(page.getByText("Equipment restored", { exact: true })).toBeVisible();

  await page.goto(publicHref ?? "");
  await expect(page.getByRole("heading", { name: `${assetName} updated` })).toBeVisible();
});
