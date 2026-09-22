// CT: the preset LIBRARY list — the owner's remediation path for the "(edited)" duplicates the copy-on-write
// flood minted (the editor-side fix is pinned in preset-editor-surface.ct.tsx's FORK-ONCE test; these rows are
// the ones already in his library). Deleting them is a per-row ⋯ → Delete → confirm, and the ACTIVE row's
// delete must additionally clear the active-for-generation pointer so no stale id survives.
//
// Also pins the F5 SCENT (visual-blech audit): every non-built-in row prints `<kind> · [forked from
// <source> ·] edited <relative updatedAt>` (the lineage only when `forkedFrom` names a row the list actually
// holds), which is what tells same-named forks apart.
//
// …and the 2026-08-02 trailing-slot rebuild (owner ruling O-1 + crunch-list items 6/17/18/19): ONE reserved
// in-flow region holding a permanently-painted state DOT plus the reveal cluster, the built-in's lock moved
// inline-left of its name, and NO hover-variable layout anywhere on the row. The last one is the P0 hover
// loop's mechanism; a CT cannot observe the loop itself (synthetic pointers do not re-hit-test on layout
// shift — that verification is real-pointer-only), so what is pinned here is rest-vs-hover geometry.
//
// The built-in row is deliberately NOT deletable — asserted on its OPEN menu (2026-08-19: it carries a kebab
// now, holding the one act it CAN do, Duplicate), so a future refactor can't hand the user a delete that the
// server refuses. NO row offers Rename any more (#506): the verb single-homes in the editor header.
// `preset.list`/`settings.getUserSettings` are stubbed at the NETWORK (routeTrpc); the menu + ConfirmDialog
// render in a PORTAL, so they are located on `page`, not the mounted component.

import { duplicateActionName, rowActionsName } from "@orb/client/lib";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { expectInstrumentTierLive } from "../../../../support/browser/tier-liveness.ts";
import { resolveSpacingPxIn } from "../../../../support/browser/touch-floor.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import type { TrpcFixtureOutput, TrpcRecorder, TrpcWireOutput } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import {
  PresetLibraryAnnouncedStory,
  PresetLibraryDockedStory,
  PresetLibrarySurfaceShortStory,
  PresetLibrarySurfaceStory,
  PresetLibraryWelcomeFilteredStory,
  PresetLibraryWelcomeListModeStory,
  PresetLibraryWelcomeNarrowStory,
  PresetLibraryWelcomeWideStory,
} from "./_ct-stories.tsx";

const NONEMPTY_ID = /.+/u;

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
const LEADING = '[data-slot="list-row-leading"]';
const ACTIONS = '[data-slot="list-row-actions"]';
const TRANSPARENT = "rgba(0, 0, 0, 0)";

test("#378 interactive preset subtitles use the readable label step without losing their description", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibraryDockedStory />);
  const row = component.locator(LIST_ROW_ROOT, { hasText: "Built-in default" }).first();
  const subtitle = row.locator('[data-slot="list-row-subtitle"]');
  await expect(subtitle).toBeVisible();
  await expect.poll(() => subtitle.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(11);
  await expect(subtitle).toHaveCSS("white-space", "nowrap");
  await expect(subtitle).toHaveAttribute("id", NONEMPTY_ID);
  const subtitleId = await subtitle.getAttribute("id");
  await expect(row.locator('[data-slot="list-row-body"]')).toHaveAttribute("aria-describedby", subtitleId ?? "missing-subtitle-id");
});

async function focalHierarchyRatio(component: import("@playwright/test").Locator): Promise<number> {
  const title = component.locator('[data-slot="empty-state-title"]');
  const description = component.locator('[data-slot="empty-state-description"]');
  const titleSize = await title.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  const descriptionSize = await description.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize));
  await expect(title).toBeVisible();
  await expect(description).toBeVisible();
  return titleSize / descriptionSize;
}

test("#379 Presets teaching hierarchy has a focal title in the wide arm", async ({ mount }) => {
  expect(await focalHierarchyRatio(await mount(<PresetLibraryWelcomeWideStory />))).toBeGreaterThanOrEqual(1.5);
});

test("#379 Presets teaching hierarchy has a focal title in the narrow arm", async ({ mount }) => {
  expect(await focalHierarchyRatio(await mount(<PresetLibraryWelcomeNarrowStory />))).toBeGreaterThanOrEqual(1.5);
});

// #434 — THE FOOTNOTE IS CONDITIONALLY RENDERED, NOT CONDITIONALLY WORDED. The pane used to print "If the
// list isn't on screen, Show list panel in the top bar brings it back" unconditionally, so a 1280 desktop
// reader with the list docked 400px to the left was handed an "if" about a pane they were looking at (#99
// item 5 moved it to a trailing sentence; the honest version needed the shell's `listMode`, which
// `useSectionListMode` now publishes to features). Both arms, ONE mount — the finding is that the SAME pane
// must say different things. The driver is the shell's FOCUS flag (see the story's note): what this pane
// reads is the RESOLVED list mode, and focus is the one regime that resolves it synchronously and
// section-independently; the override path's own resolution is pinned in `shell-store.ct`.
const LIST_FOOTNOTE = /Show list panel in the top bar/u;
const TEACHING_SENTENCE = /Pick a preset to edit its sampling/u;

test("#434 the 'Show list panel' footnote renders only while the Presets LIST is off screen", async ({ mount }) => {
  const welcome = await mount(<PresetLibraryWelcomeListModeStory />);
  // The section's boot layout docks its LIST, so this is the reader who can already see it.
  await expect(welcome.getByText(TEACHING_SENTENCE)).toBeVisible();
  await expect(welcome.getByText(LIST_FOOTNOTE)).toHaveCount(0);

  await welcome.getByRole("button", { name: "take the list off screen" }).click();
  await expect(welcome.getByText(LIST_FOOTNOTE)).toBeVisible();
  // …and the instruction survives beside it: the footnote is an addition, never a replacement.
  await expect(welcome.getByText(TEACHING_SENTENCE)).toBeVisible();

  await welcome.getByRole("button", { name: "put the list back" }).click();
  await expect(welcome.getByText(LIST_FOOTNOTE)).toHaveCount(0);
});

