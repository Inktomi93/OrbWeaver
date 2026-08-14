// CT: the REAL theme picker/library (D44 §12.1 · themes-design §4). Drives the production path — the
// `listThemes` (owned ∪ seeds) + `getUserSettings` (the active `selectedThemeId`) reads, stubbed via
// routeTrpc. Asserts the seed rows render, Hearth is active when no explicit selection (selectedThemeId
// null), and a seed row offers Customize while an owned row offers Edit/Delete.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { routeTrpc } from "../../../../support/ct/route-trpc.ts";
import { ThemePickerNarrowStory, ThemePickerStory } from "../_ct-stories.tsx";

const NOW = 0;
interface SeedView {
  readonly id: string;
  readonly name: string;
  readonly override: { readonly background: string; readonly accent: string };
  readonly css: null;
  readonly isSeed: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
function seed(id: string, name: string, bg: string, accent: string): SeedView {
  return {
    id,
    name,
    override: { background: bg, accent },
    css: null,
    isSeed: true,
    createdAt: NOW,
    updatedAt: NOW,
  };
}
const OWNED = {
  id: "theme_owned01",
  name: "My Theme",
  override: { background: "oklch(0.2 0.02 300)", accent: "oklch(0.7 0.1 300)" },
  css: null,
  isSeed: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const THEMES = [
  seed("theme_00000000000000000000000001", "Hearth", "oklch(0.158 0.006 60)", "oklch(0.72 0.175 52)"),
  seed("theme_00000000000000000000000002", "Mocha", "oklch(0.15 0.015 250)", "oklch(0.7 0.14 250)"),
  seed("theme_00000000000000000000000003", "Light", "oklch(0.98 0.004 75)", "oklch(0.55 0.16 50)"),
  OWNED,
];
const SETTINGS_VIEW = {
  userId: "user_ct_theme",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS, // theme.selectedThemeId defaults to null ⇒ Hearth is active
  updatedAt: 0,
};

async function stub(page: Page): Promise<void> {
  await routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
  });
}

test("renders the seed palettes + the owned theme", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);
  await expect(component.getByText("Hearth", { exact: true })).toBeVisible();
  await expect(component.getByText("Mocha", { exact: true })).toBeVisible();
  await expect(component.getByText("Light", { exact: true })).toBeVisible();
  await expect(component.getByText("My Theme", { exact: true })).toBeVisible();
});

test("Hearth is active when no theme is explicitly selected (selectedThemeId null)", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);
  await expect(component.getByLabel("Active theme")).toBeVisible();
});

test("a seed offers Customize; an owned theme offers Edit + Delete", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);
  // The Menu popup portals to the document body — query it via `page`, not the mounted component root.
  await component.getByRole("button", { name: "Hearth actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Customize" })).toBeVisible();
  await page.keyboard.press("Escape");

  await component.getByRole("button", { name: "My Theme actions" }).click();
  await expect(page.getByRole("menuitem", { name: "Edit" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
});

// ── The deferred mint (O-8): Customize opens the editor on a DRAFT; the row is minted by the first real
//    edit, never by the click. Before this, "pick a built-in → Customize → change nothing → Back" left a
//    copy behind forever — a row the owner never asked for and has to find and delete.

test("Customize + zero edits + Back mints NOTHING — no row ever existed", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "settings.duplicateTheme": () => OWNED,
  });
  const component = await mount(<ThemePickerStory />);

  await component.getByRole("button", { name: "Mocha actions" }).click();
  await page.getByRole("menuitem", { name: "Customize" }).click();
  await expect(component.getByRole("textbox", { name: "Theme name" })).toBeVisible();
  await component.getByRole("button", { name: "← Back to themes" }).click();
  // Barrier on the SETTLED list arm before the zero-count read.
  await expect(component.getByText("My Theme", { exact: true })).toBeVisible();

  // ONESHOT-OK: read after the list re-rendered; a mint could only have fired during the editor session
  // that has already been torn down.
  expect(trpc.count("settings.duplicateTheme")).toBe(0);
  // ONESHOT-OK: same settled barrier — the create arm is asserted here too because either mint landing
  // would be the same defect (a row the owner never asked for).
  expect(trpc.count("settings.createTheme")).toBe(0);
});

