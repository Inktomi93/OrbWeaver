// CT: the preset LIBRARY list — the owner's remediation path for the "(edited)" duplicates the copy-on-write
// flood minted (the editor-side fix is pinned in preset-editor-surface.ct.tsx's FORK-ONCE test; these rows are
// the ones already in his library). Deleting them is a per-row ⋯ → Delete → confirm, and the ACTIVE row's
// delete must additionally clear the active-for-generation pointer so no stale id survives.
//
// Also pins the F5 SCENT (visual-blech audit): every non-built-in row prints `edited <relative updatedAt>`
// (+ a kind when the kind says anything, + `forked from <source>` when `forkedFrom` names a row the list
// actually holds), which is what tells same-named forks apart.
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
/** The activate toggle's accessible name — ONE label in both states (the press only ever activates). */
function activateFor(name: string): string {
  return `Activate ${name} for generation`;
}

function summary(fields: {
  id: string;
  name: string;
  isSystemDefault?: boolean;
  updatedAt?: number;
  kind?: string;
  forkedFrom?: string;
}): Record<string, unknown> {
  const isSystemDefault = fields.isSystemDefault ?? false;
  return {
    id: fields.id,
    name: fields.name,
    kind: fields.kind ?? (isSystemDefault ? "system" : "generation"),
    isSystemDefault,
    forkedFrom: fields.forkedFrom ?? null,
    createdAt: 0,
    updatedAt: fields.updatedAt ?? 0,
  };
}

// A PACKAGED template's id — a real `forkedFrom` value whose row is never in the list (packaged rows are
// clone sources, kept out of the readable list), so its lineage is UNRESOLVABLE and must print nothing.
const PACKAGED_SOURCE = "preset_000000000000000000000rpggm";

const PRESETS = [
  summary({ id: BUILT_IN, name: "Default", isSystemDefault: true }),
  summary({ id: EDITED_ONE, name: EDITED_ONE_NAME, updatedAt: EDITED_ONE_AT, forkedFrom: BUILT_IN }),
  summary({ id: EDITED_TWO, name: EDITED_TWO_NAME, updatedAt: EDITED_TWO_AT, forkedFrom: PACKAGED_SOURCE }),
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
  // ONE import door for both formats (§16 row 2) — the dialog sniffs the file, so the band names no format.
  await expect(band.getByRole("button", { name: "Import a preset", exact: true })).toBeVisible();
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
  // The two forks differ by their stamp — 5 min vs 40 min ago — and the first also carries its LINEAGE
  // (`forkedFrom` = the built-in, whose name the surface resolves from the list it already has).
  await expect(component.getByText("forked from Default · edited 5m ago", { exact: true })).toBeVisible();
  // The second's source is a PACKAGED template, absent from the list: the lineage is OMITTED, never guessed.
  await expect(component.getByText("edited 40m ago", { exact: true })).toBeVisible();
  // A kind that says something leads the subtitle; the ordinary `generation`/`system` kinds never print.
  await expect(component.getByText("roleplay · edited 5m ago", { exact: true })).toBeVisible();
  // …and the ordinary `generation`/`system` kinds never lead one (the EXACT stamps above already prove the
  // fork rows carry no prefix; "generation" itself is not assertable-absent — the Active-for-generation
  // label owns that word).
  await expect(component.getByText("generation · edited 5m ago", { exact: true })).toHaveCount(0);
  // The built-in keeps its own marker instead of a stamp (its updatedAt is the seed's, not the user's edit).
  // (located by exact ROLE name — the row BODY button, never the "Activate Default for generation" toggle
  // beside it. `description` is NOT asserted here: `exact` applies to it too, and with nothing else picked
  // the built-in row is the active one, so its markers append "Active" to the same accessible description.)
  await expect(component.getByRole("button", { name: "Default", exact: true })).toBeVisible();
  await expect(component.getByText("Built-in default", { exact: true })).toBeVisible();
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

test("§12 the built-in row carries the state toggle ONLY — no inline verb, no kebab", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Duplicate Default", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: menuFor("Default") })).toHaveCount(0);
  // …but activation is not CRUD: the un-renameable, un-deletable built-in is still a pick (D1).
  await expect(page.getByRole("radio", { name: activateFor("Default"), exact: true })).toHaveCount(1);
});

// ── §9 / D1: ACTIVATE is the row's state toggle, and the pane-level Select is DEAD ────────────────
// The toggle is RADIO-shaped (one-of-N): pressing an unpressed row activates it; pressing the PRESSED row is
// a no-op, because "no active preset" is not a state the funnel has — deactivation is activating another row.

