// CT: the LIBRARY — a collection's CONTENT landing (`config-collection-landing.tsx`), driven through the
// real config host over the real registries.
//
// It owns three things the surface acquired when the owner moved the member rows out of the LIST (#1725):
//
//  1. §5.4 — THE WINDOW'S BOUND IS THE PANE. `COLLECTION_WINDOW_MAX_HEIGHT` was a flat `max-h-96` (384px)
//     because three collapsible bands shared one LIST scroll column; with the library in its own pane the
//     bound is CONTENT's own `overflow-y-auto` box, reached by flex. That is a RANGE property, so it is
//     measured across the width matrix rather than at one point, and the tail is proved REACHABLE (the
//     #1133 stranded-row class): a taller-than-384px window that still clipped its last row would pass a
//     height assertion and fail the reader.
//  2. §3.2 — THE CONTROL ROW, in board 02/04's order: filter · bulk · create · overflow. Every control is
//     contribution-declared DATA, so each pin runs in BOTH directions — the library that declares the field
//     shows the control, the library that does not shows nothing.
//  3. ONE TAG HOME (D271): the tag library, its sort and its prune verb are Corpus Labels now
//     (`tests/client/features/tag/surfaces/labels-list-surface.ct.tsx`), so no library here draws a sort.
//
// WHY THE HOST AND NOT A BARE LANDING MOUNT: the landing's optional-hook calls are only legal because the
// mount is keyed by group id (#1203 P0), and "the overflow is absent for rosters" is a claim about what the
// host draws for a DIFFERENT contribution. A story that mounted one collection's landing directly could
// assert neither.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator, Page } from "@playwright/test";
import type { TrpcFixtureOutput, TrpcRecorder } from "../../../../support/node/route-trpc.ts";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { ConfigHostStory } from "../_ct-stories.tsx";

/** The CONTENT pane — the box whose height the windowed arm now inherits. */
const CONTENT_PANE = '[data-slot="config-content"]';
/** The library's control row (the mock design §3.2). */
const CONTROL_ROW = '[data-slot="collection-control-row"]';
/** The sealed `VirtualList`'s own scroll element — the box the re-bind is about. */
const VIRTUAL_SCROLLER = '[data-slot="virtual-list-scroll"]';

/** The retired cap, restated as a NUMBER the test owns: `max-h-96` resolved to 384px, and every arm of the
 *  matrix must beat it or the bound is still a constant wearing a new name. */
const RETIRED_CAP_PX = 384;

/** One more than `COLLECTION_LARGE_GROUP` (30) is the first size that windows; 60 gives the scroller a real
 *  tail to strand. The count is stated here rather than imported: a test that reads the source constant it
 *  is judging proves only that the source agrees with itself. */
const WINDOWED_SCRIPT_COUNT = 60;

const SCRIPT = {
  id: "regex_script_stripooc",
  name: "strip ooc",
  findRegex: "/^\\s*ooc:.*$/gim",
  replaceString: "",
  enabled: true,
  markdownOnly: false,
  promptOnly: false,
  runOnEdit: false,
  trimStrings: [],
  updatedAt: 1_760_000_000_000,
  substituteRegex: 0,
  placement: ["AI_OUTPUT"],
} satisfies TrpcFixtureOutput<"regex.listScripts">[number];

/** The regex rows render in the order the read returns, so the fixture's last script is the last row. */
const WINDOWED_SCRIPTS = Array.from({ length: WINDOWED_SCRIPT_COUNT }, (_unused, index) => ({
  ...SCRIPT,
  id: `regex_script_${String(index).padStart(3, "0")}`,
  name: `script-${String(index).padStart(3, "0")}`,
}));
/** The row a 384px window strands. */
const LAST_ROW_NAME = `script-${String(WINDOWED_SCRIPT_COUNT - 1).padStart(3, "0")}`;

/** One saved roster — the library that declares NEITHER an import door NOR an action, and therefore the
 *  one that must draw no kebab. It has to be POPULATED to make that claim: a zero-member library renders
 *  the F5 empty arm, which has no control row for a kebab to be missing from. */
const ROSTER = {
  id: "roster_preset_partyone000001",
  name: "The usual party",
  description: "",
  characterCount: 0,
  members: [],
  anchorPersonaId: null,
  hasGroupConfig: false,
  game: null,
  rules: [],
  updatedAt: 1_760_000_000_000,
};

const BOOK = {
  id: "world_book_reach000001",
  name: "The Ninefold Reach",
  description: null,
  createdAt: 1,
  entryCount: 42,
  usage: { characters: 2, personas: 0, chats: 0, global: true, total: 3 },
};
const BOOK_DETAIL = { id: BOOK.id, name: BOOK.name, description: BOOK.description, createdAt: BOOK.createdAt };