// Action names carry the row's own edit stamp after the name (side-eye P3a): nine forks share the name
// "Default (edited)", so `Actions for Default (edited)` was nine identical accessible names. These matchers
// are SUBSTRINGS (Playwright's non-exact name match) — the stamp itself is clock-relative, so the pin is the
// disambiguated SHAPE, never the elapsed text. The closing quote is what keeps `…(edited)"` from also
// matching `…(edited) 2"`.
function menuFor(name: string): string {
  return rowActionsName(`"${name}" ·`);
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
}): TrpcWireOutput<"preset.list">[number] {
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

const PRESETS: TrpcFixtureOutput<"preset.list"> = [
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
      configUnreadable: null,
    }),
    "preset.remove": () => undefined,
    "settings.updateUserSettingsSection": () => ({
      userId: "user_ct_preset",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: activeId } },
      updatedAt: 1,
      configUnreadable: null,
    }),
  });
}

test("L4 the LIST band names the section, counts the presets, and carries the pane's create verbs", async ({ mount, page }) => {
  await routeLibrary(page, null);
  await mount(<PresetLibrarySurfaceStory />);

  const band = page.getByTestId("list-band");
  // toContainText, never toHaveText: the count travels INSIDE the heading (`ListPaneHeader` — it is the
  // heading's own child so the mobile shed can't orphan it), so the settled text is "Presets4". `toHaveText`
  // only held while `preset.list` was in flight and the count was still undefined — an in-flight state that
  // is catchable when this file runs alone and gone under parallel load. The count is asserted below.
  await expect(band.getByRole("heading", { level: 2 })).toContainText("Presets");
  await expect(band.getByText(String(PRESETS.length), { exact: true })).toBeVisible();
  // A2 — ONE ember primary in the band; Import is its ghost companion, not a second CTA.
  await expect(band.getByRole("button", { name: "New", exact: true })).toBeVisible();
  // ONE import door for both formats (§16 row 2) — the dialog sniffs the file, so the band names no format.
  const importDoor = band.getByRole("button", { name: "Import a preset", exact: true });
  await expect(importDoor).toBeVisible();
  // O-3: icon-only, so sighted users get the same string on hover that AT gets as the name.
  await expect(importDoor).toHaveAttribute("title", "Import a preset");
  // The in-pane title is retired, not doubled.
  await expect(page.getByRole("heading", { name: "Presets" })).toHaveCount(1);
});

// ── The SEARCH lens: one query, two readers (side-eye 2026-08-19 P2 + P3) ────────────────────────
// The band's census and the rows are rendered by different parts of the shell, so the query lives in
// `#state`. These pin the two halves the split used to get wrong: the count that ignored the filter, and a
// no-match state with no way out of itself.

test("P2 the band's census counts what the pane SHOWS, not what the library holds", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  const band = page.getByTestId("list-band");
  await expect(band.getByText(String(PRESETS.length), { exact: true })).toBeVisible();

  // One row matches "Imported".
  await component.getByRole("textbox", { name: "Search presets" }).fill("Imported");
  await expect(component.getByText(IMPORTED_NAME, { exact: true })).toBeVisible();
  await expect(band.getByText("1", { exact: true })).toBeVisible();

  // …and a search with NO hits reports zero beside "No matches" (it used to print the whole library's 4).
  await component.getByRole("textbox", { name: "Search presets" }).fill("zzzz-no-such-preset");
  await expect(component.getByText("No matches", { exact: true })).toBeVisible();
  await expect(band.getByText(String(PRESETS.length), { exact: true })).toHaveCount(0);
});

test("P3 the no-match state offers a way OUT — Clear search restores the list", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  const search = component.getByRole("textbox", { name: "Search presets" });
  await search.fill("zzzz-no-such-preset");
  await expect(component.getByText("No matches", { exact: true })).toBeVisible();

  await component.getByRole("button", { name: "Clear search", exact: true }).click();
  // The BOX is cleared too, not just the filter — the store is the one writer of both.
  await expect(search).toHaveValue("");
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();
});

test("the shared LIST layout's INSTRUMENT tier is LIVE, and the title column keeps its scan x", async ({ mount, page }) => {
  // `LibraryListLayout` is the ONE tier declaration behind both presets and world-info, so this covers both
  // panes' rows. side-eye P2-6: no VARIABLE-width status badge in the leading slot — asserted as
  // x-alignment, the thing the eye actually complained about. The built-in's lock is the ONE sanctioned
  // exception (crunch-list item 17, from the list mock), pinned separately below.
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.locator(TITLE).first()).toBeVisible();
  await expectInstrumentTierLive(component);

  const lefts = await component.locator(TITLE).evaluateAll((els) => els.map((el) => Math.round(el.getBoundingClientRect().left)));
  expect(lefts).toHaveLength(PRESETS.length);
  // Rows 2..n (every non-built-in row) share one x; the built-in leads with its lock.
  expect(new Set(lefts.slice(1)).size, "no leading status slot widens an ordinary row").toBe(1);
});

// ── O-1 / P0: the trailing slot is ONE reserved region, and NOTHING leaves layout on hover ────────
// The P0 hover loop was a `display:none` swap on the title-line "Active" badge: it reflowed the row under a
// stationary pointer, the hover boundary slid across the cursor, and the row re-hit-tested at frame rate
// (~85 crossings/sec live, zero DOM mutations). A CT cannot see the LOOP (a synthetic pointer does not
// re-hit-test on layout shift) — what it CAN pin is the mechanism's absence: identical geometry at rest and
// under :hover, and a state dot that never hides.

test("O-1 the ACTIVE row's dot is a FILLED disc in the trailing slot, painted at rest AND under hover", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const dot = page.getByRole("radio", { name: activateFor(EDITED_ONE_NAME), exact: true });
  // AT REST: fully opaque, in the accessible tree, and FILLED — the seal's `fill="solid"` axis, so the
  // pressed state is a shape delta and not stroke color alone (WCAG 1.4.1).
  await expect(dot).toHaveCSS("opacity", "1");
  await expect(dot).toHaveCSS("visibility", "visible");
  // Never `display:none` — that is the swap that oscillates (the box must stay in layout in both states).
  await expect(dot).not.toHaveCSS("display", "none");
  await expect(dot.locator("svg")).toHaveAttribute("fill", "currentColor");
  // …and it lives in the TRAILING cluster, not on the title line (where the swapped badge used to).
  await expect(component.locator(TITLE_ROW).getByRole("radio")).toHaveCount(0);
  await expect(component.locator(ACTIONS).getByRole("radio", { name: activateFor(EDITED_ONE_NAME), exact: true })).toHaveCount(1);

  // UNDER HOVER: still painted. The old badge vanished at exactly the moment the user was inspecting it.
  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await expect(dot).toHaveCSS("opacity", "1");
  await expect(dot.locator("svg")).toHaveAttribute("fill", "currentColor");
  // The UNPRESSED rows' dots stay hollow — the fill is the datum, not decoration on every row.
  await expect(page.getByRole("radio", { name: activateFor(IMPORTED_NAME), exact: true }).locator("svg")).toHaveAttribute("fill", "none");
});

