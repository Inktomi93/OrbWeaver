// CT: the LOOKS section (#866 S4 / #297 apply-not-mode, as amended by the owner's 2026-08-30 ONE-COLLECTION
// ruling — #920). Every arm the older CTs pinned that survived is RE-PINNED here on the unified anatomy —
// the O-8 deferred mint most of all — plus the S4 contracts: picking a cell APPLIES (the `selectedThemeId`
// patch through the real write seam; Hearth writes NULL — the base theme, no `[data-theme]` block) and
// Import → createTheme.
//
// THE #920 PLANTS, each one an invariant from the cold contract:
//   · a seed and an owned theme render the SAME anatomy and differ only in MENU CONTENTS;
//   · an EXTRA seed the client has never heard of renders — there is no client allowlist any more (the
//     deleted SHIPPED_ORDER is what this arm would have caught);
//   · provenance: Hearth's thumbnail carries NO `data-theme` and NO ThemeScope; a named seed carries its
//     generated `[data-theme]` and still NO override scope; a custom theme carries a ThemeScope;
//   · no thumbnail ever injects a theme's custom CSS.

// `themeActionsName` IS REACHED BY RELATIVE PATH, NOT THROUGH `@orb/client/features/config` (#2447, and
// measured the hard way). It used to come off the `features/settings` front door; that feature folded into
// `features/config`, and the config front door is big enough that pulling it into PLAYWRIGHT'S NODE-SIDE
// collection makes this file collect ZERO tests — silently. `pnpm test:ct <this file>` then reports
// `UNFED PATH … the runner collected NO tests from it` and names three causes that are all wrong (a filter,
// a support module, an all-skipped spec), because `collectCt` reads `playwright test --list`'s JSON and
// never looks at its status or `errors`. The same invocation with THIS import collects 16. A relative path
// is safe for this symbol specifically: it is a pure accessible-name builder with no module state, so a
// second module instance is not a hazard the way a store or a component would be.
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { themeActionsName } from "../../../../../packages/client/src/features/config/lib/theme-row-names.ts";
import type { TrpcProcedurePath, TrpcRecorder, TrpcRoutes } from "../../../../support/node/route-trpc.ts";
import { routeTrpc, trpcHold } from "../../../../support/node/route-trpc.ts";
import { LooksSectionNarrowStory, LooksSectionReopenStory, LooksSectionStory } from "../_ct-stories.tsx";