test("§9/D1 the row toggle ACTIVATES that row through the one setDefault mutation", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const toggle = page.getByRole("radio", { name: activateFor(EDITED_ONE_NAME), exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "false");
  // It rides the row reveal like every other trailing control (the pressed STATE is the title-line marker).
  await expect(toggle).toHaveClass(REVEAL_ON_HOVER);
  await expect(toggle).toHaveClass(REVEAL_ON_FOCUS);

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await toggle.click();
  await expect
    .poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).map((call) => call.patch?.defaultPresetId))
    .toEqual([EDITED_ONE]);
});

test("§9/D1 the toggle NEVER bare-unpresses: pressing the ACTIVE row writes nothing", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const toggle = page.getByRole("radio", { name: activateFor(EDITED_ONE_NAME), exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true");

  const row = component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first();
  await row.hover();
  await toggle.click();
  // The click landed (the control is hit-testable while revealed) and produced NO write. Settled by the
  // subsequent activation below, which proves the same handler DOES write when the row is not the pick.
  await component.locator(LIST_ROW_ROOT, { hasText: IMPORTED_NAME }).first().hover();
  await page.getByRole("radio", { name: activateFor(IMPORTED_NAME), exact: true }).click();
  await expect
    .poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).map((call) => call.patch?.defaultPresetId))
    .toEqual([IMPORTED]);
});

test("§9/D1 the BUILT-IN row is the null pick — pressed when nothing is chosen, and it activates as null", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const builtIn = page.getByRole("radio", { name: activateFor("Default"), exact: true });
  await expect(builtIn).toHaveAttribute("aria-checked", "false");

  await component.locator(LIST_ROW_ROOT, { hasText: "Default" }).first().hover();
  await builtIn.click();
  // NULL, never the system row's sentinel id — "no explicit preset" is what the seed stores.
  await expect
    .poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).map((call) => call.patch?.defaultPresetId))
    .toEqual([null]);
});

test("§9/D1 with nothing chosen, the BUILT-IN row wears the pressed state", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await expect(page.getByRole("radio", { name: activateFor("Default"), exact: true })).toHaveAttribute("aria-checked", "true");
  // …and it is the ONLY pressed row (one-of-N).
  await expect(component.locator(TITLE_ROW).getByText("Active", { exact: true })).toHaveCount(1);
});

test("§12 enforcement: the pane-level 'Active for generation' Select is DELETED, not kept beside the toggle", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(component.getByText("Active for generation", { exact: true })).toHaveCount(0);
  // The name "Active preset for generation" survives — but as the ROWS' `role="radiogroup"` (side-eye
  // F-19), never as a pane-level control. Asserting the ROLE is what keeps this pin from passing for the
  // wrong reason if the Select ever came back under a renamed label.
  await expect(page.getByRole("radiogroup", { name: "Active preset for generation" })).toHaveCount(1);
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("§16 row 3 echo (a): the kebab Activate item fires the SAME mutation as the toggle", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_TWO_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_TWO_NAME) }).click();
  await page.getByRole("menuitem", { name: "Activate" }).click();
  await expect
    .poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).map((call) => call.patch?.defaultPresetId))
    .toEqual([EDITED_TWO]);
});

// ── G6: the single-preset EXPORT door (§16.1) ────────────────────────────────────────────────────
// The door is a THIN ARM over the bundle's serde: `buildPresetFile` from the cached `preset.get` row. The
// pin is the BYTES — an `orb.preset` envelope carrying the row's own config — because a second serde (or a
// hand-rolled envelope) is exactly the banned parallel path this arm exists to avoid.

test("G6 the kebab EXPORT downloads the bundle's own orb.preset bytes for that row", async ({ mount, page }) => {
  const config = { schemaVersion: 5, params: { temperature: 0.42 }, sections: [] };
  await routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({ userId: "user_ct_preset", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "preset.get": () => ({ id: EDITED_ONE, name: EDITED_ONE_NAME, kind: "generation", isSystemDefault: false, config, createdAt: 0, updatedAt: 0 }),
  });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("default-edited.json");
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk as Buffer));
  }
  const file: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  // The ENVELOPE is `buildPresetFile`'s (schemaKind + the export-time schemaVersion + name + config) — the
  // same shape `preset.importFile` strict-parses on the way back in.
  expect(file).toMatchObject({ schemaKind: "orb.preset", name: EDITED_ONE_NAME, config });
});

test("G6 the BUILT-IN row offers no Export — the bundle excludes the system default", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  // It has no kebab at all, so there is no menu the item could hide in.
  await expect(page.getByRole("button", { name: menuFor("Default") })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Export" })).toHaveCount(0);
});

test("§16 row 3 echo (a): the ACTIVE row's kebab offers no Activate — the menu carries no act it would refuse", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) }).click();
  // The menu IS open (its own Rename item is there) — the Activate absence is real, not an unopened popup.
  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Activate" })).toHaveCount(0);
});