test("P0 the row's geometry is IDENTICAL at rest and under hover — nothing enters or leaves layout", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const row = component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first();
  // Every box the swap used to move: the title line, the title itself, and the trailing strip.
  const boxes = (): Promise<number[]> =>
    row.evaluate((el) =>
      [`[data-slot="list-row-title-row"]`, `[data-slot="list-row-title"]`, `[data-slot="list-row-actions"]`].flatMap((sel) => {
        const rect = (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
        return [Math.round(rect.left), Math.round(rect.width)];
      }),
    );

  const atRest = await boxes();
  await row.hover();
  expect(await boxes(), "a hover-variable layout is the hit-test oscillator — see ROW_REVEAL_SWAP").toEqual(atRest);
});

test("item 18 the trailing cluster paints NO box of its own — the glyphs ride the row's hover tint", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const row = component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first();
  const cluster = row.locator(ACTIONS);
  await expect(cluster).toHaveCSS("background-color", TRANSPARENT);
  // The double highlight the owner spotted was a HOVER-only backdrop, so rest alone would pass for the
  // wrong reason.
  await row.hover();
  await expect(cluster).toHaveCSS("background-color", TRANSPARENT);
});

test("item 17/19 the built-in's lock sits inline-LEFT of the name and never collides with the cluster", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const row = component.locator(LIST_ROW_ROOT, { hasText: "Built-in default" }).first();
  await expect(row.locator(LEADING)).toHaveCount(1);
  // Hover is the state the collision was reported in: the lock stayed and the revealed control landed on
  // top of it, half-clipped.
  await row.hover();
  const geometry = await row.evaluate((el) => {
    const rect = (sel: string): DOMRect => (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
    return {
      lock: rect(`[data-slot="list-row-leading"]`),
      title: rect(`[data-slot="list-row-title"]`),
      cluster: rect(`[data-slot="list-row-actions"]`),
    };
  });
  expect(geometry.lock.width, "the lock renders (a zero-width leading slot is not a marker)").toBeGreaterThan(0);
  expect(geometry.lock.right, "inline-LEFT of the name, not an action slot at the far end").toBeLessThanOrEqual(geometry.title.left);
  expect(geometry.cluster.left, "the marker and the cluster are DISJOINT boxes, never a stack").toBeGreaterThanOrEqual(geometry.lock.right);
  expect(geometry.cluster.left, "…and the cluster is in flow past the title, not floated over it").toBeGreaterThanOrEqual(geometry.title.right);
});

test("an '(edited)' row deletes from its ⋯ menu — and the built-in row offers no delete at all", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);

  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();
  // EVERY row has a kebab now, the built-in included (2026-08-19 P3 — its menu holds Duplicate). What the
  // locked row still has no door to is DELETE, which is asserted on the open menu in its own test above.
  await expect(page.getByRole("button", { name: "Actions for" })).toHaveCount(PRESETS.length);

  // §12.2: the kebab rests hidden + inert like every other row affordance, so reach it by hovering the row.
  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_TWO_NAME }).hover();
  await page.getByRole("button", { name: menuFor(EDITED_TWO_NAME) }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  // THE PIN: the duplicate's OWN id reaches `preset.remove` (a row-indexed delete would send the wrong one).
  await expect.poll(() => (trpc.inputs("preset.remove") as RemoveCall[]).map((call) => call.id)).toEqual([EDITED_TWO]);
  // Nothing was active, so nothing clears the pointer.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — `onDelete` fires the (conditional) settings write and `preset.remove` in the SAME click handler, and the batch link sends that tick's mutations in ONE request; the recorded remove above therefore proves the request landed, so a settings write, had it happened, is already recorded too.
  expect(trpc.count("settings.updateUserSettingsSection")).toBe(0);
});

test("every non-built-in row carries its own edit stamp — the F5 scent that tells the '(edited)' twins apart", async ({ mount, page }) => {
  await page.clock.setFixedTime(FROZEN_NOW);
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);

  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();
  // The two forks differ by their stamp — 5 min vs 40 min ago — and the first also carries its LINEAGE
  // (`forkedFrom` = the built-in, whose name the surface resolves from the list it already has).
  // The stamp is the COMPACT relative form (#99, 2026-08-16 — presets joined the chat list's "9d" idiom).
  await expect(component.getByText("generation · forked from Default · edited 5m", { exact: true })).toBeVisible();
  // The second's source is a PACKAGED template, absent from the list: the lineage is OMITTED, never guessed.
  await expect(component.getByText("generation · edited 40m", { exact: true })).toBeVisible();
  // The KIND leads every subtitle (crunch-list item 6) — the ordinary `generation` included.
  await expect(component.getByText("roleplay · edited 5m", { exact: true })).toBeVisible();
  // The built-in keeps its own marker instead of a stamp (its updatedAt is the seed's, not the user's edit).
  // (located by exact ROLE name — the row BODY button, never the "Activate Default for generation" toggle
  // beside it.)
  await expect(component.getByRole("button", { name: "Default", exact: true })).toBeVisible();
  await expect(component.getByText("Built-in default", { exact: true })).toBeVisible();
});

test("deleting the ACTIVE '(edited)' row also clears the active-for-generation pointer", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);

  // The row IS the active pick — carried by the toggle's `aria-checked`, the row's whole state readout.
  await expect(page.getByRole("radio", { name: activateFor(EDITED_ONE_NAME), exact: true })).toHaveAttribute("aria-checked", "true");

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();

  await expect.poll(() => (trpc.inputs("preset.remove") as RemoveCall[]).map((call) => call.id)).toEqual([EDITED_ONE]);
  // The active pointer is nulled in the same gesture — a dangling id would silently fall back mid-generation.
  await expect.poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).at(-1)?.patch?.defaultPresetId).toBeNull();
});

// ── §12 row-action grammar (list-pane-projection) ────────────────────────────────────────────────
// THE CLUSTER IS TWO SLOTS: the state dot and the kebab. The inline Duplicate DIED 2026-08-19 (side-eye
// P1-1) — it was a verbatim second door to the kebab's own item, and its slot was reserved on every row
// always, which at the docked 272px pane left the NAME 109px and clipped four rows of six. The kebab's
// Duplicate is the one home; the pins below are (1) that the standalone control is gone, (2) that the act
// still works from its one home, and (3) the width the removal bought, measured per row.

interface CreateCall {
  readonly name?: string;
}

