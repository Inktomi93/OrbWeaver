// HOME COLUMN BALANCE (#226, owner-ruled "no shell game — self-balance by construction").
//
// THE DEFECT this pins: home's two columns end at different heights, and WHICH ONE is short CHANGES
// SIDES with the pane width (measured live 2026-08-18 — hearth short by 261px at 1280/1440 and by 108px
// at 1920, shelf short by 106px at 2560), while the READING appearance arm more than doubles the gap.
// Any "move tile X to the other column" fix therefore helps one end of the range and worsens the other,
// which is why the owner refused it: the layout must balance ITSELF at every width and every arm.
//
// SO THIS SPEC IS A MATRIX, NOT A CASE. Four pane widths × three appearance arms, one mount, driven
// entirely from the spec — the story renders the SHIPPED registry (the door's own tile array) in a pane
// whose inline size, `data-density` and `--font-scale` this file sets. Twelve states out of one settle,
// so the reads cannot race and the arms cannot diverge on data.
//
// WHAT IT MEASURES, and why that metric survives the fix. `void` = the vertical distance between the two
// columns' LAST CONTENT BOTTOMS. Today the column box IS its content (the grid is `items-start`), so the
// void is the shorter column's dead tail; after the fix the boxes are equal and the same subtraction
// reports the dead space that is left. One definition, both sides of the change — which is the only way a
// before/after matrix means anything.
//
// `airGap` is the other half of the bar: a fix that removes the tail by pouring ALL of it into the gaps
// between blocks trades an edge void for a broken rhythm. It is the largest gap between two consecutive
// blocks in either column, and it is bounded here too.
//
// THE FENCE IS TWO-SIDED, AND DELIBERATELY NOT ONE BUDGET (the measured fork, ratified 2026-08-18).
// The fix is `cols="leadEven"` — the split's wide-pane breath taken to EVEN tracks — which works by
// letting the SHELF reflow rather than by padding the hearth: the shelf's `cellFixed` face grid goes
// 3-per-row to 6-per-row and its footnote pair goes 2-up. That closes every state where the pane clears
// the `pairWide` step IN THIS ARM'S OWN REM, and nothing below it: at a narrower pane the foot CANNOT go
// 2-up and the face shelf CANNOT gain a column, so the shelf is structurally ~370px taller than the
// hearth and a seven-ratio track sweep moved it only 368px → 313px. Both padding arms were measured and
// refused rather than budgeted around: distributing the slack into the short column's two gaps means
// 208px gaps on defaults and 385px on reading (the `airGap` bound above), and growing its LAST block
// means the 91px section-jump grid becoming a 460px one.
// (#455, 2026-08-22: the doorway group became a collapsed-by-default FOLD, which takes the whole roadmap
// block out of the shelf's DOM at rest. That halves the narrow-pane residual — 396px → 223px on
// 1280/defaults — and closes the 1920 defaults/compact states outright; it does not change the mechanism
// this fence describes, and the residual is still #226's open owner fork.)
// So: the ≤120px bar is asserted exactly where the mechanism can deliver it (`footTracks === 2`, read off
// the rendered layout, never a list of widths), and EVERY state — including the narrow panes the fix does
// not reach — is fenced against its own pre-fix measurement. The narrow-pane residual is an open owner
// fork on #226, with the three rejected structural arms (invert the split · drop `pairWide`'s step ·
// collapse to one column below ~1400px) costed there.

import { DEFAULT_USER_SETTINGS } from "@orb/contracts/settings";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { characterListResponder, makeCharacterSummary } from "../../character/fixtures.ts";
import { CHAT_ROOM_ROUTES, chatListResponder, makeChatSummary } from "../../chat/fixtures.ts";
import { READY_DOC, stubDatabank } from "../../databank/fixtures.ts";
import { HomeBalanceStory } from "../_ct-stories.tsx";