const NOW = 0;
interface SeedView {
  readonly id: string;
  readonly name: string;
  readonly override: { readonly background: string; readonly accent: string };
  readonly css: null;
  readonly isSeed: boolean;
  /** #1671 — the wire's own "this row is what `selectedThemeId: null` resolves to" flag. */
  readonly isDefault: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
function seed(id: string, name: string, bg: string, accent: string): SeedView {
  return { id, name, override: { background: bg, accent }, css: null, isSeed: true, isDefault: false, createdAt: NOW, updatedAt: NOW };
}
/** The ONE default row (`isDefault: true`) — what `selectedThemeId: null` resolves to on the real wire. */
const HEARTH: SeedView = { ...seed("theme_00000000000000000000000001", "Hearth", "oklch(0.158 0.006 60)", "oklch(0.72 0.175 52)"), isDefault: true };
const MOCHA = seed("theme_00000000000000000000000002", "Mocha", "oklch(0.15 0.015 250)", "oklch(0.7 0.14 250)");
const LIGHT = seed("theme_00000000000000000000000003", "Light", "oklch(0.98 0.004 75)", "oklch(0.55 0.16 50)");
/** A FOURTH seed the client has never heard of — the no-allowlist plant (#920). If a client-side
 *  shipped-name list ever comes back, this row stops rendering and this file reds. */
const EXTRA_SEED = seed("theme_00000000000000000000000004", "Ember", "oklch(0.2 0.02 20)", "oklch(0.7 0.16 20)");
const CUSTOM_CSS_THEME = {
  id: "theme_owned02",
  name: "With CSS",
  override: { background: "oklch(0.3 0.02 120)", accent: "oklch(0.7 0.1 120)" },
  css: ".orb-thumbnail-canary { outline: 4px solid red; }",
  isSeed: false,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const OWNED = {
  id: "theme_owned01",
  name: "My Theme",
  override: { background: "oklch(0.2 0.02 300)", accent: "oklch(0.7 0.1 300)" },
  css: null,
  isSeed: false,
  isDefault: false,
  createdAt: NOW,
  updatedAt: NOW,
};
const THEMES = [HEARTH, MOCHA, LIGHT, EXTRA_SEED, OWNED, CUSTOM_CSS_THEME];
const SETTINGS_VIEW = {
  userId: "user_ct_theme",
  schemaVersion: 1,
  config: DEFAULT_USER_SETTINGS, // theme.selectedThemeId defaults to null ⇒ Hearth is current
  configUnreadable: null,
  updatedAt: 0,
};
const APPLY_PROC = "settings.updateUserSettingsSection";
/** The same view with MOCHA applied — the mount the Hearth arm needs (see its comment). */
const MOCHA_CURRENT_VIEW = {
  ...SETTINGS_VIEW,
  config: { ...DEFAULT_USER_SETTINGS, theme: { ...DEFAULT_USER_SETTINGS.theme, selectedThemeId: MOCHA.id } },
};

function stub(page: Page, extra: Partial<TrpcRoutes<TrpcProcedurePath>> = {}): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "settings.listThemes": () => THEMES,
    "settings.getUserSettings": () => SETTINGS_VIEW,
    [APPLY_PROC]: () => SETTINGS_VIEW,
    ...extra,
  });
}

test("ONE collection: every theme — seed or owned — renders the SAME cell, and Hearth is current with no explicit selection", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<LooksSectionStory />);
  const collection = component.getByRole("radiogroup", { name: "Theme" });
  // Six themes, six identical cells — no "Your themes" list, no second anatomy (#920's whole ruling).
  await expect(collection.getByRole("radio")).toHaveCount(THEMES.length);
  for (const name of ["Hearth", "Mocha", "Light", "Ember", "My Theme", "With CSS"]) {
    await expect(collection.getByRole("radio", { name, exact: true })).toBeVisible();
  }
  await expect(collection.getByRole("radio", { name: "Hearth", exact: true })).toHaveAttribute("aria-checked", "true");
  // ANATOMY EQUALITY, asserted structurally rather than by eye: a seed's cell and an owned cell expose the
  // same slot set. A provenance badge, a different wrapper, or a re-introduced ListRow all break this.
  // `theme-scope` is EXCLUDED on purpose and is not a hole: it is the clamp boundary a CUSTOM palette must
  // paint through and a seed must NOT (its own arm below pins exactly that), so it is provenance
  // machinery, not anatomy — the user cannot see it.
  const slotsOf = (name: string): Promise<readonly string[]> =>
    collection.getByRole("radio", { name, exact: true }).evaluate((cell) =>
      [...cell.querySelectorAll("[data-slot]")]
        .map((node) => node.getAttribute("data-slot") ?? "")
        .filter((slot) => slot !== "theme-scope")
        .sort((a, b) => a.localeCompare(b)),
    );
  const seedSlots = await slotsOf("Mocha");
  expect(seedSlots.length).toBeGreaterThan(0); // positive control: two empty lists are trivially equal
  expect(seedSlots).toEqual(await slotsOf("My Theme"));
});