test("P1-1 the row carries NO standalone Duplicate control — the kebab's item is the one home", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  // Not "hidden at rest" — ABSENT. (The old control was `opacity-0` but present and hit-testable, so a
  // count is the only assertion that tells removal from concealment.)
  await expect(page.getByRole("button", { name: "Duplicate " })).toHaveCount(0);
  // …and the cluster is two slots wide, with no spacer standing in for the third.
  await expect
    .poll(
      async () =>
        await component
          .locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME })
          .first()
          .locator(ACTIONS)
          .evaluate((el) => ({
            controls: el.querySelectorAll("button").length,
            spacers: el.querySelectorAll('[data-slot="library-row-cluster-spacer"]').length,
          })),
    )
    .toEqual({ controls: 2, spacers: 0 });
});

test("P1-1 at the DOCKED 272px pane the trailing strip costs TWO slots and the name gets the third back", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibraryDockedStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  // THE BUDGET, measured where it hurts (the docked pane's real floor). Asserted as WIDTHS, not as "does
  // this fixture's name happen to clip": a clip is a property of the row budget AND the name, so a pin
  // written on the fixture's names passes for the wrong reason the day someone renames one — verified, in
  // fact, red-first: these four names still FIT at 272px under the old three-slot strip.
  const row = component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first();
  const slot = await resolveSpacingPxIn(row.locator(ACTIONS), "--spacing-control-md");
  const geometry = await row.evaluate((el) => {
    const rect = (sel: string): DOMRect => (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
    return { cluster: rect('[data-slot="list-row-actions"]').width, title: rect('[data-slot="list-row-title"]').width };
  });
  // Two control boxes and nothing else — the dead third (the inline Duplicate) would show up here as a slot more.
  await expect
    .poll(
      async () =>
        (
          await row.evaluate((el) => {
            const rect = (sel: string): DOMRect => (el.querySelector(sel) as HTMLElement).getBoundingClientRect();
            return { cluster: rect('[data-slot="list-row-actions"]').width, title: rect('[data-slot="list-row-title"]').width };
          })
        ).cluster,
    )
    .toBeGreaterThanOrEqual(2 * slot);
  expect(geometry.cluster, "no third slot, and no spacer standing in for one").toBeLessThan(3 * slot);
  // …and the name column clears the 109px the review measured, by more than the slot it reclaimed.
  expect(geometry.title, "the name gets the reclaimed slot, not the gutter").toBeGreaterThan(109 + slot);

  // No row clips at this width with these names (the vector, per row — never one sample).
  const overflow = await component.locator(TITLE).evaluateAll((els) => els.map((el) => el.scrollWidth - el.clientWidth));
  expect(overflow).toHaveLength(PRESETS.length);
  expect(
    overflow.every((delta) => delta <= 0),
    `per-row overflow at 272px: ${overflow.join(",")}`,
  ).toBe(true);
});

test("§12 the kebab's Duplicate fires preset.create for THAT row", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({
      userId: "user_ct_preset",
      schemaVersion: 1,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: 0,
      configUnreadable: null,
    }),
    "preset.get": () => ({
      id: EDITED_ONE,
      name: EDITED_ONE_NAME,
      kind: "generation",
      isSystemDefault: false,
      config: DEFAULT_PROMPT_CONFIG,
      createdAt: 0,
      updatedAt: 0,
      forkedFrom: null,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
      configUnreadable: null,
    }),
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

  // Assert the MUTATION fired with this row's name, not a repaint. The kebab rests hidden like every other
  // trailing control, so the row is hovered first.
  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) }).click();
  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect.poll(() => (trpc.inputs("preset.create") as CreateCall[]).map((call) => call.name)).toEqual([`Copy of ${EDITED_ONE_NAME}`]);
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
  const expected = await resolveSpacingPxIn(kebab, "--spacing-control-md");
  await expect.poll(async () => (await kebab.boundingBox())?.width).toBe(expected);
  await expect.poll(async () => (await kebab.boundingBox())?.height).toBe(expected);
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
    "settings.getUserSettings": () => ({ userId: "user_ct_preset", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
  });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true }).first()).toBeVisible();

  const names = await page.getByRole("button", { name: "Actions for" }).evaluateAll((els) => els.map((el) => el.getAttribute("aria-label") ?? ""));
  expect(names).toHaveLength(2);
  expect(new Set(names).size).toBe(2);
  // …and the disambiguator is the row's own stamp, not an index or an id.
  expect(names.every((name) => name.startsWith(rowActionsName(`"${EDITED_ONE_NAME}" · `)))).toBe(true);
});

test("P3 the built-in row IS duplicable — a kebab holding Duplicate and nothing else it can do", async ({ mount, page }) => {
  const trpc = await routeTrpc(page, {
    "preset.list": () => PRESETS,
    // ANOTHER row holds the pick, deliberately: the built-in IS the null pick, so this mounts the row in its
    // NOT-active state — the arm that used to carry the Activate echo (#481 killed it).
    "settings.getUserSettings": () => ({
      userId: "user_ct_preset",
      schemaVersion: 1,
      config: { ...DEFAULT_USER_SETTINGS, seeds: { ...DEFAULT_USER_SETTINGS.seeds, defaultPresetId: EDITED_ONE } },
      updatedAt: 0,
      configUnreadable: null,
    }),
    "preset.get": () => ({
      id: BUILT_IN,
      name: "Default",
      kind: "system",
      isSystemDefault: true,
      config: DEFAULT_PROMPT_CONFIG,
      createdAt: 0,
      updatedAt: 0,
      forkedFrom: null,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
      configUnreadable: null,
    }),
    "preset.create": () => ({ id: "preset_ct_copy00002", name: "Copy of Default", kind: "generation", isSystemDefault: false, createdAt: 0, updatedAt: 0 }),
  });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: "Built-in default" }).first().hover();
  await page.getByRole("button", { name: menuFor("Default") }).click();
  // The one act the packaged row CAN do…
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  // …none of the ones it would refuse (items are OMITTED, never disabled). Rename is absent for a second,
  // now-universal reason too (#506 — no list row offers it); this row would refuse it regardless.
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Export" })).toHaveCount(0);
  // …and NOT the Activate echo: this row's activation door is its own radio, 40px away (#481, P2-6).
  await expect(page.getByRole("menuitem", { name: "Activate" })).toHaveCount(0);

  await page.getByRole("menuitem", { name: "Duplicate" }).click();
  await expect.poll(() => (trpc.inputs("preset.create") as CreateCall[]).map((call) => call.name)).toEqual(["Copy of Default"]);
});

