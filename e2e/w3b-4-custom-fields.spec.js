import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Lane W3b-4: Custom fields on entities", () => {
  test("add a 'Phone ext.' text field to teachers, set it for one teacher, it shows in the Teachers list column, ⌘Z removes the value", async ({ page }) => {
    await loadDemoSchool(page);

    // 1. Open Teachers entity sheet
    await page.evaluate(() => {
      if (window.EntityTeachers) window.EntityTeachers.open();
    });
    const teachersDialog = page.locator(".chrx-ent-dialog");
    await expect(teachersDialog).toBeVisible();

    // 2. Open Custom Fields Manager from the Teachers sheet sidebar
    const customFieldsBtn = page.locator('.chrx-ent-aside button[data-act="customfields"]');
    await expect(customFieldsBtn).toBeVisible();
    await customFieldsBtn.click();

    const cfManager = page.locator(".chrx-custom-fields-mgr");
    await expect(cfManager).toBeVisible();

    // 3. Click "+ Add custom field"
    const addFieldBtn = cfManager.locator('button:has-text("+ Add custom field")');
    await addFieldBtn.click();

    // 4. Fill in the New custom field form
    const labelInput = page.locator('.chrx-ent-field input[placeholder*="Phone ext."]');
    await expect(labelInput).toBeVisible();
    await labelInput.fill("Phone ext.");

    // Submit form
    const createBtn = page.locator('.chrx-ent-form__foot button:has-text("Create Field")');
    await createBtn.click();

    // Verify it appears in the manager table
    await expect(cfManager.locator("td", { hasText: "Phone ext." })).toBeVisible();

    // 5. Close Custom Fields Manager
    const doneBtn = cfManager.locator('button:has-text("Done")');
    await doneBtn.click();
    await expect(cfManager).not.toBeVisible();

    // 6. Verify "Phone ext." column appears in the Teachers list
    const phoneExtHeader = teachersDialog.locator('.chrx-ent-th:has-text("Phone ext.")');
    await expect(phoneExtHeader).toBeVisible();

    // Find the column index of "Phone ext."
    const colIndex = await teachersDialog.locator(".chrx-ent-th").evaluateAll((ths) => {
      return ths.findIndex(th => th.textContent.includes("Phone ext."));
    });
    expect(colIndex).toBeGreaterThan(-1);

    // 7. Select the first teacher row and edit
    const firstRow = teachersDialog.locator(".chrx-ent-rows .chrx-ent-tr").first();
    await firstRow.click();

    const editBtn = page.locator('.chrx-ent-aside button[data-act="edit"]');
    await editBtn.click();

    const editSheet = page.locator(".chrx-ent-sheet");
    await expect(editSheet).toBeVisible();

    // Locate the Phone ext. input in the edit form
    const phoneInput = editSheet.locator('.chrx-ent-field:has-text("Phone ext.") input');
    await expect(phoneInput).toBeVisible();
    await phoneInput.fill("101");

    // Save teacher
    const saveBtn = editSheet.locator('.chrx-ent-form__foot button:has-text("Save")');
    await saveBtn.click();
    await expect(editSheet).not.toBeVisible();

    // 8. Verify the value "101" appears in the Teachers list column
    const getCell = () => page.locator(".chrx-ent-dialog .chrx-ent-rows .chrx-ent-tr").first().locator(".chrx-ent-td").nth(colIndex);
    await expect(getCell()).toHaveText("101");

    // 9. Press ⌘Z (or Ctrl+Z) to remove the value
    const isMac = process.platform === "darwin";
    await page.keyboard.press(isMac ? "Meta+z" : "Control+z");

    // 10. Verify value is removed from the table column
    await expect(getCell()).toHaveText("");

    // 11. Redo restores value
    await page.keyboard.press(isMac ? "Meta+Shift+z" : "Control+Shift+z");
    await expect(getCell()).toHaveText("101");

    // Clean up: Undo again so value is removed
    await page.keyboard.press(isMac ? "Meta+z" : "Control+z");
    await expect(getCell()).toHaveText("");

    // 11. Redo restores value
    await page.keyboard.press(isMac ? "Meta+Shift+z" : "Control+Shift+z");
    await expect(getCell()).toHaveText("101");

    // Clean up: Undo again so value is removed
    await page.keyboard.press(isMac ? "Meta+z" : "Control+z");
    await expect(getCell()).toHaveText("");
  });

  test("reachable from School settings and Files menu", async ({ page }) => {
    await loadDemoSchool(page);

    // 1. Open School settings and verify "Manage custom fields…" button
    await page.evaluate(() => {
      if (window.SchoolSettings) window.SchoolSettings.open();
    });
    const manageBtn = page.locator('button:has-text("Manage custom fields…")');
    await expect(manageBtn).toBeVisible();
    await manageBtn.click();

    await expect(page.locator(".chrx-custom-fields-mgr")).toBeVisible();
    await page.locator('.chrx-custom-fields-mgr button:has-text("Done")').click();
    await expect(page.locator(".chrx-custom-fields-mgr")).not.toBeVisible();

    // Close School settings
    await page.locator('.chrx-ent-form__foot button:has-text("Cancel")').click();

    // 2. Open via Files menu event
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("app:open-custom-fields"));
    });
    await expect(page.locator(".chrx-custom-fields-mgr")).toBeVisible();
    await page.locator('.chrx-custom-fields-mgr button:has-text("Done")').click();
    await expect(page.locator(".chrx-custom-fields-mgr")).not.toBeVisible();
  });
});
