// E2E RENDER-TRUTH (#16 — the no-clear-needed pin). The pre-revert bug: changing background/theme in
// settings oscillated (save→revert→save) AND saved changes stayed INVISIBLE until the user manually
// cleared localStorage + cache and reloaded. This spec is the regression guard for BOTH halves against the
// running stack:
//   1. IMMEDIATE — change the theme (theme picker) and the background (appearance) through the REAL UI;
//      the change is visible IMMEDIATELY (a DOM/attribute assertion — `[data-theme]` + `[data-has-bg-image]`
//      on the shell root — not just the request firing).
//   2. NO-CLEAR-NEEDED — after a PLAIN page.reload() with browser storage FULLY INTACT (never cleared —
//      that is the whole point), the change is STILL visible: server truth renders, no client-persisted
//      shadow shows the old value.
//   3. ZERO SELF-TRIGGERED SAVES — count updateUserSettingsSection POSTs; each user action fires exactly
//      one, and NO tail request self-triggers after settle (the oscillation would show as extra POSTs).
//   4. BREAKER NEVER TRIPS — the #11 save-circuit-breaker (which would surface an autosave "error" state)
//      stays silent; an oscillation would trip it.
//
// Model-free (settings hit no model), so NOT `@live` — it runs in the routine suite. Storage is NEVER
// cleared; the finally block restores appearance + theme to defaults via the API (no storage touch).

import { expect, test } from "@playwright/test";
import { waitForAppReady } from "./support/chat-room";
import { getAppearanceTheme, listThemes, updateSettingsSection } from "./support/trpc";

const SETTINGS_SAVE = "/api/trpc/settings.updateUserSettingsSection";
const SEED_THEME_NAME = "Mocha"; // a seed theme → paints a `[data-theme="mocha"]` block (app-shell.tsx)
const SEEDED_BG_LABEL = "Seeded image"; // the SelectField that appears once kind = "seeded"
const SEEDED_BG_OPTION = "Misty highlands"; // a REAL seeded background (list-seeded-backgrounds.ts catalog)
const SEEDED_BG_ID = "misty-highlands"; // that option's stored id (backgroundSeededId), for the server-truth poll

/** The shell root carries the render-truth attributes: `data-theme` (seed theme name, lowercased) is on the
 *  ThemeScope, and `data-has-bg-image` lands on `.shell-grid` when a background resolves. */
const SHELL_GRID = ".shell-grid";

/** Count settings-save POSTs seen since the counter was installed — the oscillation tell. A network
 *  listener (not the trpc helper) so it observes the BROWSER's own client traffic, self-triggered included.
 *  The no-tail proof rides `waitForRequest`-rejects (below); this total pins the legitimate user save count. */
function installSaveCounter(page: import("@playwright/test").Page): () => number {
  let count = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().includes(SETTINGS_SAVE)) {
      count += 1;
    }
  });
  return (): number => count;
}