test("§12 the built-in row still carries NO inline verb, and activation is not CRUD", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: duplicateActionName("Default"), exact: true })).toHaveCount(0);
  // …the un-renameable, un-deletable built-in is still a pick (D1).
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
  // UNPRESSED it rides the row reveal like every other trailing control (the D11 `when-on` posture); the
  // PRESSED dot never hides — pinned in the O-1 test above.
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
  // …and it is the ONLY pressed row (one-of-N) — counted on the DOTS themselves, which is where the state
  // lives now that the "Active" badge is gone (O-1).
  const checked = await component
    .locator(ACTIONS)
    .getByRole("radio")
    .evaluateAll((els) => els.filter((el) => el.getAttribute("aria-checked") === "true"));
  expect(checked).toHaveLength(1);
});

// ── #481 / P1-1: BROWSING IS NOT COMMITTING ──────────────────────────────────────────────────────
// The live receipt: two ArrowDowns through this list produced two `settings.updateUserSettingsSection`
// writes — the key you press to READ the next row rewrote which preset every future generation runs with,
// silently. The group keyboard contract is the APG's selection-with-side-effect arm now (arrows move focus,
// Space/Enter commits — the contract itself is pinned in `tests/client/components/library-surface.ct.tsx`);
// these two pin it end-to-end on the REAL surface, against the real mutation.
//
// The presses go through `page.keyboard`, never `locator.press()`: a locator press FOCUSES its target
// first, which would silently undo the very movement under test on every press after the first.

// ONE test for the whole receipt, deliberately: a bare "the arrows wrote nothing" assertion is UNSETTLED —
// a request the walk fired may simply not have arrived at the recorder yet, so the zero can be true of the
// instant and false of the run (it passed vacuously against the OLD code, which writes on every arrow). The
// settle-safe form is the report's own: walk, commit ONCE, and assert the ENTIRE write log is that single
// commit. Under the old behaviour the same run logs three.
test("#481 P1-1 a keyboard walk writes NOTHING, and Space on the row the user CHOSE writes exactly once", async ({ mount, page }) => {
  const trpc = await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  const start = page.getByRole("radio", { name: activateFor("Default"), exact: true });
  await start.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");

  // Barrier on the SETTLED rendered arm — focus landed two rows down, and the PICK did not follow it.
  const walked = page.getByRole("radio", { name: activateFor(EDITED_TWO_NAME), exact: true });
  await expect(walked).toBeFocused();
  await expect(walked).toHaveAttribute("aria-checked", "false");
  await expect(start).toHaveAttribute("aria-checked", "true");

  await page.keyboard.press(" ");
  // The WHOLE log is one write, and it names the row the user stopped on — never a row they passed through.
  await expect
    .poll(() => (trpc.inputs("settings.updateUserSettingsSection") as SettingsPatchCall[]).map((call) => call.patch?.defaultPresetId))
    .toEqual([EDITED_TWO]);
});

test("#481 P1-1 activating ANNOUNCES the new pick in the app's polite live region", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibraryAnnouncedStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("radio", { name: activateFor(EDITED_ONE_NAME), exact: true }).click();

  // ONE mechanism for both readings: the toast is the pixels, and its viewport is the live region — so the
  // sentence is announced and painted by the same act. Asserted on the viewport that CARRIES the notice,
  // never a bare slot selector.
  const viewport = page.locator('[data-slot="toast-viewport"]');
  await expect(viewport).toHaveAttribute("aria-live", "polite");
  await expect(viewport.getByText(`${EDITED_ONE_NAME} is now the active preset`, { exact: true })).toBeVisible();
});

test("#481 P3-5 the ACTIVE row's subtitle is the same shape as an inactive row's, and its stamp survives", async ({ mount, page }) => {
  await page.clock.setFixedTime(FROZEN_NOW);
  await routeLibrary(page, IMPORTED);
  // The DOCKED width (272px) is where the defect lived: the "Active · " prefix pushed the active row's own
  // timestamp into an ellipsis in a 155px subtitle cell, while every inactive row printed its metadata whole.
  const component = await mount(<PresetLibraryDockedStory />);
  await expect(component.getByText(IMPORTED_NAME, { exact: true })).toBeVisible();

  const activeRow = component.locator(LIST_ROW_ROOT, { hasText: IMPORTED_NAME }).first();
  const subtitle = activeRow.locator('[data-slot="list-row-subtitle"]');
  // The row IS the pick (so this is the arm that used to wear the prefix)…
  await expect(page.getByRole("radio", { name: activateFor(IMPORTED_NAME), exact: true })).toHaveAttribute("aria-checked", "true");
  // …and its subtitle is exactly what the same row prints when it is not.
  await expect(subtitle).toHaveText("roleplay · edited 5m");
  // Rendered, not just derived: the cell is not clipping (the P3-5 symptom was `Active · roleplay · edite…`).
  await expect.poll(async () => await subtitle.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(false);
});

test("§12 enforcement: the pane-level 'Active for generation' Select is DELETED, not kept beside the toggle", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  // No `combobox` ANYWHERE on the pane: the deleted Select was one, and after F-3 the macro textareas
  // are not, so this count is now an unambiguous statement about the Select alone.
  await expect(page.getByRole("combobox")).toHaveCount(0);
  await expect(component.getByText("Active for generation", { exact: true })).toHaveCount(0);
  // The name "Active preset for generation" survives — but as the ROWS' `role="radiogroup"` (side-eye
  // F-19), never as a pane-level control. Asserting the ROLE is what keeps this pin from passing for the
  // wrong reason if the Select ever came back under a renamed label.
  await expect(page.getByRole("radiogroup", { name: "Active preset for generation" })).toHaveCount(1);
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

// ── #481 / P2-6: ACTIVATE HAS ONE LIST-SIDE HOME — the row's radio ───────────────────────────────
// The kebab used to mirror it ("§16 row 3 echo (a)", for keyboard parity). The radio is properly
// keyboard-operable now (arrows move focus, Space commits — pinned below), so the echo was pure
// duplication sitting 40px from the control it copied, which is exactly the test
// `preset-editor-surface.tsx:362-365` applied to the Export echo: "ONE home".

test("#481 the row kebab offers NO Activate — the radio is the list's one activation door", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  // The NOT-active row: the arm that used to render the echo.
  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_TWO_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_TWO_NAME) }).click();
  // The menu IS open (its own items are there) — the absence is real, not an unopened popup.
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Activate" })).toHaveCount(0);
  // …and the menu is THREE items (Duplicate · Delete · Export). It was FOUR when this pin landed; #506 took
  // Rename to the editor, which is the same one-home test applied to the next echo.
  await expect(page.getByRole("menuitem")).toHaveCount(3);

  // The door that survives, on the same row: its radio, unchecked and ready.
  await expect(page.getByRole("radio", { name: activateFor(EDITED_TWO_NAME), exact: true })).toHaveAttribute("aria-checked", "false");
});

