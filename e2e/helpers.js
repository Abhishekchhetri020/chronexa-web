// Shared E2E helpers.

/** Load the bundled demo school and wait for the editor to render cards. */
export async function loadDemoSchool(page, { view = "focus" } = {}) {
  // The editor remembers its last view and opens on All classes by default.
  // Most specs were written for (and exercise) the Focus board, so they pin
  // it; pass { view: null } to see the real first-run default.
  if (view) await page.addInitScript((v) => { try { localStorage.setItem("chronexa.editor.viewMode", v); } catch (_) {} }, view);
  await page.goto("/");
  // The demo CTA is wired by a delegated listener in main.js — wait for the
  // module graph to finish executing before clicking.
  await page.waitForFunction(() => window.APP && window.SolverUI && window.Editor);
  await page.locator("#cta-landing-demo").click();
  // Demo load parses 946 cards then auto-opens the editor (step 6).
  await page.locator("#editor-root .chrx-vkarta").first().waitFor({ timeout: 30_000 });
}