/** A FULL house — each tile's own read limit, i.e. the tallest page the shipped registry can render.
 *  A sparse library shortens both columns together and hides the shape this issue is about. */
const ROOMS = Array.from({ length: 8 }, (_unused, index) =>
  makeChatSummary({
    id: `chat_balance_${String(index)}`,
    lastMessageAt: 1_750_000_000_000 - index,
    participantNames: ["Wren"],
    title: `Room ${String(index)}`,
    updatedAt: 1_750_000_000_000 - index,
  }),
);
const FACES = Array.from({ length: 6 }, (_unused, index) => makeCharacterSummary({ id: `character_balance_${String(index)}`, name: `Face ${String(index)}` }));
const BANK = {
  items: Array.from({ length: 4 }, (_unused, index) => ({ ...READY_DOC, id: `document_0000000000000000000${String(index)}`, name: `Doc ${String(index)}` })),
  nextCursor: null,
  totalCount: 4,
};
const HEALTH = { byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 4, stalled: 0 }, chunks: 48, passages: 48, total: 4 };

/** The desktop shell's rail eats this much of the viewport before home's pane starts (`--dimension-rail`);
 *  home declares BOTH panels unavailable, so the rail is the whole chrome and pane = viewport − rail. */
const RAIL_PX = 56;
/** The viewport widths the issue's live measurements were taken at. */
const WIDTHS = [1280, 1440, 1920, 2560] as const;

/** The appearance points, named as `tooling/src/_shared/appearance-presets.json` names them. Only the two axes
 *  that move HOME's geometry are set: `fontScale` rescales every rem-derived size from the root, and
 *  `density` swaps the four spacing intent tokens. The presets' chat-only keys (chatStyle, avatars,
 *  per-message chips) cannot reach this surface. */
const ARMS = [
  { name: "defaults", fontScale: 1, density: "comfortable" },
  { name: "reading", fontScale: 1.25, density: "comfortable" },
  { name: "compact", fontScale: 1, density: "compact" },
] as const;

/** The bar in the CLOSED regime — a pane wide enough for the shelf's own grids to reflow (see the fence
 *  below). ~120px is a block's worth of breathing room: below it the tail stops reading as an unfinished
 *  column. */
const VOID_BUDGET_PX = 120;
/** …and the fix must not buy that by inflating the rhythm. The two costed padding arms were REFUSED on
 *  exactly this number: pouring the shorter column's slack into its two gaps means 208px gaps on the
 *  defaults arm and 385px on reading, against a 24px section rhythm. Any future arm that pads instead of
 *  reflowing reds here. */
const AIR_GAP_BUDGET_PX = 160;