// ── G6: the single-preset EXPORT door (§16.1) ────────────────────────────────────────────────────
// The door is a THIN ARM over the bundle's serde: `buildPresetFile` from the cached `preset.get` row. The
// pin is the BYTES — an `orb.preset` envelope carrying the row's own config — because a second serde (or a
// hand-rolled envelope) is exactly the banned parallel path this arm exists to avoid.

test("G6 the kebab EXPORT downloads the bundle's own orb.preset bytes for that row", async ({ mount, page }) => {
  const config = { schemaVersion: 5, params: { temperature: 0.42 }, sections: [] };
  await routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({ userId: "user_ct_preset", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
    "preset.get": () => ({
      id: EDITED_ONE,
      name: EDITED_ONE_NAME,
      kind: "generation",
      isSystemDefault: false,
      config,
      createdAt: 0,
      updatedAt: 0,
      forkedFrom: null,
      schemaVersion: DEFAULT_PROMPT_CONFIG.schemaVersion,
      configUnreadable: null,
    }),
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

// ── #483 / P3-1: the landing is a real welcome, not a paragraph parked at the top of a void ──────
// Three measured defects in one state (`scratchpad/09-geom`, docked-both, live): `main "Presets content"`
// held ZERO headings so heading navigation dead-ended in the pane the reader was looking at; the teaching
// copy ran to four ragged centered lines at a 42.5ch measure against §2's 65–75ch band; and the 219px block
// sat top-anchored in a 752px pane, i.e. 71% void that grows with the pane.

const EMPTY_STATE_ROOT = '[data-slot="empty-state-root"]';
const EMPTY_STATE_TITLE = '[data-slot="empty-state-title"]';
const EMPTY_STATE_DESCRIPTION = '[data-slot="empty-state-description"]';
const WELCOME_TITLE = "Tune how the model generates";
/** The `wide` measure is `--container-cq-md` = 32rem = 512px ≈ 60ch at this surface's 8.58px ch. The floor
 *  is stated below it (paint rounding, and a scrollbar the pane may take) and far above the old 384px. */
const MIN_MEASURE_PX = 480;

test("#483 P3-1 the landing title is a real heading — heading navigation finds the pane's own subject", async ({ mount }) => {
  const welcome = await mount(<PresetLibraryWelcomeWideStory />);
  // The heading IS the visible title (not a second, hidden one bolted on for AT).
  const heading = welcome.getByRole("heading", { name: WELCOME_TITLE });
  await expect(heading).toBeVisible();
  await expect(welcome.locator(EMPTY_STATE_TITLE)).toHaveAttribute("data-title-step", "focal");
  const tag = await welcome.locator(EMPTY_STATE_TITLE).evaluate((el) => el.tagName);
  expect(tag, "the focal title element itself is the heading, not a <p> beside one").toBe("H2");
});

test("#483 P3-1 the landing's teaching copy reads at the focal measure, not a list-pane measure", async ({ mount }) => {
  const welcome = await mount(<PresetLibraryWelcomeWideStory />);
  const description = welcome.locator(EMPTY_STATE_DESCRIPTION);
  await expect(description).toBeVisible();
  const width = await description.evaluate((el) => el.getBoundingClientRect().width);
  expect(width, "the measure is the focal one (≈60ch), not the 24rem list-pane step").toBeGreaterThan(MIN_MEASURE_PX);
});

test("#483 P3-1 the landing block is centered in its pane, not top-anchored above a void", async ({ mount }) => {
  const welcome = await mount(<PresetLibraryWelcomeWideStory />);
  const block = welcome.locator(EMPTY_STATE_ROOT);
  await expect(block).toBeVisible();
  // Measured against the MOUNT's own box, so the pin holds at any story height.
  const offsets = await welcome.evaluate((pane, selector) => {
    const target = pane.querySelector(selector) as HTMLElement;
    const paneBox = pane.getBoundingClientRect();
    const blockBox = target.getBoundingClientRect();
    return { paneCenter: paneBox.top + paneBox.height / 2, blockCenter: blockBox.top + blockBox.height / 2, paneHeight: paneBox.height };
  }, EMPTY_STATE_ROOT);
  expect(offsets.paneHeight, "the story must give the pane real height, or centering is unobservable").toBeGreaterThan(400);
  expect(
    Math.abs(offsets.blockCenter - offsets.paneCenter),
    `block center ${String(offsets.blockCenter)} vs pane center ${String(offsets.paneCenter)}`,
  ).toBeLessThan(24);
});

// ── #483 / P3-2: the same state-honesty #434 minted, extended to the ZERO-RESULTS list ────────────
// #434 made this pane stop instructing a reader to pick from a list that is off screen. The same sentence
// was still being printed over a list filtered to NOTHING — "Pick a preset … or create a new one" beside an
// empty rail. The list pane's own no-match state is excellent and owns the way out, so this pane states the
// fact and names that affordance; it mints no second door.
const NO_MATCH_SENTENCE = /No preset matches your search/u;

test("#483 P3-2 the welcome stops saying 'Pick a preset' once the list is filtered to nothing", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const welcome = await mount(<PresetLibraryWelcomeFilteredStory />);
  // The unfiltered arm: the teaching instruction, and no no-match claim.
  await expect(welcome.getByText(TEACHING_SENTENCE)).toBeVisible();
  await expect(welcome.getByText(NO_MATCH_SENTENCE)).toHaveCount(0);

  await welcome.getByRole("button", { name: "filter to nothing" }).click();
  await expect(welcome.getByText(NO_MATCH_SENTENCE)).toBeVisible();
  // The instruction is REPLACED, not appended: an "or create a new one" beside "nothing matched" is the
  // same dead end in two sentences.
  await expect(welcome.getByText(TEACHING_SENTENCE)).toHaveCount(0);

  await welcome.getByRole("button", { name: "clear the filter" }).click();
  await expect(welcome.getByText(TEACHING_SENTENCE)).toBeVisible();
  await expect(welcome.getByText(NO_MATCH_SENTENCE)).toHaveCount(0);
});

test("#483 P3-2 the band keeps the library TOTAL when the filter matches nothing", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  const band = page.getByTestId("list-band");
  await expect(band.getByText(String(PRESETS.length), { exact: true })).toBeVisible();

  await component.getByRole("textbox", { name: "Search presets" }).fill("zzzz-no-such-preset");
  await expect(component.getByText("No matches", { exact: true })).toBeVisible();
  // The census still reports what the pane SHOWS (the leading 0 — the 2026-08-19 P2 ruling stands); what it
  // no longer does is VANISH, taking the total with it exactly when the number would reassure.
  await expect(band.getByText(`0 of ${String(PRESETS.length)}`, { exact: true })).toBeVisible();
});

test("G6 the BUILT-IN row offers no Export — the bundle excludes the system default", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  // It HAS a kebab now (Duplicate lives there — 2026-08-19 P3), so the absence has to be asserted with the
  // menu OPEN: "no export door" is a claim about the menu's contents, not about the menu's existence.
  await component.locator(LIST_ROW_ROOT, { hasText: "Built-in default" }).first().hover();
  await page.getByRole("button", { name: menuFor("Default") }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export" })).toHaveCount(0);
});

// A FENCE, not a defect proof: the ACTIVE row's kebab already omitted Activate before #481 (the item was
// conditional on `!active`). It is kept because the echo's absence must now be UNCONDITIONAL — a future
// re-introduction would most plausibly come back through this arm.
test("#481 the ACTIVE row's kebab is the same item set — the echo's absence is not state-dependent", async ({ mount, page }) => {
  await routeLibrary(page, EDITED_ONE);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_ONE_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_ONE_NAME) }).click();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Activate" })).toHaveCount(0);
  await expect(page.getByRole("menuitem")).toHaveCount(3);
});