test("the first real edit mints the copy — and the autosave that follows patches THAT row, not the seed", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "settings.duplicateTheme": () => OWNED,
    "settings.updateTheme": () => OWNED,
  });
  const component = await mount(<ThemePickerStory />);

  await component.getByRole("button", { name: "Mocha actions" }).click();
  await page.getByRole("menuitem", { name: "Customize" }).click();
  await component.getByRole("textbox", { name: "Theme name" }).fill("Mocha but mine");

  await expect.poll(() => trpc.lastInput("settings.duplicateTheme"), { intervals: [20, 50, 100] }).toEqual({ id: "theme_00000000000000000000000002" });

  // No Save button any more (#10 autosave conversion) — the debounced driver fires updateTheme on its own.
  await expect
    .poll(() => trpc.lastInput("settings.updateTheme"), { intervals: [50, 100, 200] })
    .toMatchObject({ id: OWNED.id, input: { name: "Mocha but mine" } });
  // The mint happened exactly once across the whole session (the edit, not each keystroke or debounced save).
  // ONESHOT-OK: reads AFTER the awaited updateTheme poll settled — the autosave save is the write the
  // session made, so no further mint can arrive from this same edit.
  expect(trpc.count("settings.duplicateTheme")).toBe(1);
});

test("the editor autosaves — no Save button, and an edit fires updateTheme with no click at all (#10)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "settings.updateTheme": () => OWNED,
  });
  const component = await mount(<ThemePickerStory />);

  await component.getByRole("button", { name: "My Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Edit" }).click();
  const nameField = component.getByRole("textbox", { name: "Theme name" });
  await expect(nameField).toBeVisible();
  await expect(component.getByRole("button", { name: "Save theme" })).toHaveCount(0);

  await nameField.fill("My Theme, retouched");
  await expect
    .poll(() => trpc.lastInput("settings.updateTheme"), { intervals: [50, 100, 200] })
    .toMatchObject({ id: OWNED.id, input: { name: "My Theme, retouched" } });
});

test("New theme + zero edits + Back mints NOTHING (the same deferred mint, the create arm)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "settings.createTheme": () => OWNED,
  });
  const component = await mount(<ThemePickerStory />);

  await component.getByRole("button", { name: "New theme" }).click();
  await expect(component.getByRole("textbox", { name: "Theme name" })).toBeVisible();
  await component.getByRole("button", { name: "← Back to themes" }).click();
  await expect(component.getByText("My Theme", { exact: true })).toBeVisible();

  // ONESHOT-OK: see the sibling test above.
  expect(trpc.count("settings.createTheme")).toBe(0);
});