// ── G6: the ONE band IMPORT door, two sniffed arms (§16.1 / §16 row 2) ───────────────────────────
// The band names no format; the dialog reads `schemaKind` and routes. The orb arm must reach
// `preset.importFile` (the thin door over the bundle's ImportPreset verb) with the file's OWN TEXT — a
// client-side re-parse into `preset.create` would be the parallel path the design bans — and it must state
// the MERGE semantic before the write, because the verb is idempotent on (ownerId, name).

const DROPZONE_INPUT = '[data-slot="file-dropzone-input"]';
const ORB_FILE = JSON.stringify({
  schemaKind: "orb.preset",
  schemaVersion: 5,
  name: "Imported RP",
  config: { schemaVersion: 5, params: { temperature: 0.7 }, sections: [] },
});
// A SillyTavern Chat Completion preset — no `schemaKind`, so the sniff falls to the ST arm.
const ST_FILE = JSON.stringify({ temperature: 0.9, prompts: [] });
// The OUTCOME semantic, stated ONCE at the dialog level (side-eye F-10): it used to be a per-arm sentence
// that only appeared after a file was picked, while the dialog at rest said only "the format is detected".
const MERGE_COPY = /An orbweaver export REPLACES the settings of a preset with the same name/;
const ST_SUMMARY = /SillyTavern preset —/;
const SERVER_PARSE_ERROR = /isn't a valid prompt config/;

interface ImportFileCall {
  readonly fileText?: string;
}

/** The library plus an import stub — `outcome` is what `preset.importFile` answers. */
function routeImportLibrary(page: Page, outcome: unknown): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({ userId: "user_ct_preset", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0 }),
    "preset.importFile": () => outcome,
    "preset.create": () => ({ id: IMPORTED, name: IMPORTED_NAME, kind: "roleplay", isSystemDefault: false, createdAt: 0, updatedAt: 0 }),
  });
}

test("G6 an orb.preset file rides the ONE import verb with its own bytes, after the dialog states the merge", async ({ mount, page }) => {
  const trpc = await routeImportLibrary(page, { ok: true, created: true });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import a preset", exact: true }).click();

  // THE OUTCOME IS STATED AT REST (side-eye F-10) — before a file is even picked, which is the state the
  // review saw and the state in which the dialog previously said only "the format is detected".
  await expect(page.getByText(MERGE_COPY)).toBeVisible();

  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "imported-rp.json", mimeType: "application/json", buffer: Buffer.from(ORB_FILE) });

  // The summary adds the one fact the dialog-level rule cannot: WHICH name this file collides on.
  await expect(page.getByText('orbweaver preset export — "Imported RP". That name is the merge key.')).toBeVisible();

  await page.getByRole("button", { name: "Import preset", exact: true }).click();
  // The FILE'S OWN TEXT reaches the door — not a client-side reserialization, and never `preset.create`.
  await expect.poll(() => (trpc.inputs("preset.importFile") as ImportFileCall[]).map((call) => call.fileText)).toEqual([ORB_FILE]);
  // ONESHOT-OK: settled — ONE confirm handler picks exactly one arm, so the recorded `importFile` above
  // proves the click's request already landed; a `create` from the same click would be recorded by now.
  expect(trpc.count("preset.create")).toBe(0);
});

test("G6 the SAME door takes a SillyTavern preset — sniffed to the ST arm, created client-side", async ({ mount, page }) => {
  const trpc = await routeImportLibrary(page, { ok: true, created: true });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import a preset", exact: true }).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "st-preset.json", mimeType: "application/json", buffer: Buffer.from(ST_FILE) });

  await expect(page.getByText(ST_SUMMARY)).toBeVisible();
  await page.getByRole("button", { name: "Import preset", exact: true }).click();

  await expect.poll(() => trpc.count("preset.create")).toBe(1);
  // ONESHOT-OK: settled — same single-arm confirm handler; the recorded `create` proves the click landed.
  expect(trpc.count("preset.importFile")).toBe(0);
});

test("G6 a REJECTED orb file keeps the dialog open with the SERVER's reason", async ({ mount, page }) => {
  await routeImportLibrary(page, { ok: false, error: "The file's \"config\" isn't a valid prompt config: schema mismatch" });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import a preset", exact: true }).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "broken.json", mimeType: "application/json", buffer: Buffer.from(ORB_FILE) });
  await page.getByRole("button", { name: "Import preset", exact: true }).click();

  // The STRICT parse lives on the server, so its verdict is what the owner reads — no client re-derivation.
  await expect(page.getByText(SERVER_PARSE_ERROR)).toBeVisible();
  await expect(page.getByRole("button", { name: "Import preset", exact: true })).toBeVisible();
});