// PROVENANCE (#920's theme-engine invariants, verbatim). A thumbnail must paint the row the way SELECTING
// it would paint the app — and for a seed that means its GENERATED block, never its stored override fed
// back through the clamp (which would re-derive and shadow the hand-tuned palette).
test("thumbnail provenance: Hearth stamps nothing, a named seed stamps its block, a custom theme gets a ThemeScope — and no seed gets an override scope", async ({
  mount,
  page,
}) => {
  await stub(page);
  const component = await mount(<LooksSectionStory />);
  const collection = component.getByRole("radiogroup", { name: "Theme" });
  const surfaceOf = (name: string): ReturnType<typeof collection.getByRole> =>
    collection.getByRole("radio", { name, exact: true }).locator('[data-slot="theme-mini-surface"]');

  await expect(surfaceOf("Hearth")).toHaveCount(1);
  await expect(surfaceOf("Hearth")).not.toHaveAttribute("data-theme", /.+/);
  await expect(surfaceOf("Mocha")).toHaveAttribute("data-theme", "mocha");
  await expect(surfaceOf("Light")).toHaveAttribute("data-theme", "light");
  // NO seed cell may carry a clamp scope — that is the shadowing bug in one assertion.
  for (const name of ["Hearth", "Mocha", "Light", "Ember"]) {
    await expect(collection.getByRole("radio", { name, exact: true }).locator('[data-slot="theme-scope"]')).toHaveCount(0);
  }
  // HEARTH REPLAYS THE BASE PALETTE INLINE. Stamping nothing is only "the base palette" at the shell ROOT;
  // nested under a Light or Mocha root it means "inherit the ambient", and a card that paints itself in
  // somebody else's palette is the F2 family. Read as a computed value off the rendered box, not as a class.
  const hearthBackground = await surfaceOf("Hearth").evaluate((box) => getComputedStyle(box).getPropertyValue("--color-background").trim());
  // @orb-waive ct-no-oneshot-live-read-assert(expect): read after the awaited toHaveCount on the same box — inline custom properties are render-time markup
  expect(hearthBackground.length).toBeGreaterThan(0);
  const mochaBackground = await surfaceOf("Mocha").evaluate((box) => getComputedStyle(box).getPropertyValue("--color-background").trim());
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled mount; the two blocks are static CSS
  expect(hearthBackground).not.toBe(mochaBackground);

  // …and a CUSTOM theme is the opposite arm: it paints through the clamp, and stamps no block.
  await expect(collection.getByRole("radio", { name: "My Theme", exact: true }).locator('[data-slot="theme-scope"]')).toHaveCount(1);
  await expect(surfaceOf("My Theme")).not.toHaveAttribute("data-theme", /.+/);
});

// A theme's `css` is GLOBAL OWNER CSS. A thumbnail shows the governed, clamped palette and nothing else —
// injecting a row's stylesheet to render a 100px picture would let a saved theme restyle the settings pane.
test("no thumbnail injects a theme's custom CSS", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<LooksSectionStory />);
  await expect(component.getByRole("radio", { name: "With CSS", exact: true })).toBeVisible();
  const canary = await page.evaluate(() => document.documentElement.innerHTML.includes("orb-thumbnail-canary"));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): read after the awaited toBeVisible on the custom-CSS theme's own cell — an injection would already have happened.
  expect(canary).toBe(false);
});

// ONE SHAPE, DIFFERENT AFFORDANCES (#920): `isSeed` changes the MENU, never the anatomy.
test("a seed's ⋯ offers Apply · Duplicate · Export and NO Delete; an owned theme's adds Edit in builder and Delete", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: themeActionsName("Mocha") }).click();
  for (const item of ["Apply", "Duplicate", "Export"]) {
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  }
  await expect(page.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Edit in builder" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await component.getByRole("button", { name: themeActionsName("My Theme") }).click();
  for (const item of ["Apply", "Edit in builder", "Duplicate", "Export", "Delete"]) {
    await expect(page.getByRole("menuitem", { name: item })).toBeVisible();
  }
});