function stub(page: Page, scripts: TrpcFixtureOutput<"regex.listScripts"> = [SCRIPT]): Promise<TrpcRecorder> {
  return routeTrpc(page, {
    "rosterPreset.list": () => [ROSTER],
    "settings.getUserSettings": () => ({ userId: "user_ct_config", schemaVersion: 1, config: DEFAULT_USER_SETTINGS, configUnreadable: null, updatedAt: 0 }),
    "settings.listThemes": () => [],
    "sessions.me": { userId: "user_ct_config", handle: "ct_config", globalRole: "user" },
    "regex.listScripts": () => scripts,
    "regex.listGlobal": () => [],
    "regex.listScriptUsage": () => ({ presets: [], characters: [], rooms: [] }),
    "worldInfo.listBooksWithUsage": () => [BOOK],
    "worldInfo.listGlobal": () => [],
    // The BOOK EDITOR's own two reads — the drill-row pin below opens a book, and an unstubbed suspense
    // read resolves `null` and throws INSIDE the boundary, which reads as "the header is missing".
    "worldInfo.getBook": () => BOOK_DETAIL,
    "worldInfo.listEntries": () => [],
    "persona.list": () => [],
    "character.list": () => ({ items: [], nextCursor: null }),
  });
}

/** The rendered height of a locator's first box — polled, because the flex chain settles after the query
 *  the rows suspend on resolves and a same-tick read is a false negative by construction. */
async function heightOf(locator: Locator): Promise<number> {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  return box?.height ?? 0;
}

// ── §5.4 · THE WIDTH MATRIX ──────────────────────────────────────────────────────────────────────────────
//
// THE THREE WIDTHS ARE THE REAL PANE'S RANGE, not round numbers: `ConfigHostStory` docks the LIST at its
// measured 307px default, so a 752/1440/1920 host gives CONTENT 397/1085/1565 — the narrowest real desktop,
// the design frame, and the owner's monitor. A point measurement never proves a range property, and the
// defect this replaces (a constant) is invisible at any single width.
for (const width of [752, 1440, 1920]) {
  test(`the windowed library's scroller is bounded by the PANE, not by 384px — at ${String(width)}px`, async ({ mount, page }) => {
    await stub(page, WINDOWED_SCRIPTS);
    const workspace = await mount(<ConfigHostStory height={900} target="regex" width={width} />);

    const pane = workspace.locator(CONTENT_PANE);
    const scroller = workspace.locator(VIRTUAL_SCROLLER);
    const paneHeight = await heightOf(pane);
    const scrollerHeight = await heightOf(scroller);

    // BEATS THE RETIRED CAP. At a 900px host the pane has ~650px left under the glance, the control row and
    // the insights, so a scroller still measuring 384 is the deleted constant surviving by another route.
    expect(scrollerHeight).toBeGreaterThan(RETIRED_CAP_PX);
    // AND IS STILL BOUNDED — the primitive throws over 3× the viewport, but "not throwing" is a much weaker
    // claim than "inside its pane", which is what makes virtualization real.
    expect(scrollerHeight).toBeLessThanOrEqual(paneHeight);

    // NOTHING PAST THE FOLD IS STRANDED (#1133). The scroller's own bottom edge sits inside the pane's, and
    // scrolling it to the end brings the LAST row — the one a 384px window could never reach — on screen.
    const paneBox = await pane.boundingBox();
    const scrollerBox = await scroller.boundingBox();
    expect((scrollerBox?.y ?? 0) + (scrollerBox?.height ?? 0)).toBeLessThanOrEqual((paneBox?.y ?? 0) + (paneBox?.height ?? 0) + 1);

    await scroller.evaluate((el: Element): void => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(workspace.locator(CONTENT_PANE).getByText(LAST_ROW_NAME, { exact: true })).toBeVisible();
  });
}

// ── §3.2 · THE CONTROL ROW ───────────────────────────────────────────────────────────────────────────────

// THE INTERACTION TESTS RUN AT `INTERACTIVE_WIDTH`, NOT AT 1440 (measured, not guessed): the CT page's
// own viewport is narrower than the design frame, so a control at x≈1400 resolves, reports "visible,
// enabled and stable", and then fails the click with "element is outside of the viewport". The width matrix
// above is the place a 1440/1920 host belongs, because it MEASURES and never clicks.
const INTERACTIVE_WIDTH = 900;

test("the control row reads filter · bulk · create · overflow, left to right", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigHostStory height={900} target="regex" width={INTERACTIVE_WIDTH} />);
  const row = workspace.locator(CONTROL_ROW);
  await expect(row).toBeVisible();

  // GEOMETRY, never DOM order: the board's claim is about what the eye sweeps, and a `Row` with an
  // `ms-auto` anywhere in it could satisfy source order while painting the reverse.
  const filter = await row.getByRole("textbox", { name: "Filter regex scripts" }).boundingBox();
  const bulk = await row.getByRole("button", { name: "Select scripts" }).boundingBox();
  const create = await row.getByRole("button", { name: "New script" }).boundingBox();
  const overflow = await row.getByRole("button", { name: "More library actions" }).boundingBox();
  expect(filter?.x ?? 0).toBeLessThan(bulk?.x ?? 0);
  expect(bulk?.x ?? 0).toBeLessThan(create?.x ?? 0);
  expect(create?.x ?? 0).toBeLessThan(overflow?.x ?? 0);
});