test("Delete does not destroy immediately — it opens an AlertDialog confirm (F4)", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    "settings.removeTheme": () => ({}),
  });
  const component = await mount(<ThemePickerStory />);
  await component.getByRole("button", { name: "My Theme actions" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  // The destructive confirm — no mutation has fired yet (UI-Primitives §13.8 R4).
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText("Delete this theme?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  // The NEGATIVE half of the title's claim, pinned (assertion-quality audit 2026-07-24): the confirm
  // being open is not proof nothing fired — assert ZERO removeTheme calls until a real confirm.
  // ONESHOT-OK: reads AFTER the awaited alertdialog assertions settled the surface; a zero can only
  // false-pass if the mutation fires later, which the still-open confirm makes impossible.
  expect(trpc.count("settings.removeTheme")).toBe(0);
});

// MOBILE-THEME-SELECTOR — the wrap fence.
//
// THE REPRODUCTION IS LIVE, NOT HERE, and this comment is the honest record of why. Measured at a 320px
// viewport against the running stack (`pnpm snap / --viewport 320x800`, theme modal opened via `__orb`): the
// band above the list — the `Themes` label plus `Reset to Hearth` plus `New theme` — was one NON-WRAPPING row
// inside the dialog's inset, padded, `size="md"`-capped content box, and the primary was sheared to a ~10px
// orange sliver against that edge. The LIST rows fit at the same width, which is what rules out the dialog's
// max-width as the cause (so option 1, "use a wider dialog", would have moved the symptom, not fixed it).
//
// A CT CANNOT REPRODUCE THAT CLIP, and pretending otherwise would be worse than not testing it: the CT mount
// root is CONTENT-SIZED, so an over-wide row simply widens its own container and neither `boundingBox`
// containment nor `scrollWidth > clientWidth` ever fires. Both were written, run against the pre-fix source at
// 240px and 320px, and both PASSED — i.e. they would have shipped as tests that agree with the bug.
//
// So this asserts the RESOLVED property that actually decides the outcome — `flex-wrap` on the band — rather
// than a geometry consequence this host cannot produce. It fails the moment someone removes the wrap, which is
// the regression worth fencing; the live shot is the evidence that the wrap is what the pixels needed.
test("the theme band is a WRAPPING row — the resolved property the 320px clip turned on", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerStory />);

  const primary = component.getByRole("button", { name: "New theme" });
  await expect(primary).toBeVisible();
  await expect(component.getByRole("button", { name: "Reset to Hearth" })).toBeVisible();

  // The band = the nearest ancestor of the primary that also carries the "Themes" label.
  const wrap = await primary.evaluate((el: HTMLElement): string => {
    let band: HTMLElement | null = el.parentElement;
    while (band !== null && band.textContent?.includes("Themes") !== true) {
      band = band.parentElement;
    }
    return band === null ? "no-band" : getComputedStyle(band).flexWrap;
  });
  expect(wrap).toBe("wrap");
});

// ── The other half of the same clip (side-eye 2026-08-06 P1) ───────────────────────────────────────
// The comment above is now HALF true. Wrapping the outer band let the "Themes" label drop to its own line —
// and left the two buttons in an inner, NON-wrapping Row: ~269px of unbreakable content in a ~206px box, so
// the primary was still sheared against the dialog edge. The inner Row wraps too now, and `min-w-0` lets it
// shrink rather than push the overflow onto its parent.
//
// AND A CT *CAN* REPRODUCE IT — the earlier finding ("a CT cannot reproduce that clip") was a property of
// that story's CONTENT-SIZED mount, not of the harness. `ThemePickerNarrowStory` SETS the 206px box, so an
// over-wide row genuinely overflows and `boundingBox` containment fires. Verified red-first against the
// pre-fix source: this test failed, the `flex-wrap` test above passed.
test("at the 206px dialog body both band buttons stay inside it — the inner row wraps", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<ThemePickerNarrowStory />);

  // Page-scoped: the fixed-width box IS the mount root, and `component.getByTestId` searches DESCENDANTS.
  const body = page.getByTestId("theme-dialog-body");
  await expect(body).toBeVisible();
  const bodyBox = await body.boundingBox();
  expect(bodyBox).not.toBeNull();

  const reset = component.getByRole("button", { name: "Reset to Hearth" });
  const primary = component.getByRole("button", { name: "New theme" });
  await expect(reset).toBeVisible();
  await expect(primary).toBeVisible();
  const boxes = await Promise.all([reset.boundingBox(), primary.boundingBox()]);

  // Sub-pixel tolerance only — a sheared button overhangs by tens of px (measured 62.9px pre-fix), never
  // by rounding.
  for (const [index, box] of boxes.entries()) {
    const label = index === 0 ? "Reset to Hearth" : "New theme";
    expect(box, `${label} has no box`).not.toBeNull();
    expect(box === null || bodyBox === null ? -1 : bodyBox.x + bodyBox.width - (box.x + box.width), `${label} overhangs the dialog body`).toBeGreaterThan(-1);
    expect(box === null || bodyBox === null ? -1 : box.x - bodyBox.x, `${label} starts left of the dialog body`).toBeGreaterThan(-1);
  }
});