// APPLY-NOT-MODE (#297): the card IS the applying act, through the real write seam — parameterized over
// the three shipped looks. Hearth writes NULL: the base `@theme`, no `[data-theme]` block, and the
// anti-brick reset in one gesture.
for (const [name, expected] of [
  ["Mocha", MOCHA.id],
  ["Light", LIGHT.id],
  ["Hearth", null],
] as const) {
  test(`picking the ${name} cell applies it — the selectedThemeId patch says ${expected === null ? "null (the base theme)" : "its id"}`, async ({
    mount,
    page,
  }) => {
    // A radio does not re-fire on the ALREADY-CHECKED option (the old `aria-pressed` button did), and the
    // group's value is CONTROLLED by the server read — which the stub holds still. So the Hearth arm, the
    // one that proves the NULL write, mounts with Mocha current instead of clicking its way there.
    const trpc = await stub(page, expected === null ? { "settings.getUserSettings": () => MOCHA_CURRENT_VIEW } : {});
    const component = await mount(<LooksSectionStory />);
    await component.getByRole("radio", { name, exact: true }).click();
    await expect.poll(() => trpc.lastInput(APPLY_PROC), { intervals: [20, 50, 100] }).toEqual({ section: "theme", patch: { selectedThemeId: expected } });
  });
}

// #1671 — THE DEFAULT LOOK IS A FLAG ON THE ROW, NEVER ITS DISPLAY NAME. The view carries `isDefault`
// (derived server-side at the projection, where the sentinel id lives), and the client reads THAT. This
// mount renames the shipped default row — a rename the owner can ship at any time, and one that changes
// nothing about which row `selectedThemeId: null` resolves to — and asserts both halves of the predicate
// survive it: the card reads as current, and picking it still writes NULL rather than its id. Against the
// pre-#1671 client, which compared `theme.name` to a mirrored "Hearth" literal, this mount renders NO
// current card at all on the DEFAULT setting (the state most users are in) and writes the id instead.
test("a RENAMED default look is still the current card, and still applies as NULL", async ({ mount, page }) => {
  const renamedDefault: SeedView = { ...HEARTH, name: "Home fire" };
  const trpc = await routeTrpc(page, {
    // The default row is NOT first: a name predicate that matches nothing falls through to `themes[0]`,
    // so a first-position default would hide the defect behind the fallback.
    "settings.listThemes": () => [MOCHA, renamedDefault, LIGHT],
    "settings.getUserSettings": () => SETTINGS_VIEW, // selectedThemeId: null ⇒ the default row is current
    [APPLY_PROC]: () => SETTINGS_VIEW,
  });
  const component = await mount(<LooksSectionStory />);
  const collection = component.getByRole("radiogroup", { name: "Theme" });
  await expect(collection.getByRole("radio")).toHaveCount(3);
  const currentCell = collection.getByRole("radio", { name: "Home fire", exact: true });
  await expect(currentCell).toHaveAttribute("aria-checked", "true");
  await expect(currentCell.locator('[data-slot="picker-cell-meta"]')).toHaveText("current");
  await expect(collection.getByRole("radio", { name: "Mocha", exact: true }).locator('[data-slot="picker-cell-meta"]')).toHaveCount(0);
  // …and the builder door names the row the collection actually says is current.
  await expect(component.getByRole("button", { name: "New theme from Home fire…" })).toBeVisible();
  // The write half: apply it from the ⋯ (a radio does not re-fire on the already-checked option).
  await component.getByRole("button", { name: themeActionsName("Home fire") }).click();
  await page.getByRole("menuitem", { name: "Apply" }).click();
  await expect.poll(() => trpc.lastInput(APPLY_PROC), { intervals: [20, 50, 100] }).toEqual({ section: "theme", patch: { selectedThemeId: null } });
});

test("an owned theme's Apply patches through the real write seam", async ({ mount, page }) => {
  const trpc = await stub(page);
  const component = await mount(<LooksSectionStory />);
  await component.getByRole("button", { name: themeActionsName("My Theme") }).click();
  await page.getByRole("menuitem", { name: "Apply" }).click();
  await expect.poll(() => trpc.lastInput(APPLY_PROC), { intervals: [20, 50, 100] }).toEqual({ section: "theme", patch: { selectedThemeId: OWNED.id } });
});

