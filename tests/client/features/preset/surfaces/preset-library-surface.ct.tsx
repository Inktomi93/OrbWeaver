// CT: the preset LIBRARY list — the owner's remediation path for the "(edited)" duplicates the copy-on-write
// flood minted (the editor-side fix is pinned in preset-editor-surface.ct.tsx's FORK-ONCE test; these rows are
// the ones already in his library). Deleting them is a per-row ⋯ → Delete → confirm, and the ACTIVE row's
// delete must additionally clear the active-for-generation pointer so no stale id survives.
//
// Also pins the F5 SCENT (visual-blech audit): every non-built-in row prints `edited <relative updatedAt>`
// (+ a kind when the kind says anything), which is the only thing that tells same-named forks apart.
//
// The built-in row is deliberately NOT deletable (it renders a "Built-in default" subtitle instead of the
// actions menu) — asserted here so a future refactor can't hand the user a delete that the server refuses.
// `preset.list`/`settings.getUserSettings` are stubbed at the NETWORK (routeTrpc); the menu + ConfirmDialog
// render in a PORTAL, so they are located on `page`, not the mounted component.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { FROZEN_AT_MS } from "../../../../support/clock";
import type { TrpcRecorder } from "../../../../support/ct/route-trpc";
import { routeTrpc } from "../../../../support/ct/route-trpc";
import { expectInstrumentTierLive } from "../../../../support/ct/tier-liveness";
import { PresetLibrarySurfaceStory } from "./_ct-stories";

const BUILT_IN = "preset_00000000000000000000000000";
const EDITED_ONE = "preset_ct_edited0001";
const EDITED_TWO = "preset_ct_edited0002";

const IMPORTED = "preset_ct_imported01";

const EDITED_ONE_NAME = "Default (edited)";
const EDITED_TWO_NAME = "Default (edited) 2";
const IMPORTED_NAME = "Imported RP";

// The F5 subtitle is a RELATIVE stamp read off the PAGE's wall clock, so the stamp test pins that clock
// (`page.clock.setFixedTime`) and derives the fixture dates from the SAME frozen instant — the shared
// `FROZEN_AT_MS`, never an ambient clock read (test-determinism gate).
const FROZEN_NOW = FROZEN_AT_MS;
const REVEAL_ON_HOVER = /group-hover:opacity-100/;
const REVEAL_ON_FOCUS = /group-focus-within:opacity-100/;
const MINUTE_MS = 60_000;
const EDITED_ONE_AT = FROZEN_NOW - 5 * MINUTE_MS;
const EDITED_TWO_AT = FROZEN_NOW - 40 * MINUTE_MS;
const LIST_ROW_ROOT = '[data-slot="list-row-root"]';
const TITLE_ROW = '[data-slot="list-row-title-row"]';
const TITLE = '[data-slot="list-row-title"]';

// Action names carry the row's own edit stamp after the name (side-eye P3a): nine forks share the name
// "Default (edited)", so `Actions for Default (edited)` was nine identical accessible names. These matchers
// are SUBSTRINGS (Playwright's non-exact name match) — the stamp itself is clock-relative, so the pin is the
// disambiguated SHAPE, never the elapsed text. The closing quote is what keeps `…(edited)"` from also
// matching `…(edited) 2"`.
function menuFor(name: string): string {
  return `Actions for "${name}" ·`;
}
function duplicateFor(name: string): string {
  return `Duplicate "${name}" ·`;
}

function summary(fields: { id: string; name: string; isSystemDefault?: boolean; updatedAt?: number; kind?: string }): Record<string, unknown> {
  const isSystemDefault = fields.isSystemDefault ?? false;
  return {
    id: fields.id,
    name: fields.name,
    kind: fields.kind ?? (isSystemDefault ? "system" : "generation"),
    isSystemDefault,
    createdAt: 0,
    updatedAt: fields.updatedAt ?? 0,
  };
}

const PRESETS = [
  summary({ id: BUILT_IN, name: "Default", isSystemDefault: true }),
  summary({ id: EDITED_ONE, name: EDITED_ONE_NAME, updatedAt: EDITED_ONE_AT }),
  summary({ id: EDITED_TWO, name: EDITED_TWO_NAME, updatedAt: EDITED_TWO_AT }),
  summary({ id: IMPORTED, name: IMPORTED_NAME, updatedAt: EDITED_ONE_AT, kind: "roleplay" }),
];

interface RemoveCall {
  readonly id?: string;
}
interface SettingsPatchCall {
  readonly patch?: { readonly defaultPresetId?: string | null };
}