/** TODAY'S MEASURED VOID, cell by cell, on this instrument at the pre-fix tree (b83b7989a) — the
 *  NEVER-REGRESS half of the fence. It is a table rather than one number because the states differ by
 *  hundreds of px and a single worst-case bound would let eleven of them rot silently. Sub-pixel layout
 *  rounding only in the tolerance; a real improvement is expected to redefine these DOWN.
 *
 *  RE-BASELINED 2026-08-22 (a), UPWARD, and that was a COST being recorded rather than a fence being
 *  loosened (side-eye rail-home P3-6): the doorway teasers stepped up one ramp stop, +28px of SHELF, on the
 *  column #226's open residual already calls ~370px too tall. That row is superseded by (b) below and is
 *  kept only as provenance for why the numbers it raised are now lower than either state.
 *
 *  RE-BASELINED 2026-08-22 (b), DOWNWARD, ELEVEN of twelve cells — #455, owner-ruled: the doorway group is
 *  a FOLD now, collapsed by default, and `CollapsiblePanel` UNMOUNTS its content while closed, so the shelf
 *  genuinely loses the block rather than clipping it. This is the "a real improvement is expected to
 *  redefine these DOWN" case the paragraph above reserves, so the table is ratcheted to what the tree
 *  MEASURES rather than left as slack. It reaches further than the seven open-regime cells #457's ramp
 *  step touched, because the group is also one half of the foot's `pairWide` subgrid — the CLOSED regime
 *  loses it too (2560/reading 228 → 11). The two cells that do not move (2560 defaults/compact) were
 *  already at the sub-pixel floor. What changed for the WORSE: nothing. What this does NOT close: the
 *  1280/1440 open-regime residual is still hundreds of px and is still #226's open owner fork — the fold
 *  roughly halves it (396 → 223 on defaults), it does not resolve it.
 *  Measured on this instrument at the folding commit; `VOID_BUDGET_PX` and `AIR_GAP_BUDGET_PX` untouched.
 *
 *  RE-BASELINED 2026-08-28, UPWARD, ONE cell (1920/defaults 11 → 49) — a COST being recorded, not a fence
 *  loosened. The plugin UI train added the `extensions` section to `SECTION_IDS`, and the home
 *  landing's `SectionJumpRail` renders one pill PER registry section (minus home + tile-claimed) — so the
 *  flex-wrap rail gained a pill, and at 1920/defaults (pane 1864px) that pill tips the rail to a second row,
 *  +38px on the HEARTH's `home.jump` block (91px, vs 53px at the wider 2560 pane where it still fits one
 *  row). The cell stays in the CLOSED regime (footTracks === 2) and 49px is well inside `VOID_BUDGET_PX`
 *  (≤120px), so the columns still end level by the bar this fence states — only the never-regress row is
 *  stale, because the shipped registry it measures against is now one section longer. */
const BASELINE_VOID_PX: Readonly<Record<string, number>> = {
  "1280/defaults": 223,
  "1280/reading": 540,
  "1280/compact": 237,
  "1440/defaults": 223,
  "1440/reading": 540,
  "1440/compact": 273,
  "1920/defaults": 49,
  "1920/reading": 328,
  "1920/compact": 3,
  "2560/defaults": 11,
  // RE-BASELINED 2026-09-02, UPWARD, ONE cell (11 → 15) — a COST being recorded, not a fence loosened,
  // in the same form as the 1920/defaults row above, and it is TYPE METRICS rather than layout.
  //
  // THE RECEIPT THAT SAYS WHICH. Two readings, taken in one run of this instrument with the grid forced
  // to the PRE-FIX layout (`lead`'s `1.5fr 1.05fr`) beside the shipped one. (1) At 1920/reading the two
  // layouts are IDENTICAL (`footTracks === 1`, so `lead` and `leadEven` resolve the same tracks) and the
  // cell measures 279 against this map's recorded 328 — 49px of movement with no layout change at all,
  // which can only be block heights. (2) At THIS cell the pre-fix layout measures 226 today, against the
  // header's own "2560/reading 228 → 11" — so the fix is still doing exactly what it was recorded doing
  // (226 → 15), and the drift is in the 11, not in the fence.
  //
  // WHAT MOVED THE HEIGHTS: `ed55bf193` (2026-09-01) put every leading on an integer line box
  // (docs/law/integer-line-boxes.md) — `--leading-title` from the ratio 1.35 to `round(1.375rem, 1px)`,
  // `--leading-body` to `round(1.4375rem, 1px)`, plus the newly minted `leading-label-relaxed` the `prose`
  // modifier now takes. The READING arm multiplies every one of them by `--font-scale: 1.25`, which is why
  // it moves most and why the same pass also moved `chat.quickPicks`'s declared box (374 → 376, #1144).
  // Measured identical (975 / 960, void 15) on the UNMODIFIED tree before #1128/#1120/#1130/#1121 landed,
  // so this is not that lane's cost either.
  //
  // THE CELL IS NOT LEFT UNGUARDED, which is the only reason an upward move is legitimate here: it is in
  // the CLOSED regime (`footTracks === 2`), so `VOID_BUDGET_PX` (120) is the binding fence and 15px sits
  // an order of magnitude inside it. `VOID_BUDGET_PX` and `AIR_GAP_BUDGET_PX` are untouched.
  "2560/reading": 15,
  "2560/compact": 3,
};
const BASELINE_TOLERANCE_PX = 2;