// ── The deferred mint (O-8), re-pinned on the ONE builder door: "New theme from Hearth…" duplicates the
//    CURRENT look at the FIRST REAL EDIT, never on the click.

test("builder door + zero edits + Back mints NOTHING — no row ever existed", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.duplicateTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: "New theme from Hearth…" }).click();
  await expect(component.getByRole("textbox", { name: "Theme name" })).toBeVisible();
  await expect(component.locator('[data-slot="autosave-status"]')).toHaveText("Draft — edit to create");
  await component.getByRole("button", { name: "← Back to Looks" }).click();
  await expect(component.getByRole("radio", { name: "My Theme", exact: true })).toBeVisible();

  // @orb-waive ct-no-oneshot-live-read-assert(expect): read after the list re-rendered; a mint could only have fired during the torn-down session.
  expect(trpc.count("settings.duplicateTheme")).toBe(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): same settled barrier — either mint landing would be the same defect.
  expect(trpc.count("settings.createTheme")).toBe(0);
});

test("the first real edit mints the copy of the CURRENT look — and the autosave patches THAT row", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.duplicateTheme": () => OWNED, "settings.updateTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: "New theme from Hearth…" }).click();
  await component.getByRole("textbox", { name: "Theme name" }).fill("Hearth but mine");

  await expect.poll(() => trpc.lastInput("settings.duplicateTheme"), { intervals: [20, 50, 100] }).toEqual({ id: HEARTH.id });
  await expect
    .poll(() => trpc.lastInput("settings.updateTheme"), { intervals: [50, 100, 200] })
    .toMatchObject({ id: OWNED.id, input: { name: "Hearth but mine" } });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): reads AFTER the awaited updateTheme poll settled — no further mint can arrive from this edit.
  expect(trpc.count("settings.duplicateTheme")).toBe(1);
});

test("Edit in builder autosaves an OWNED row — no Save button, no mint", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.updateTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: themeActionsName("My Theme") }).click();
  await page.getByRole("menuitem", { name: "Edit in builder" }).click();
  const nameField = component.getByRole("textbox", { name: "Theme name" });
  await expect(nameField).toBeVisible();
  await expect(component.getByRole("button", { name: "Save theme" })).toHaveCount(0);

  await nameField.fill("My Theme, retouched");
  await expect
    .poll(() => trpc.lastInput("settings.updateTheme"), { intervals: [50, 100, 200] })
    .toMatchObject({ id: OWNED.id, input: { name: "My Theme, retouched" } });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): after the settled update — an owned edit must never mint.
  expect(trpc.count("settings.duplicateTheme")).toBe(0);
});

test("Delete does not destroy immediately — it opens an AlertDialog confirm (F4)", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.removeTheme": () => null });
  const component = await mount(<LooksSectionStory />);
  await component.getByRole("button", { name: themeActionsName("My Theme") }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect(page.getByText("Delete this theme?")).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): reads AFTER the awaited alertdialog assertions; the still-open confirm makes a later fire impossible.
  expect(trpc.count("settings.removeTheme")).toBe(0);
});