/** The library with `activeId` as the active-for-generation pick. */
function routeLibrary(page: Page, activeId: string | null): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({
      userId: "user_ct_preset",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
      updatedAt: 0,
    }),
    "preset.remove": () => ({}),
    "settings.updateUserSettingsSection": () => ({}),
  });
}

test("L4 the LIST band names the section, counts the presets, and carries the pane's create verbs", async ({ mount, page }) => {
  await routeLibrary(page, null);
  await mount(<PresetLibrarySurfaceStory />);

  const band = page.getByTestId("list-band");
  await expect(band.getByRole("heading", { level: 2 })).toHaveText("Presets");
  await expect(band.getByText(String(PRESETS.length), { exact: true })).toBeVisible();
  // A2 — ONE ember primary in the band; Import is its ghost companion, not a second CTA.
  await expect(band.getByRole("button", { name: "New", exact: true })).toBeVisible();
  await expect(band.getByRole("button", { name: "Import a SillyTavern preset", exact: true })).toBeVisible();
  // The in-pane title is retired, not doubled.
  await expect(page.getByRole("heading", { name: "Presets" })).toHaveCount(1);
});

test("the shared LIST layout's INSTRUMENT tier is LIVE, and the ACTIVE marker rides the title line", async ({ mount, page }) => {
  // `LibraryListLayout` is the ONE tier declaration behind both presets and world-info, so this covers both
  // panes' rows. side-eye P2-6: the marker moved out of the leading slot, which is what un-raggeds the
  // title column — asserted as x-alignment, the thing the eye actually complained about.
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.locator(TITLE).first()).toBeVisible();
  await expectInstrumentTierLive(component);

  await expect(component.locator(TITLE_ROW).getByText("Active", { exact: true })).toHaveCount(1);
  const lefts = await component.locator(TITLE).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
  expect(lefts).toHaveLength(PRESETS.length);
  expect(new Set(lefts).size, "every row's title starts at the same x — no leading status slot widens it").toBe(1);
});

test("an '(edited)' row deletes from its ⋯ menu — and the built-in row offers no delete at all", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);

  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();
  // The locked built-in carries no actions menu (its delete would be a server refusal).
  await expect(page.getByRole("button", { name: "Actions for" })).toHaveCount(PRESETS.length - 1);

  // §12.2: the kebab rests hidden + inert like every other row affordance, so reach it by hovering the row.
  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_TWO_NAME }).hover();
  await page.getByRole("button", { name: menuFor(EDITED_TWO_NAME) }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // THE PIN: the duplicate's OWN id reaches `preset.remove` (a row-indexed delete would send the wrong one).
  await expect.poll(() => (trpc.inputs("preset.remove") as RemoveCall[]).map((call) => call.id)).toEqual([EDITED_TWO]);
  // Nothing was active, so nothing clears the pointer.
  // ONESHOT-OK: settled — `onDelete` fires the (conditional) settings write and `preset.remove` in the SAME
  // click handler, and the batch link sends that tick's mutations in ONE request; the recorded remove above
  // therefore proves the request landed, so a settings write, had it happened, is already recorded too.
  expect(trpc.count("settings.updateUserSettingsSection")).toBe(0);
});

test("every non-built-in row carries its own edit stamp — the F5 scent that tells the '(edited)' twins apart", async ({ mount, page }) => {
  await page.clock.setFixedTime(FROZEN_NOW);
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);

  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();
  // The two forks differ ONLY by their stamp — 5 min vs 40 min ago. Both are printed, and they differ.
  await expect(component.getByText("edited 5m ago", { exact: true })).toBeVisible();
  await expect(component.getByText("edited 40m ago", { exact: true })).toBeVisible();
  // A kind that says something leads the subtitle; the ordinary `generation`/`system` kinds never print.
  await expect(component.getByText("roleplay · edited 5m ago", { exact: true })).toBeVisible();
  // …and the ordinary `generation`/`system` kinds never lead one (the EXACT stamps above already prove the
  // fork rows carry no prefix; "generation" itself is not assertable-absent — the Active-for-generation
  // label owns that word).
  await expect(component.getByText("generation · edited 5m ago", { exact: true })).toHaveCount(0);
  // The built-in keeps its own marker instead of a stamp (its updatedAt is the seed's, not the user's edit).
  // (located by ROLE + description — the Active-for-generation Select prints the same words.)
  await expect(component.getByRole("button", { name: "Default", exact: true, description: "Built-in default" })).toBeVisible();
});

test("deleting the ACTIVE '(edited)' row also clears the active-for-generation pointer", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);

  await expect(component.getByText("Active", { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => (trpc.inputs("preset.remove") as RemoveCall[]).map((call) => call.id)).toEqual([EDITED_ONE]);
  // The active pointer is nulled in the same gesture — a dangling id would silently fall back mid-generation.
  await expect.poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).at(-1)?.patch?.defaultPresetId).toBeNull();
});