// THE KEBAB IS DRAWN ONLY WHEN IT HAS AN ITEM. Rosters declare no `importFile`, so a
// kebab there would be a control whose one act is to open onto nothing — the capability lie #925's
// must-WORK bar names, and the exact defect an "always draw the overflow" host would ship.
test("the overflow appears for a library with an import door, and NOT for one with neither", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigHostStory height={900} target="regex" width={INTERACTIVE_WIDTH} />);
  const overflow = workspace.locator(CONTROL_ROW).getByRole("button", { name: "More library actions" });
  // Regex declares an IMPORT door.
  await expect(overflow).toBeVisible();

  // World info declares an IMPORT and no action.
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /World Info/ })
    .click();
  await expect(overflow).toBeVisible();

  // Rosters declare neither.
  await workspace
    .locator('[data-slot="config-list"]')
    .getByRole("button", { name: /Rosters/ })
    .click();
  await expect(workspace.locator(CONTROL_ROW)).toBeVisible();
  await expect(overflow).toHaveCount(0);
});

// ── §3.4 · THE DRILL HEADER ──────────────────────────────────────────────────────────────────────────────

test("drilling into a member gets a Back to the library, and the member is named exactly ONCE", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigHostStory height={900} target="worldInfo" width={INTERACTIVE_WIDTH} />);
  const content = workspace.locator(CONTENT_PANE);
  await content
    .getByRole("button", { name: /Ninefold Reach/ })
    .first()
    .click();

  const header = content.locator('[data-slot="config-drill-header"]');
  await expect(header.getByRole("button", { name: "Back to World Info" })).toBeVisible();
  // NO LIFECYCLE CHROME IN A DRILLED HEADER (D212, #271) — Delete stays on the row's kebab.
  await expect(header.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  // EXACTLY ONE HEADING NAMES THE MEMBER, and since #1747 it is IN THIS ROW — the board's single row, made
  // real. The count assertion is the older half of the pin and it survives verbatim: a host heading over
  // four surfaces that each draw their own `h2` printed the name twice and took two unrelated CTs red on a
  // strict-mode violation, which is why the row went to the surface rather than the name to the host.
  await expect(header.getByRole("heading", { name: BOOK.name })).toHaveCount(1);
  await expect(content.getByRole("heading", { name: BOOK.name })).toHaveCount(1);

  // Back is a real exit: it pops the selection and the library is the pane again.
  await header.getByRole("button", { name: "Back to World Info" }).click();
  await expect(workspace.locator(CONTROL_ROW)).toBeVisible();
  await expect(content.locator('[data-slot="config-drill-header"]')).toHaveCount(0);
});

// THE ROW IS ONE ROW (#1747) — boards 03/05/06 draw `← Back to <library>` · the NAME · the member's own
// verbs together, and world info is the collection that has all three: Edit details · New entry (Backfill titles joins them only when a blank title can be filled).
// Before this commit the Back sat alone in a host-drawn row and the name + the verbs were one row lower, on
// the surface's own header. The fix is the member surface OWNING the whole row through its existing
// `detail` render, so the pin is "the verbs are INSIDE the header", not merely "the verbs exist".
test("the drill row carries the member's own verbs beside its name (board 06)", async ({ mount, page }) => {
  await stub(page);
  const workspace = await mount(<ConfigHostStory height={900} target="worldInfo" width={INTERACTIVE_WIDTH} />);
  const content = workspace.locator(CONTENT_PANE);
  await content
    .getByRole("button", { name: /Ninefold Reach/ })
    .first()
    .click();

  const header = content.locator('[data-slot="config-drill-header"]');
  await expect(header.getByRole("button", { name: "Back to World Info" })).toBeVisible();
  await expect(header.getByRole("heading", { name: BOOK.name })).toHaveCount(1);
  // The three verbs the board draws, in the row the board draws them in. `Edit details` is a NAMED button
  // here and was an icon-only pencil whose whole name lived in an `aria-label` — the board names it.
  await expect(header.getByRole("button", { name: "Edit details" })).toBeVisible();
  await expect(header.getByRole("button", { name: "New entry" })).toBeVisible();
  // Still no lifecycle chrome in a drilled header (D212, #271) — the row's kebab owns Delete.
  await expect(header.getByRole("button", { name: /Delete/ })).toHaveCount(0);
  // And the name is stated ONCE on the whole pane, exactly as the pin above requires.
  await expect(content.getByRole("heading", { name: BOOK.name })).toHaveCount(1);
});