test("Export downloads the row's own bytes; Import feeds createTheme the parsed file", async ({ mount, page }) => {
  const trpc = await stub(page, { "settings.createTheme": () => OWNED });
  const component = await mount(<LooksSectionStory />);

  await component.getByRole("button", { name: themeActionsName("My Theme") }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("menuitem", { name: "Export" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("My Theme.orbtheme.json");
  const path = await download.path();
  const exported: unknown = JSON.parse(readFileSync(path, "utf8"));
  expect(exported).toEqual({ name: OWNED.name, override: OWNED.override, css: null });

  // Import the SAME bytes back — the round-trip is identity at the create input.
  const file = join(tmpdir(), "cbc34-looks-import-fixture.json");
  writeFileSync(file, JSON.stringify({ name: "Weft", override: OWNED.override, css: null }));
  const chooserPromise = page.waitForEvent("filechooser");
  await component.getByRole("button", { name: "Import a theme file" }).click();
  await (await chooserPromise).setFiles(file);
  await expect.poll(() => trpc.lastInput("settings.createTheme"), { intervals: [50, 100, 200] }).toEqual({ name: "Weft", override: OWNED.override });
});

// ── #1100 (re-drive G1): the section must not walk out from under the pointer ────────────────────────
// MEASURED on the live stack before the fix, with a real click on the Appearance group row: the pane
// painted with NO Looks heading and a one-line "Loading your themes…" gloss, then the collection landed
// ~230ms later and pushed everything below it down — `[cls] shift 0.1624 input-adjacent · <section> moved
// 0px,365px · observed 0.2094`. Two things were wrong and both are pinned here: the section CHROME lived
// inside the suspending body (so the heading and its `configAnchorId` jump target did not exist during the
// read), and the boundary was unkeyed (so nothing held the box). The tail sentinel is the assertion that
// matters — it is what a user is reading when the pane jumps.

test("#1100 reopening Looks holds its box: the heading stays, the boundary reserves the measured height, and nothing below it moves", async ({
  mount,
  page,
}) => {
  const hold = trpcHold();
  let reads = 0;
  // First open answers; the SECOND read is parked, which is the pending arm a user sees on the way back in.
  const trpc = await stub(page, { "settings.listThemes": () => (reads++ === 0 ? THEMES : hold) });
  const component = await mount(<LooksSectionReopenStory />);
  await expect(component.getByRole("radiogroup", { name: "Theme" })).toBeVisible();

  const tail = component.getByTestId("looks-tail");
  const settledY = (await tail.boundingBox())?.y;
  expect(settledY, "the tail sentinel has no box").not.toBeUndefined();

  await component.getByRole("button", { name: "reopen" }).click();
  await hold.requested;

  // The chrome is OUTSIDE the read: a jump target that does not exist until a query lands is not a jump
  // target, and the pane's first paint used to start at the NEXT section's heading.
  await expect(component.getByRole("heading", { name: "Looks" })).toBeVisible();
  await expect(page.getByText("Loading your themes…")).toHaveCount(0);
  // The reservation is this DEVICE's own measurement from the first open, not a declared constant.
  const reserved = page.locator("[data-tile-reserved]");
  await expect(reserved).toHaveAttribute("data-tile-reserve-source", "measured");
  const heldY = (await tail.boundingBox())?.y ?? Number.NaN;
  // ±1px: the store keeps sub-pixel heights and the reserved `blockSize` is rounded.
  expect(Math.abs(heldY - (settledY ?? Number.NaN)), "the pane jumped while the themes read was in flight").toBeLessThanOrEqual(1);

  hold.release(THEMES);
  await expect(component.getByRole("radiogroup", { name: "Theme" })).toBeVisible();
  const afterY = (await tail.boundingBox())?.y ?? Number.NaN;
  expect(Math.abs(afterY - (settledY ?? Number.NaN)), "the pane jumped when the themes read landed").toBeLessThanOrEqual(1);
  // Two genuine reads — a cached second open would make the whole pin vacuous.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): read after the released collection re-rendered; the story issues no third read.
  expect(trpc.count("settings.listThemes")).toBe(2);
});

test("at the 430px pushed-pane width the collection collapses to one column and the builder door stays inside", async ({ mount, page }) => {
  await stub(page);
  const component = await mount(<LooksSectionNarrowStory />);
  const host = page.getByTestId("looks-narrow-host");
  await expect(host).toBeVisible();
  const hostBox = await host.boundingBox();
  const door = component.getByRole("button", { name: "New theme from Hearth…" });
  await expect(door).toBeVisible();
  const doorBox = await door.boundingBox();
  expect(doorBox, "builder door has no box").not.toBeNull();
  expect(doorBox === null || hostBox === null ? -1 : hostBox.x + hostBox.width - (doorBox.x + doorBox.width), "door overhangs the host").toBeGreaterThan(-1);
});
