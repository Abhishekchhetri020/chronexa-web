import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("W3-2 Named views manager", () => {
  test("save, list, apply, rename, delete views and persist on school with undo support", async ({ page }) => {
    await loadDemoSchool(page);

    // 1. Verify SavedViews is mounted on window and school has savedViews array
    const hasSavedViews = await page.evaluate(() => {
      return typeof window.SavedViews === "object" && typeof window.SavedViews.save === "function";
    });
    expect(hasSavedViews).toBe(true);

    // 2. Configure a specific view:
    // Perspective: Teacher, ViewMode: overview, ColorBy: teacher, Zoom: far
    await page.evaluate(() => {
      window.APP.editor.perspective = "teacher";
      window.APP.editor.viewMode = "overview";
      window.APP.editor.colorBy = "teacher";
      window.APP.editor.zoom = "far";
      if (window.EditorActivator) window.EditorActivator.activate();
    });
    await page.waitForTimeout(300);

    // Verify state before save
    const stateBefore = await page.evaluate(() => ({
      perspective: window.APP.editor.perspective,
      viewMode: window.APP.editor.viewMode,
      colorBy: window.APP.editor.colorBy,
      zoom: window.APP.editor.zoom,
      savedCount: (window.APP.school.savedViews || []).length,
    }));
    expect(stateBefore.perspective).toBe("teacher");
    expect(stateBefore.viewMode).toBe("overview");
    expect(stateBefore.colorBy).toBe("teacher");
    expect(stateBefore.zoom).toBe("far");

    // 3. Open Saved Views Manager via topbar button #editor-saved-views
    const viewsBtn = page.locator('#editor-saved-views');
    await expect(viewsBtn).toBeVisible();
    await viewsBtn.click();

    // Manager dialog appears
    const manager = page.locator('.chrx-saved-views-manager');
    await expect(manager).toBeVisible();

    // Save current view as "Staff Overview Far"
    await manager.locator('#chrx-sv-name-input').fill("Staff Overview Far");
    await manager.locator('#chrx-sv-save-btn').click();
    await page.waitForTimeout(300);

    // Verify persisted in APP.school.savedViews
    const savedList = await page.evaluate(() => window.APP.school.savedViews || []);
    expect(savedList.length).toBe(1);
    expect(savedList[0].name).toBe("Staff Overview Far");
    expect(savedList[0].perspective).toBe("teacher");
    expect(savedList[0].viewMode).toBe("overview");
    expect(savedList[0].colorBy).toBe("teacher");
    expect(savedList[0].zoom).toBe("far");

    // Close manager dialog
    await page.evaluate(() => {
      if (window.EntityDialog && window.EntityDialog.closeSheet) window.EntityDialog.closeSheet();
    });
    await page.waitForTimeout(200);

    // 4. Change view settings completely
    await page.evaluate(() => {
      window.APP.editor.perspective = "room";
      window.APP.editor.viewMode = "focus";
      window.APP.editor.colorBy = "room";
      window.APP.editor.zoom = "near";
      if (window.EditorActivator) window.EditorActivator.activate();
    });
    await page.waitForTimeout(300);

    const changedState = await page.evaluate(() => ({
      perspective: window.APP.editor.perspective,
      viewMode: window.APP.editor.viewMode,
      colorBy: window.APP.editor.colorBy,
      zoom: window.APP.editor.zoom,
    }));
    expect(changedState.perspective).toBe("room");
    expect(changedState.viewMode).toBe("focus");

    // 5. Re-open Saved Views Manager and apply "Staff Overview Far"
    await viewsBtn.click();
    await expect(manager).toBeVisible();
    const applyBtn = manager.locator('li:has-text("Staff Overview Far") button:has-text("Apply")');
    await expect(applyBtn).toBeVisible();
    await applyBtn.click();
    await page.waitForTimeout(300);

    // 6. Verify all 5 attributes were restored exactly
    const restoredState = await page.evaluate(() => ({
      perspective: window.APP.editor.perspective,
      viewMode: window.APP.editor.viewMode,
      colorBy: window.APP.editor.colorBy,
      zoom: window.APP.editor.zoom,
    }));
    expect(restoredState.perspective).toBe("teacher");
    expect(restoredState.viewMode).toBe("overview");
    expect(restoredState.colorBy).toBe("teacher");
    expect(restoredState.zoom).toBe("far");

    // 7. Open manager again to test second save, rename, delete
    await viewsBtn.click();
    await expect(manager).toBeVisible();
    await expect(manager.locator('text="Staff Overview Far"')).toBeVisible();

    // Save a second view from inside the manager dialog
    await manager.locator('#chrx-sv-name-input').fill("Second View");
    await manager.locator('#chrx-sv-save-btn').click();
    await page.waitForTimeout(200);

    // Verify both views are shown
    await expect(manager.locator('text="Second View"')).toBeVisible();
    const countAfterSecond = await page.evaluate(() => window.APP.school.savedViews.length);
    expect(countAfterSecond).toBe(2);

    // 8. Test rename in manager dialog
    page.once("dialog", async (dialog) => {
      await dialog.accept("Renamed First View");
    });
    const renameBtn = manager.locator('li:has-text("Staff Overview Far") button:has-text("Rename")');
    await renameBtn.click();
    await page.waitForTimeout(200);
    await expect(manager.locator('text="Renamed First View"')).toBeVisible();

    // 9. Test delete in manager dialog
    page.once("dialog", async (dialog) => {
      await dialog.accept(); // confirm delete
    });
    const deleteBtn = manager.locator('li:has-text("Second View") button:has-text("Delete")');
    await deleteBtn.click();
    await page.waitForTimeout(200);

    // Verify second view was deleted
    const countAfterDelete = await page.evaluate(() => window.APP.school.savedViews.length);
    expect(countAfterDelete).toBe(1);
    expect(await page.evaluate(() => window.APP.school.savedViews[0].name)).toBe("Renamed First View");

    // 10. Test undo reverts the deletion via APP.mutate
    await page.evaluate(() => {
      if (window.APP.history && window.APP.history.canUndo) {
        window.APP.undo();
      }
    });
    const countAfterUndo = await page.evaluate(() => window.APP.school.savedViews.length);
    expect(countAfterUndo).toBe(2);

    // 11. Test promptSave() method
    page.once("dialog", async (dialog) => {
      expect(dialog.message()).toContain("Name this view");
      await dialog.accept("Prompt Saved View");
    });
    await page.evaluate(() => window.SavedViews.promptSave());
    const countAfterPrompt = await page.evaluate(() => window.APP.school.savedViews.length);
    expect(countAfterPrompt).toBe(3);
  });
});
