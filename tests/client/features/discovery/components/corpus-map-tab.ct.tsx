// CT: the Corpus CONTEXT "Map" tab's GENRE KEY (side-eye corpus re-pass B5).
//
// THE DEFECT: the tab said "colored by genre" over ~8px dots in five hues and named no genre anywhere, with
// ~350px of empty panel below the plot. The meaning was carried by COLOUR ALONE — the accessibility failure
// and the reason the chart answered nothing.
//
// WHY THE ASSERTIONS ARE DOM TEXT, NOT PIXELS: `<Scatter>` is an ECharts CANVAS behind the @orb/ui seal, so
// nothing inside the plot is queryable and a text assertion about it would be speaking for the frame, not
// the points. The key is real DOM precisely so a reader — and a screen reader — can decode the plot at all;
// these tests read the key, and say so.
//
// THE KEY IS THE PRIMITIVE'S (`<Scatter legend>`), not this tab's: ui owns the palette, so the swatch is the
// same resolved stop the canvas painted with rather than a colour matched by convention — and a feature may
// not paint a raw element at all. This tab's half is passing `legend` and capping the series count.
//
// The swatch is deliberately NOT asserted by colour: it is `aria-hidden` decoration, and the row's own words
// are the datum. What IS pinned is that a genre never appears twice in the key, because the ramp wraps at
// five series and the "Other" pool used to be the sixth (see `corpus-charts.ts`'s cap).

import { expect, test } from "@playwright/experimental-ct-react";
import { routeTrpc } from "../../../../support/node/route-trpc.ts";
import { CorpusMapTabStory } from "../_ct-stories.tsx";

/** Six genres + a genre-less card: more than the ramp can name, which is what makes the pool a series. */
const POINTS = [
  { characterId: "character_a", name: "Aria", x: 0.1, y: 0.2, genre: "fantasy" },
  { characterId: "character_b", name: "Brin", x: 0.2, y: 0.1, genre: "fantasy" },
  { characterId: "character_c", name: "Cass", x: 0.3, y: 0.4, genre: "noir" },
  { characterId: "character_d", name: "Dov", x: 0.4, y: 0.3, genre: "scifi" },
  { characterId: "character_e", name: "Eze", x: 0.5, y: 0.6, genre: "romance" },
  { characterId: "character_f", name: "Fen", x: 0.6, y: 0.5, genre: "horror" },
  { characterId: "character_g", name: "Gil", x: 0.7, y: 0.8, genre: null },
];

/** The key's rows as text: the swatch renders no text, so a row reads as its genre then its point count.
 *  SENTENCE-CASED (P3-C): the key printed the distiller's raw token until 2026-08-19, while the section's
 *  other three facet consumers already spoke through `facetLabel`. The stored value is untouched. */
const KEY_ROWS = ["Fantasy2", "Noir1", "Scifi1", "Romance1", "Other2"];
/** The key's accessible name is the chart's own label plus "key" (the primitive composes it). */
const KEY_NAME = "Corpus semantic map key";

test("the map carries a genre KEY, and every series in it is named", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.corpusProjection": POINTS });
  const component = await mount(<CorpusMapTabStory />);

  const key = component.getByRole("list", { name: KEY_NAME });
  await expect(key).toBeVisible();
  // Four named genres (frequency-descending) + the pool. Each row states the genre AND its count, so the
  // key is readable with no colour perception at all.
  await expect(key.getByRole("listitem")).toHaveText(KEY_ROWS);
});

// ── P3-9: THE PANEL HAS NO DEAD FOOT ─────────────────────────────────────────────────────────────────
// The plot was `aspect-square`, so at the CONTEXT pane's 420px width it drew a 420px box in a ~640px panel
// and left ~270px of nothing under its key. The story host is the panel: 420x640, a block box, which is the
// same shape the real tab body is (`context-tabs-panel.tsx` renders each panel as an overflow scroller, not
// a flex column) — so the fix has to be one that works without a flex parent, and this mount is the proof.
/** How much of the panel's height may go unused at the foot. A section gap is the honest allowance. */
const DEAD_FOOT_TOLERANCE_PX = 32;
const PANEL_HEIGHT_PX = 640;

test("the semantic map FILLS its panel instead of leaving a square and a void (P3-9)", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.corpusProjection": POINTS });
  const component = await mount(<CorpusMapTabStory />);
  await expect(component.getByRole("list", { name: KEY_NAME })).toBeVisible();

  const host = await component.boundingBox();
  const plot = await component.locator("[data-slot=scatter]").boundingBox();
  if (host === null || plot === null) {
    throw new Error("the map tab did not render its host or its plot");
  }
  const dead = host.y + PANEL_HEIGHT_PX - (plot.y + plot.height);
  expect(dead, `the plot leaves ${Math.round(dead)}px of the panel unused below it`).toBeLessThanOrEqual(DEAD_FOOT_TOLERANCE_PX);
});

// ── P2-A: THE PLOT IS THE PANEL'S, AND SO IS THE CANVAS ───────────────────────────────────────────────
// The P3-9 test above measures the FRAME, which is exactly why it stayed green through the regression: the
// frame was tall while the canvas inside it was a 100px strip (`height="100%"` resolving against an
// auto-height wrapper — fixed in `packages/ui/src/charts/chart/chart.tsx`). This is the same claim taken to
// the pixels the reader actually looks at, at the CONTEXT pane's real shape.
/** The share of the panel the CANVAS must take. Measured after the fix: 557px of this 640px panel (87%),
 *  the other 83px being the gloss, the frame heading and the genre key — so this floor carries real
 *  headroom rather than transcribing today's layout. Before the fix the same canvas was 100px. */
const CANVAS_PANEL_SHARE = 0.5;

test("the semantic map's CANVAS fills the panel, not a 100px strip (P2-A)", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.corpusProjection": POINTS });
  const component = await mount(<CorpusMapTabStory />);
  await expect(component.getByRole("list", { name: KEY_NAME })).toBeVisible();

  const canvas = component.locator("canvas");
  await expect(canvas).toBeVisible();
  await expect
    .poll(async () => (await canvas.boundingBox())?.height ?? 0, { intervals: [20, 50, 100, 200] })
    .toBeGreaterThanOrEqual(PANEL_HEIGHT_PX * CANVAS_PANEL_SHARE);
});

test("no genre is named twice — the key cannot hand two rows the same swatch", async ({ mount, page }) => {
  await routeTrpc(page, { "discovery.corpusProjection": POINTS });
  const component = await mount(<CorpusMapTabStory />);

  const rows = component.getByRole("list", { name: KEY_NAME }).getByRole("listitem");
  const names = await rows.allInnerTexts();
  expect(new Set(names).size, "a repeated row would mean the ramp wrapped and two series share a colour").toBe(names.length);
  expect(names.length, "the series count is capped at the ramp's five stops, pool included").toBeLessThanOrEqual(5);
});