/** Every state the bar is stated over — the matrix itself, built once so the probe and the report agree. */
const CELLS = WIDTHS.flatMap((width) => ARMS.map((arm) => ({ width, arm })));
type Cell = (typeof CELLS)[number] & { readonly metrics: BalanceMetrics };

interface ColumnMetrics {
  readonly contentBottom: number;
  readonly maxGap: number;
  /** `id:height` per block, in paint order — the diagnostic that says WHICH block a state's air is in. */
  readonly blocks: string;
}
interface BalanceMetrics {
  readonly hearth: ColumnMetrics;
  readonly shelf: ColumnMetrics;
  readonly void: number;
  readonly airGap: number;
  /** How many tracks the shelf's FOOTNOTE subgrid resolved to — the regime discriminator, read off the
   *  rendered layout rather than listed here. Two tracks means the pane cleared the `pairWide` step IN
   *  THIS ARM'S OWN REM (the reading arm's `--font-scale` pushes 100rem out to a 2000px pane), which is
   *  the same condition under which the face shelf has the width to reflow — i.e. the shelf can answer
   *  the hearth's height. One track means it structurally cannot, and no track ratio changes that. */
  readonly footTracks: number;
}

/** Reads both columns out of the RENDERED grid. The hearth is the grid's first track child and the shelf
 *  carries `data-home-shelf` — the surface's own two column boxes, not a re-declaration of the split. */
function measure(page: Page): Promise<BalanceMetrics> {
  return page.locator("[data-home-grid]").evaluate((grid): BalanceMetrics => {
    const read = (column: Element | null): ColumnMetrics => {
      const children = [...(column?.children ?? [])]
        .map((child) => ({ rect: child.getBoundingClientRect(), id: child.getAttribute("data-home-tile") ?? child.tagName.toLowerCase() }))
        .filter((entry) => entry.rect.height > 0);
      const sorted = [...children].sort((a, b) => a.rect.top - b.rect.top);
      const gaps = sorted.slice(1).map((entry, index) => entry.rect.top - (sorted[index]?.rect.bottom ?? entry.rect.top));
      return {
        contentBottom: Math.max(...sorted.map((entry) => entry.rect.bottom), 0),
        maxGap: Math.max(...gaps, 0),
        blocks: sorted.map((entry) => `${entry.id}:${entry.rect.height.toFixed(0)}`).join(","),
      };
    };
    const hearth = read(grid.firstElementChild);
    const shelf = read(grid.querySelector("[data-home-shelf]"));
    const foot = grid.querySelector("[data-home-shelf-foot]");
    return {
      hearth,
      shelf,
      void: Math.abs(hearth.contentBottom - shelf.contentBottom),
      airGap: Math.max(hearth.maxGap, shelf.maxGap),
      // The COMPUTED value is normalized to single-space-separated px lengths, so a plain split is the
      // track count (a regex literal cannot live here — this body is serialized into the page).
      footTracks: foot === null ? 0 : globalThis.getComputedStyle(foot).gridTemplateColumns.trim().split(" ").length,
    };
  });
}

/** Puts the page into one matrix cell: the appearance arm on the root + the pane's own inline size. */
async function setState(page: Page, width: number, arm: (typeof ARMS)[number]): Promise<void> {
  await page.evaluate(
    ({ pane, scale, density }) => {
      document.documentElement.style.setProperty("--font-scale", String(scale));
      const host = document.querySelector("[data-home-pane]");
      host?.setAttribute("data-density", density);
      (host as HTMLElement | null)?.style.setProperty("inline-size", `${String(pane)}px`);
    },
    { pane: width - RAIL_PX, scale: arm.fontScale, density: arm.density },
  );
}