// ── §12 row-action grammar (list-pane-projection) ────────────────────────────────────────────────
// Presets carry no boolean row state, so the row's ONE inline affordance is the measured frequent VERB:
// Duplicate (the fork workflow — the "(edited)" twins above are its receipt). It rests hidden and reveals
// with the row, and the kebab keeps its own Duplicate item (N3 mirror parity).

interface CreateCall {
  readonly name?: string;
}

test("§12 the row's frequent verb is INLINE: a revealed Duplicate fires preset.create for THAT row", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({
      userId: "user_ct_preset",
      schemaVersion: 1,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: 0,
    }),
    "preset.get": () => ({ id: EDITED_ONE, name: EDITED_ONE_NAME, kind: "generation", isSystemDefault: false, config: {}, createdAt: 0, updatedAt: 0 }),
    "preset.create": () => ({
      id: "preset_ct_copy00001",
      name: `Copy of ${EDITED_ONE_NAME}`,
      kind: "generation",
      isSystemDefault: false,
      createdAt: 0,
      updatedAt: 0,
    }),
  });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const row = component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first();
  const duplicate = component.getByRole("button", { name: duplicateFor(EDITED_ONE_NAME) });
  // Rest posture: hidden until the row is hovered/focused (it is a shortcut, not permanent chrome) — and
  // while hidden it is inert to the pointer, so it can't eat a click aimed at the text it floats over (P3b).
  await expect(duplicate).toHaveCSS("opacity", "0");
  await expect(duplicate).toHaveCSS("pointer-events", "none");
  await expect(duplicate).toHaveClass(REVEAL_ON_HOVER);
  await expect(duplicate).toHaveClass(REVEAL_ON_FOCUS);

  // Assert the MUTATION fired with this row's name, not a repaint.
  await row.hover();
  await duplicate.click();
  await expect.poll(() => (trpc.inputs("preset.create") as CreateCall[]).map((call) => call.name)).toEqual([`Copy of ${EDITED_ONE_NAME}`]);
});

test("§12 the kebab KEEPS its Duplicate item beside the inline verb (N3 mirror parity)", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
});

// §12.2 + side-eye P2d: the kebab is the row grammar's third slot — it rests HIDDEN like the inline verb
// beside it (a permanently-visible ⋯ on every row is the noise the grammar exists to remove) and it sits in
// the same `size-control-md` box every other row icon control does (it was a 40×32 `sm` button).
test("§12.2 the kebab rests hidden and IS the control-md box (the row grammar's own geometry)", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const kebab = page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) });
  await expect(kebab).toHaveCSS("opacity", "0");
  await expect(kebab).toHaveClass(REVEAL_ON_HOVER);

  // Derived from the element's OWN resolved token, so it holds under either pointer arm (D62 P1).
  const expected = await kebab.evaluate((el) => Number.parseFloat(getComputedStyle(el).getPropertyValue("--spacing-control-md")) * 16);
  const box = await kebab.boundingBox();
  expect(box?.width).toBe(expected);
  expect(box?.height).toBe(expected);
});

// P3a: the copy-on-write flood mints forks that share ONE name exactly, so the action labels carry the
// stamp the row already shows — two rows that read the same on screen must not be two identical names in
// the accessibility tree (a SR/agent walk of the list could not tell which "Duplicate" it was on).
test("P3a two forks with the SAME name expose distinct action names (the stamp disambiguates)", async ({ mount, page }) => {
  // The stamp must be the RELATIVE form for the two rows to differ (past the 7-day horizon both collapse to
  // the same date), so this test pins the page clock exactly like the F5 stamp test above.
  await page.clock.setFixedTime(FROZEN_NOW);
  await routeTrpc(page, {
    "preset.list": () => [
      summary({ id: EDITED_ONE, name: EDITED_ONE_NAME, updatedAt: EDITED_ONE_AT }),
      summary({ id: EDITED_TWO, name: EDITED_ONE_NAME, updatedAt: EDITED_TWO_AT }),
    ],
    "settings.getUserSettings": () => ({ userId: "user_ct_preset", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
  });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true }).first()).toBeVisible();

  const names = await page.getByRole("button", { name: "Actions for" }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(names).toHaveLength(2);
  expect(new Set(names).size).toBe(2);
  // …and the disambiguator is the row's own stamp, not an index or an id.
  expect(names.every((name) => name.startsWith(`Actions for "${EDITED_ONE_NAME}" · `))).toBe(true);
});

test("§12 the built-in row stays action-free — no inline verb where there is no actions menu", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Duplicate Default", exact: true })).toHaveCount(0);
});
