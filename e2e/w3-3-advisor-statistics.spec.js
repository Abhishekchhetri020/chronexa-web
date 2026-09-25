import { test, expect } from "@playwright/test";
import { loadDemoSchool } from "./helpers.js";

test.describe("Lane W3-3: Model Advisor & Statistics with Gap Windows and Exhaustion Table", () => {
  test("Advisor displays model findings, expands offending lessons, and supports reversible ignore", async ({ page }) => {
    await loadDemoSchool(page);

    // Open Advisor
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:advisor")));
    const advPanel = page.locator(".chrx-adv-panel");
    await expect(advPanel).toBeVisible({ timeout: 10_000 });
    await expect(advPanel.locator("h2")).toContainText("Advisor");

    // Summary bar shows counts for model checks and suggestions
    const summary = advPanel.locator(".chrx-adv-summary");
    await expect(summary).toBeVisible();
    await expect(summary).toContainText(/model check issue/i);
    await expect(summary).toContainText(/suggestion/i);

    // Both sections (Model Checks and Suggestions) should be present
    const modelHeading = advPanel.locator("h3:has-text('Model Checks')");
    await expect(modelHeading).toBeVisible();
    const suggHeading = advPanel.locator("h3:has-text('Suggestions')");
    await expect(suggHeading).toBeVisible();

    // Verify 1-click action buttons appear in the Suggestions section (e.g. Run Improve)
    const improveBtn = advPanel.locator("button:has-text('Run Improve')").first();
    await expect(improveBtn).toBeVisible();

    // At least one card is visible
    const cards = advPanel.locator(".chrx-adv-card");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Find a card with "Show lessons"
    const showLessonsBtn = advPanel.locator(".chrx-adv-card button:has-text('Show lessons')").first();
    if (await showLessonsBtn.isVisible()) {
      await showLessonsBtn.click();
      const drawer = advPanel.locator(".chrx-adv-lesson-drawer").first();
      await expect(drawer).toBeVisible();
      await expect(drawer.locator("table")).toBeVisible();

      // Toggle off
      const hideLessonsBtn = advPanel.locator(".chrx-adv-card button:has-text('Hide lessons')").first();
      await hideLessonsBtn.click();
      await expect(drawer).toBeHidden();
    }

    // Test reversible Ignore on the first model check card
    const firstModelCard = advPanel.locator(".chrx-adv-card button:has-text('Ignore')").first();
    await firstModelCard.click();

    // Summary should indicate ignored count
    await expect(summary).toContainText(/ignored/i);

    // Toggle "Show ignored checks"
    const showIgnoredCheckbox = advPanel.locator(".chrx-adv-toggle-ignored input[type='checkbox']");
    await showIgnoredCheckbox.check();

    const ignoredCard = advPanel.locator(".chrx-adv-card.is-ignored").first();
    await expect(ignoredCard).toBeVisible();
    await expect(ignoredCard.locator(".chrx-adv-badge--ignored")).toContainText("Ignored");

    // Unignore it
    const unignoreBtn = ignoredCard.locator("button:has-text('Unignore')");
    await unignoreBtn.click();
    await expect(advPanel.locator(".chrx-adv-card.is-ignored")).toHaveCount(0);

    // Close Advisor
    await advPanel.locator(".chrx-adv-close").click();
    await expect(advPanel).toBeHidden();
  });

  test("Statistics displays sortable Exhaustion Table and Teacher gap windows", async ({ page }) => {
    await loadDemoSchool(page);

    // Open Statistics
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("app:statistics")));
    const statsPanel = page.locator(".chrx-stats-panel");
    await expect(statsPanel).toBeVisible({ timeout: 10_000 });
    await expect(statsPanel.locator("h2")).toContainText("Statistics");

    // Exhaustion Table header & table
    const exhaustionHeading = statsPanel.locator("h3:has-text('Exhaustion Table')");
    await expect(exhaustionHeading).toBeVisible();

    // Verify Exhaustion table has both Teacher and Class rows
    const exhaustionTable = statsPanel.locator("table").first();
    await expect(exhaustionTable).toBeVisible();
    await expect(exhaustionTable.locator(".chrx-stats-badge--teacher").first()).toBeVisible();
    await expect(exhaustionTable.locator(".chrx-stats-badge--class").first()).toBeVisible();

    // Test sorting by Used Periods column
    const usedHeader = exhaustionTable.locator("th:has-text('Used Periods')");
    await usedHeader.click();
    await expect(usedHeader).toContainText(/▼|▲/);

    // Teachers table with Windows (Wk) and Max Window/Day
    const teachersHeading = statsPanel.locator("h3:has-text('Load & Gap Windows')");
    await expect(teachersHeading).toBeVisible();
    const teachersTable = statsPanel.locator("table").nth(1);
    await expect(teachersTable.locator("th:has-text('Windows (Wk)')")).toBeVisible();
    await expect(teachersTable.locator("th:has-text('Max Window/Day')")).toBeVisible();

    // Close Statistics
    await statsPanel.locator(".chrx-stats-close").click();
    await expect(statsPanel).toBeHidden();
  });
});