test.describe("settings render-truth (no-clear-needed) — #16", () => {
  test.afterEach(async () => {
    // Restore via the API only — NEVER touch browser storage (that would defeat the no-clear-needed pin
    // and pollute the next spec). Reset theme → Hearth default and appearance → no background/flat.
    await updateSettingsSection("theme", { selectedThemeId: null });
    await updateSettingsSection("appearance", { backgroundImageKind: "none", backgroundSeededId: "", elevation: "flat" });
  });

  test("theme + background change through the UI are visible immediately AND survive a plain reload with storage intact", async ({ page }) => {
    test.setTimeout(90_000);

    // A stable pre-state: no theme, no background (the afterEach values). Set via API so the spec starts
    // from a known baseline regardless of prior runs — this is SETUP, not the thing under test.
    await updateSettingsSection("theme", { selectedThemeId: null });
    await updateSettingsSection("appearance", { backgroundImageKind: "none", backgroundSeededId: "" });

    await page.goto("/");
    await waitForAppReady(page);

    const shell = page.locator(SHELL_GRID);
    await expect(shell).toBeVisible({ timeout: 15_000 });
    // Baseline: no seed theme applied, no background image.
    await expect(page.locator(`${SHELL_GRID}[data-has-bg-image]`)).toHaveCount(0);

    const savesTotal = installSaveCounter(page);

    // ── 1. Change the THEME through the real theme picker. ──
    await page.getByRole("button", { name: "Switch theme" }).click();
    const themeDialog = page.getByRole("dialog", { name: "Theme" });
    await expect(themeDialog).toBeVisible({ timeout: 10_000 });
    // Each theme is a clickable ListRow whose title is the theme name — click "Mocha" (a seed).
    await themeDialog.getByText(SEED_THEME_NAME, { exact: true }).click();
    // The active theme applies globally — the shell paints a `[data-theme="mocha"]` scope IMMEDIATELY
    // (server truth flows through the getUserSettings query invalidation the mutation drives).
    await expect(page.locator('[data-theme="mocha"]').first()).toBeVisible({ timeout: 10_000 });
    // Close the theme modal (Escape — Base UI dialog owns it).
    await page.keyboard.press("Escape");
    await expect(themeDialog).toHaveCount(0, { timeout: 10_000 });

    // ── 2. Change the BACKGROUND through the real appearance settings. ──
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const settingsDialog = page.getByRole("dialog", { name: "Settings" });
    await expect(settingsDialog).toBeVisible({ timeout: 10_000 });
    // Navigate to Appearance (the settings nav lists categories by label).
    await settingsDialog.getByRole("button", { name: "Appearance" }).click();

    // Set the background image kind to "Seeded", then pick a seeded image. The `Image` SelectField's
    // trigger carries its label as accessible name; options are `role="option"` inside a `role="listbox"`
    // popup. The sanctioned Base UI select idiom (ui select CT): click trigger → WAIT for the listbox to be
    // visible (the popup's open animation settles) → click the option BY NAME. Clicking the option before
    // the listbox settles races the open animation ("not stable → not visible"); identity-by-name beats a
    // positional `.first()` (house rule).
    await settingsDialog.getByRole("combobox", { name: "Image" }).click();
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("option", { name: "Seeded" }).click();
    await expect(page.getByRole("listbox")).toBeHidden({ timeout: 10_000 });
    // The seeded-image picker appears once kind = seeded.
    const seededTrigger = settingsDialog.getByRole("combobox", { name: SEEDED_BG_LABEL });
    await expect(seededTrigger).toBeVisible({ timeout: 10_000 });
    await seededTrigger.click();
    await expect(page.getByRole("listbox")).toBeVisible({ timeout: 10_000 });
    // Pick a REAL seeded background by name (the static catalog's first entry, list-seeded-backgrounds.ts).
    await page.getByRole("option", { name: SEEDED_BG_OPTION }).click();
    await expect(page.getByRole("listbox")).toBeHidden({ timeout: 10_000 });

    // The appearance autosave debounces (500ms) then commits; the shell repaints when the settingsChanged
    // bus event refetches getUserSettings. First confirm the save actually reached the SERVER (the seeded id
    // landed) — this ties the DOM assertion below to real server truth having committed, and absorbs the
    // debounce+save+bus-refetch latency deterministically (no fixed sleep, no race on a bare 10s DOM wait).
    await expect.poll(async () => (await getAppearanceTheme()).config.appearance.backgroundSeededId, { timeout: 15_000 }).toBe(SEEDED_BG_ID);

    // The shell root gains `data-has-bg-image` once that server truth flows back through the query — the
    // render-truth claim (server state → DOM), asserted against the DOM, not just the request firing.
    await expect(page.locator(`${SHELL_GRID}[data-has-bg-image]`)).toHaveCount(1, { timeout: 10_000 });

    // The background is painted by the fixed root layer — assert it actually renders (computed style),
    // not just the attribute. `ThemeBackgroundLayer` paints the resolved url as a real element.
    const bgLayer = page.locator('[data-slot="theme-background-layer"]');
    await expect(bgLayer).toBeVisible({ timeout: 10_000 });
    const bgImage = await bgLayer.evaluate((el: Element) => getComputedStyle(el).backgroundImage);
    expect(bgImage).not.toBe("none");
    expect(bgImage).toContain("url(");

    // Close settings — let any debounced autosave settle.
    await page.keyboard.press("Escape");
    await expect(settingsDialog).toHaveCount(0, { timeout: 10_000 });

    // ── 3. The saves are the user's exactly — no self-triggered tail. Two user actions (theme select +
    // the background patch) each fire ONE save. The appearance field edits (kind + seeded id) both ride
    // the ONE autosave form so they debounce into a single POST. Prove the traffic STOPPED: wait for the
    // NEXT settings-save POST — it must NOT arrive within a full breaker/debounce window (the oscillation
    // would keep POSTing). `waitForRequest` REJECTS on timeout; a reject is the pass (no self-triggered tail).
    const tailSave = await page
      .waitForRequest((req) => req.method() === "POST" && req.url().includes(SETTINGS_SAVE), { timeout: 3000 })
      .then(() => "self-triggered-save-fired")
      .catch(() => "no-tail-save");
    expect(tailSave).toBe("no-tail-save"); // no oscillation POST after settle

    const afterSettle = savesTotal();
    expect(afterSettle).toBeGreaterThan(0); // the real user saves DID fire
    expect(afterSettle).toBeLessThanOrEqual(3); // theme + ≤2 appearance debounced POSTs — never a runaway

    // The DB now holds the change (server truth) — read it straight from the API.
    const stored = await getAppearanceTheme();
    expect(stored.config.appearance.backgroundImageKind).toBe("seeded");
    const themes = await listThemes();
    const mocha = themes.find((t) => t.isSeed && t.name === SEED_THEME_NAME);
    expect(mocha).toBeDefined();
    expect(stored.config.theme.selectedThemeId).toBe(mocha?.id);

    // ── 4. THE NO-CLEAR-NEEDED PIN: a PLAIN reload with storage FULLY INTACT. If any client-persisted
    // layer shadowed server truth, the change would vanish here (the original bug). It must NOT. ──
    await page.reload();
    await waitForAppReady(page);
    // Still the Mocha theme, still the background — rendered from server truth, no manual clear.
    await expect(page.locator('[data-theme="mocha"]').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.locator(`${SHELL_GRID}[data-has-bg-image]`)).toHaveCount(1, { timeout: 15_000 });
    const bgAfterReload = await page.locator('[data-slot="theme-background-layer"]').evaluate((el: Element) => getComputedStyle(el).backgroundImage);
    expect(bgAfterReload).toContain("url(");

    // ── 5. The #11 save-circuit-breaker never tripped (no autosave "error" surfaced). The AutosaveStatus
    // affordance renders a Retry control only in the error state — its absence is the breaker-silent proof. ──
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    const reSettings = page.getByRole("dialog", { name: "Settings" });
    await expect(reSettings).toBeVisible({ timeout: 10_000 });
    await reSettings.getByRole("button", { name: "Appearance" }).click();
    // The appearance autosave status shows "Synced across your devices." caption when clean; a tripped
    // breaker would instead surface a Retry button. Assert the healthy caption is present and no Retry.
    await expect(reSettings.getByText("Synced across your devices.")).toBeVisible({ timeout: 10_000 });
    await expect(reSettings.getByRole("button", { name: "Retry" })).toHaveCount(0);
  });
});