// ── #506: RENAME SINGLE-HOMES IN THE EDITOR ──────────────────────────────────────────────────────
// #483 built the rename door in the editor header (`preset-editor-header.tsx` — the Pencil beside the h2)
// and recorded at that site that it read as a SECOND door, because the list row's kebab carried Rename too.
// #442 settled the class for the same verb on world-info — "rename single-homes in the EDITOR", the posture
// tags and regex already ship — so the list item is the one that goes. This is the ORDINARY row (the arm
// that carried the item); the built-in never had it, which is why its own pin above is not the proof.
test("#506 the row kebab offers NO Rename — the editor header is the verb's one door", async ({ mount, page }) => {
  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await component.locator(LIST_ROW_ROOT, { hasText: EDITED_TWO_NAME }).first().hover();
  await page.getByRole("button", { name: menuFor(EDITED_TWO_NAME) }).click();
  // The menu is OPEN, so the absence is a statement about its contents rather than an unopened popup.
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Rename" })).toHaveCount(0);
  // …and the pane mounts NO rename dialog either — the item's removal took its whole flow, rather than
  // leaving an unreachable overlay behind (the half-migration this repo calls rot).
  await expect(page.getByRole("dialog", { name: "Rename preset" })).toHaveCount(0);
  // The verbs that stay are the LIFECYCLE ones (O-16★: lifecycle lives list-side).
  await expect(page.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Export" })).toBeVisible();
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
function routeImportLibrary(page: Page, outcome: TrpcFixtureOutput<"preset.importFile">): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "preset.list": () => PRESETS,
    "settings.getUserSettings": () => ({ userId: "user_ct_preset", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, updatedAt: 0, configUnreadable: null }),
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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — ONE confirm handler picks exactly one arm, so the recorded `importFile` above proves the click's request already landed; a `create` from the same click would be recorded by now.
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
  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — same single-arm confirm handler; the recorded `create` proves the click landed.
  expect(trpc.count("preset.importFile")).toBe(0);
});

/** A RECOGNISED SillyTavern preset that orb REFUSES. It has `prompts` + `prompt_order`, so the mapper's own
 *  recognition check admits it — and then #1363's intact-parse belt rejects it, because the literal section
 *  it builds carries content past the schema's 100k bound. That refusal is the state #1390 measured: a file
 *  the ST reader itself calls "This SillyTavern preset…" being told it matched no SillyTavern preset. */
const REFUSED_ST_FILE = JSON.stringify({
  temperature: 0.9,
  prompts: [{ identifier: "lore-dump", name: "Lore dump", content: "x".repeat(100_001) }],
  // COMPUTED KEYS, not literals: these are ST's own snake_case WIRE names and must match the foreign JSON
  // verbatim, which `useNamingConvention` reads as a violation on a literal property. The bracket form is
  // the suppression-free spelling the house already uses for foreign vocabularies.
  ["prompt_order"]: [{ ["character_id"]: 100_001, order: [{ identifier: "lore-dump", enabled: true }] }],
});

/** VALID JSON that the ST reader never claims: no `prompts`, no `prompt_order`. The other side of #1580's
 *  split — the reader RECOGNISED NOTHING, so the door's "it isn't an orb export and the ST reader stopped"
 *  sentence is the honest one and must survive the split intact. */
const UNRECOGNISED_JSON_FILE = JSON.stringify({ note: "some other tool's export", items: [1, 2, 3] });

test("#1580 a RECOGNISED-but-refused SillyTavern preset is named as recognised, and refused", async ({ mount, page }) => {
  await routeImportLibrary(page, { ok: true, created: true });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import a preset", exact: true }).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "huge-st.json", mimeType: "application/json", buffer: Buffer.from(REFUSED_ST_FILE) });

  // The door now SAYS which refusal this is (#1580): the reader claimed the file and then refused it. The
  // old copy could only say the reader "stopped", which reads as "it didn't recognise this" — the one thing
  // that is NOT what happened here.
  await expect(page.getByText(/Recognised as a SillyTavern preset, refused:/u)).toBeVisible();
  await expect(page.getByText(/This SillyTavern preset mapped to a config orb cannot store/u)).toBeVisible();
  // #1592 — the generic `(schema-rejected)` word alone left the owner of a too-long prompt with no way to
  // tell which one to shrink; the reason now names the offending ST prompt + field.
  await expect(page.getByText(/the ST prompt "lore-dump" `content`/u)).toBeVisible();
  // The recognised arm never borrows the unrecognised arm's sentence…
  await expect(page.getByText(/the SillyTavern reader stopped/u)).toHaveCount(0);
  // …and the #1390 self-contradiction stays gone: no denial of a format the quoted reason names.
  await expect(page.getByText(/matched neither/u)).toHaveCount(0);
  // A refused file is not a parsed import — nothing is offered for commit.
  await expect(page.getByText(ST_SUMMARY)).toHaveCount(0);
});

test("#1580 valid JSON the ST reader never claims keeps the RULED-OUT-BOTH-ARMS copy (F-10's requirement)", async ({ mount, page }) => {
  await routeImportLibrary(page, { ok: true, created: true });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import a preset", exact: true }).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "other-tool.json", mimeType: "application/json", buffer: Buffer.from(UNRECOGNISED_JSON_FILE) });

  // FENCE (green before #1580 too, deliberately): the split must not repaint the arm where "the orb arm was
  // ruled out AND the ST reader stopped" is exactly what happened. F-10's rule is that the ST parser must
  // not speak for the whole door — this sentence keeps both arms in it.
  await expect(page.getByText(/It isn't an orbweaver preset export, and the SillyTavern reader stopped/u)).toBeVisible();
  await expect(page.getByText(/Not a SillyTavern Chat Completion preset/u)).toBeVisible();
  await expect(page.getByText(/Recognised as a SillyTavern preset/u)).toHaveCount(0);
});

test("#1390 a file that is not JSON at all IS the true `neither format` case", async ({ mount, page }) => {
  await routeImportLibrary(page, { ok: true, created: true });
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Import a preset", exact: true }).click();
  await page.locator(DROPZONE_INPUT).setInputFiles({ name: "notes.json", mimeType: "application/json", buffer: Buffer.from("not json at all") });

  // The positive control for the arm above: when nothing could be READ, "neither format" is the honest
  // sentence and must survive — the fix narrows that claim, it does not delete it.
  await expect(page.getByText(/isn't valid JSON, so neither an orbweaver preset export nor a SillyTavern/u)).toBeVisible();
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

// ── #1748: the pane CHROME and its SCROLL BOX sit above the boundary (`LibraryListFrame`) ────────────
// The shared library scaffold was refused a `reserveKey` on GEOMETRY: `LibraryListLayout`'s rows container
// was the pane's scroller and it rendered INSIDE the boundary, so the reservation's auto-height measuring
// Stack severed its `flex-1` and every row past the fold became unreachable (#1133). The layout is split now
// — frame (surface + search + scroll box) above the boundary, rows below it — and these are the three facts
// that move together. The SEARCH-WHILE-PENDING arm is a defect proof (red against HEAD: with the input under
// the boundary the pending pane is a bare sentence); the REMEMBER arm is a defect proof (no key on HEAD);
// the REACHABILITY arm is a FENCE against HEAD and reds against the keyed-but-unsplit tree.

/** 40 rows — enough that a 200px pane cannot be honest about them without scrolling. */
const MANY_PRESETS = [
  summary({ id: BUILT_IN, name: "Default", isSystemDefault: true }),
  ...Array.from({ length: 39 }, (_unused, i) => summary({ id: `preset_ct_bulk${String(i).padStart(6, "0")}`, name: `Bulk preset ${i}` })),
];

const LAST_BULK_NAME = "Bulk preset 38";

test("#1748 the search input survives the pending read, and the rows still reach past the fold", async ({ mount, page }) => {
  const hold = trpcHold();
  await routeTrpc(page, {
    "preset.list": hold,
    "settings.getUserSettings": () => ({
      userId: "user_ct_preset",
      schemaVersion: 1,
      config: DEFAULT_USER_SETTINGS,
      updatedAt: 0,
      configUnreadable: null,
    }),
  });

  const component = await mount(<PresetLibrarySurfaceShortStory />);
  await hold.requested;

  // PENDING, and the chrome is still there: the search box is pane furniture, not list content. Before the
  // split it lived under the boundary and this locator resolved to nothing while the read was in flight.
  const search = component.getByRole("textbox", { name: "Search presets" });
  await expect(search).toBeVisible();
  await expect(component.getByText("Loading your presets…")).toBeVisible();

  hold.release(MANY_PRESETS);
  await expect(component.getByText("Bulk preset 0", { exact: true })).toBeVisible();

  // The frame's scroll box is a REAL scroller and it moves; the last row is reachable.
  const scroller = component.locator('[data-slot="library-list-scroll"]');
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(0);
  await component.getByText(LAST_BULK_NAME, { exact: true }).scrollIntoViewIfNeeded();
  await expect(component.getByText(LAST_BULK_NAME, { exact: true })).toBeInViewport();

  // …and the settle remembered this OWNER's box — the key is minted at the surface, never in the shared shell.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const key = Object.keys(localStorage).find((k) => k.includes("surface-box"));
        const blob = key === undefined ? "{}" : (localStorage.getItem(key) ?? "{}");
        return (JSON.parse(blob) as { state?: { boxes?: Record<string, number> } }).state?.boxes?.["preset.library"] ?? 0;
      }),
    )
    .toBeGreaterThan(0);
});

// #859 P3-A (side-eye 2026-08-30 rail-presets delta). THE LIST PANE'S TWO READS MUST BE ONE WAVE.
//
// The finding was a 61ms rendered frame flagged against `aside[aria-label=Presets list]` on entry, with
// `__orb.animations()` reading 0 at settle — which the receipt read as "a transition on a layout property
// during the pane's mount". IT IS NOT, and the tree says so twice: the `[drop]` flagger names whatever
// animation LIFETIME overlaps the frame window and not the frame's cause (`boot-veil.tsx`'s #429 ruling,
// `motion-animation-state.ts` `targetsOverlapping`), and the pane's only entry motion is shell.css's
// `@keyframes shell-list-panel-flip { from { translate: var(--list-panel-flip-from) 0 } }` — a
// compositor-owned translate that is
// already what the guide asks for. A settled read of 0 animations is the entry animation having ENDED, not
// one never having run.
//
// The cause is the SAME defect one surface over: #1134/F5 on the Characters landing, where three serialized
// `useSuspenseQuery` calls put the last response's commit inside the list pane's entry animation
// (`character-library-welcome.tsx`'s header records the measurement). Two `useSuspenseQuery` calls in one
// body CANNOT fire together — the first suspends before React reaches the second hook.
//
// Pinned at the NETWORK boundary and as ORDERING, exactly as #1134 is: `__orb.queries()` / `recorder.count()`
// are blind here (two procedure calls happen either way), and the assertion holds whichever way
// `httpBatchLink` packs the wave — one batched request trivially satisfies it, two concurrent ones satisfy
// it, and only a waterfall violates it. Barriered on the SETTLED pane (a row is rendered) before the log is
// read, never on an in-flight state.
test("#859 the list pane's two reads go out as one wave — no response lands before the last request", async ({ mount, page }) => {
  const events: string[] = [];
  const isPaneRead = (url: string): boolean => url.includes("preset.list") || url.includes("settings.getUserSettings");
  page.on("request", (request) => {
    if (isPaneRead(request.url())) {
      events.push("out");
    }
  });
  page.on("requestfinished", (request) => {
    if (isPaneRead(request.url())) {
      events.push("in");
    }
  });

  await routeLibrary(page, null);
  const component = await mount(<PresetLibrarySurfaceStory />);
  await expect(component.getByText(EDITED_ONE_NAME, { exact: true })).toBeVisible();

  expect(events.filter((event) => event === "out").length, "the probe measured nothing — no read reached the wire").toBeGreaterThan(0);
  expect(events.indexOf("in"), `a response landed while reads were still going out: ${events.join(",")}`).toBe(events.lastIndexOf("out") + 1);
});