test("#226 the shelf stops deciding the page's height — level columns wherever it can reflow, never worse anywhere", async ({ mount, page }) => {
  await page.setViewportSize({ width: 2560, height: 1000 });
  await stubDatabank(page, {
    "chat.listChats": chatListResponder(ROOMS),
    "chat.getChat": CHAT_ROOM_ROUTES["chat.getChat"],
    "chat.reapTemporaryChats": { reaped: 0 },
    "character.list": characterListResponder(FACES),
    "databank.bankHealth": HEALTH,
    "databank.list": BANK,
    "settings.getUserSettings": { config: DEFAULT_USER_SETTINGS, configUnreadable: null, schemaVersion: 1, updatedAt: 0, userId: "user_ct_balance" },
  });

  const home = await mount(<HomeBalanceStory />);
  // SETTLED, never "not busy": barrier on rendered content from every tile that reads, so the matrix
  // below cannot be measured between two tiles' commits.
  const grid = home.locator("[data-home-grid]");
  await expect(grid.locator('[data-home-hearth="chat_balance_0"]')).toBeVisible();
  await expect(grid.getByRole("list", { name: "Character quick-picks" })).toBeVisible();
  await expect(grid.getByText("Start a temp chat")).toBeVisible();
  await expect(grid.getByText("Doc 0", { exact: true })).toBeVisible();
  await expect(grid.locator("[aria-busy]")).toHaveCount(0);

  // Every cell mutates the same live page, so each state must settle before the next is probed.
  const cells: Cell[] = [];
  for (const { width, arm } of CELLS) {
    await setState(page, width, arm);
    cells.push({ width, arm, metrics: await measure(page) });
  }

  const matrix = cells.map(({ width, arm, metrics }) => {
    const short = metrics.hearth.contentBottom < metrics.shelf.contentBottom ? "hearth" : "shelf";
    return `${String(width)}\t${arm.name}\thearth=${metrics.hearth.contentBottom.toFixed(0)}\tshelf=${metrics.shelf.contentBottom.toFixed(0)}\tvoid=${metrics.void.toFixed(0)}\tshort=${short}\tairGap=${metrics.airGap.toFixed(0)}\tfootTracks=${String(metrics.footTracks)}\twas=${String(BASELINE_VOID_PX[`${String(width)}/${arm.name}`] ?? 0)}\thearthBlocks=[${metrics.hearth.blocks}]\tshelfBlocks=[${metrics.shelf.blocks}]`;
  });
  const failures = cells.flatMap(({ width, arm, metrics }) => {
    const state = `${String(width)}/${arm.name}`;
    const baseline = BASELINE_VOID_PX[state] ?? 0;
    return [
      // THE CLOSED REGIME — the pane cleared the footnote pair's step in this arm's own rem, so the shelf
      // has the width to answer the hearth. Here the columns must actually end level.
      ...(metrics.footTracks === 2 && metrics.void > VOID_BUDGET_PX
        ? [`${state}: the shelf can reflow here and still ends ${metrics.void.toFixed(0)}px off (budget ${String(VOID_BUDGET_PX)})`]
        : []),
      // NEVER REGRESS — stated over every state, including the narrow panes the fix cannot close. This is
      // what stops a future "improvement" from paying for a wide pane with a worse narrow one.
      ...(metrics.void > baseline + BASELINE_TOLERANCE_PX
        ? [`${state}: void ${metrics.void.toFixed(0)}px is WORSE than the pre-fix tree's ${String(baseline)}px`]
        : []),
      ...(metrics.airGap > AIR_GAP_BUDGET_PX
        ? [`${state}: a ${metrics.airGap.toFixed(0)}px gap opened between two blocks (budget ${String(AIR_GAP_BUDGET_PX)})`]
        : []),
    ];
  });
  // The whole matrix is printed on PASS as well as fail — it is the issue's before/after table.
  console.info(`\n#226 home column balance\n${matrix.join("\n")}\n`);
  expect(failures, failures.join("\n")).toEqual([]);
});
