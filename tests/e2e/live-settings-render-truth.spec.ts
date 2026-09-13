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
import { waitForAppReady } from "./support/chat-room.ts";
import { getAppearanceTheme, listThemes, updateSettingsSection } from "./support/trpc.ts";

const SETTINGS_SAVE = "/api/trpc/settings.updateUserSettingsSection";
const SEED_THEME_NAME = "Mocha"; // a seed theme → `html[data-theme="mocha"]` once APPLIED (see APPLIED_THEME)
const SEEDED_BG_OPTION = "Misty highlands"; // a REAL seeded background (list-seeded-backgrounds.ts catalog)
const SEEDED_BG_ID = "misty-highlands"; // that option's stored id (backgroundSeededId), for the server-truth poll

/** The render-truth attributes: `data-has-bg-image` lands on `.shell-grid` when a background resolves, and
 *  the APPLIED seed theme lands on the DOCUMENT ELEMENT — `use-appearance-root-effects.ts` sets
 *  `data-theme` on `document.documentElement`, nowhere else.
 *
 *  IT IS `html`, NOT "the ThemeScope", AND THAT MATTERED (#2245). This file asserted a bare
 *  `[data-theme="mocha"]` and took `.first()`, which matched the Mocha CARD'S OWN PREVIEW BOX
 *  (`theme-mini-surface.tsx` stamps the seed's block on each swatch so it paints itself) — an element that
 *  is in the DOM whatever theme is applied. The spec is NAMED for render truth and that one assertion never
 *  measured any: it passed while no theme had been applied at all. Anchor on `html`. */
const SHELL_GRID = ".shell-grid";
const APPLIED_THEME = 'html[data-theme="mocha"]';

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

    // ── 1. Change the THEME through the real Looks section (#866 S4 — the theme modal retired into the
    //       Appearance group; the rail "Settings" is a SECTION now; picking a card APPLIES, #297). ──
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance" }).click();
    // The shipped looks render as CARDS; picking one applies it (the `selectedThemeId` patch).
    // THE CARD IS A RADIO, NOT A BUTTON (#2245). The looks collection is a `RadioGroupPicker`
    // (appearance-looks-section.tsx) whose items carry the theme name; the only BUTTON carrying "Mocha" is
    // that card's own ⋯, accessible-named "Actions for Mocha". A substring role=button lookup therefore
    // resolved UNIQUELY — to the kebab — so this line opened a modal `ThemeRowMenu` instead of applying the
    // theme, and Base UI's `InternalBackdrop` (fixed, inset-0, cut out only over the 32px trigger) then ate
    // every later click in the pane, which is how the background gridcell below timed out for 17s.
    await page.getByRole("radio", { name: SEED_THEME_NAME, exact: true }).click();
    // The active theme applies globally — `use-appearance-root-effects.ts` stamps `data-theme` on the
    // DOCUMENT ELEMENT (server truth flows through the getUserSettings query invalidation the mutation
    // drives). Asserted on `html` only: see APPLIED_THEME.
    await expect(page.locator(APPLIED_THEME)).toHaveCount(1, { timeout: 10_000 });

    // ── 2. Change the BACKGROUND through the real appearance settings — the R-BG thumbnail grid (#866
    //       S4): one gridcell per plate, named by its label; the KIND derives from the tapped tile. ──
    const backgroundGrid = page.getByRole("grid", { name: "Background image" });
    await backgroundGrid.scrollIntoViewIfNeeded();
    await expect(backgroundGrid).toBeVisible({ timeout: 10_000 });
    await backgroundGrid.getByRole("gridcell", { name: SEEDED_BG_OPTION }).click();

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

    // Leave Settings for Home — let any debounced autosave settle with the pane unmounted.
    await page.getByRole("button", { name: "Home", exact: true }).click();

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
    // Still the Mocha theme, still the background — rendered from server truth, no manual clear. This is the
    // assertion the whole spec exists for, so it reads the APPLIED carrier (`html`) and not a card's swatch:
    // after a reload the settings pane is not even mounted, so the old bare `[data-theme]` lookup here was
    // load-bearing AND vacuous at different moments of the same run.
    await expect(page.locator(APPLIED_THEME)).toHaveCount(1, { timeout: 15_000 });
    await expect(page.locator(`${SHELL_GRID}[data-has-bg-image]`)).toHaveCount(1, { timeout: 15_000 });
    const bgAfterReload = await page.locator('[data-slot="theme-background-layer"]').evaluate((el: Element) => getComputedStyle(el).backgroundImage);
    expect(bgAfterReload).toContain("url(");

    // ── 5. The #11 save-circuit-breaker never tripped (no autosave "error" surfaced). The AutosaveStatus
    // affordance renders a Retry control only in the error state — its absence is the breaker-silent proof. ──
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.getByRole("button", { name: "Appearance" }).click();
    // The appearance autosave status shows the owner-ruled honest "Saved" readout when clean; a tripped
    // breaker would instead surface a Retry button. Assert the healthy status is present and no Retry.
    await expect(page.getByText("Saved", { exact: true }).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
  });
});
