// CT: databank's HOME tile (databank-surface-spec D-7 — "recent documents + an ingest-health line"),
// mounted through the REAL `HomeSurface` over the REAL data layer (routeTrpc-stubbed `databank.list`).
//
// What this pins, beyond "it renders":
//   · the HEALTH LINE is a DERIVATION of the same counts the rows carry — passages (embedded, i.e. what
//     retrieval can actually reach) rather than chunks, and one chip per non-ready phase, worst first. The
//     shared fixture bank holds exactly one document in each of the four states, so a summary that counted
//     documents-instead-of-passages, dropped the stall, or ordered by nothing would all read differently;
//   · READY is the ABSENCE of a chip on a row here too (§6.1) — the tile does not re-litigate the ruling;
//   · a row click writes BOTH stores (databank's selection + the shell's section) — asserted on the
//     `<output>` probe, never on a rendered echo;
//   · the EMPTY bank teaches the first step (empty-states-are-load-bearing) and shows no health line;
//   · at the NARROWEST real host (390px content) the health chips stay INSIDE the tile card — a chip
//     clipped out of the box is the one thing this tile exists to say.

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankHomeTileNarrowStory, DatabankHomeTileStory } from "../_ct-stories.tsx";
import { INDEXING_DOC, READY_DOC, stubDatabank } from "../fixtures.ts";

const TILE = '[data-home-tile="databank.documents"]';

test("the health line counts PASSAGES and chips every non-ready phase, worst first", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  // Four documents; 12 + 22 + 0 + 0 embedded chunks. Passages, not chunks: the INDEXING doc has 39 chunks
  // and only 22 of them are reachable, so a chunk count here would over-promise what a chat can pull.
  await expect(tile.getByText("4 documents · 34 passages indexed")).toBeVisible();

  // Worst first: the wedged job, then the file that extracted to nothing, then the one still running —
  // and then the ROWS' own chips in list order (the READY row contributing none). Asserted as ONE ordered
  // set so the health summary can never disagree with the rows it sits above.
  const chips = tile.locator('[data-slot="badge"]');
  await expect(chips).toHaveText(["1 stalled", "1 empty", "1 indexing", "Indexing", "Empty", "Stalled"]);
});

test("a READY row carries no phase chip; a non-ready row carries its own", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  const ready = tile.getByRole("listitem").filter({ hasText: READY_DOC.name });
  const indexing = tile.getByRole("listitem").filter({ hasText: INDEXING_DOC.name });

  await expect(ready).toContainText("Upload · 24.5 KB · 12 chunks");
  await expect(ready.locator('[data-slot="badge"]')).toHaveCount(0);
  await expect(indexing.locator('[data-slot="badge"]')).toHaveText(["Indexing"]);
});

test("opening a recent document writes BOTH stores — the selection and the section", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");
  await expect(probe).toContainText("document=none");

  await home.locator(TILE).getByRole("button", { name: READY_DOC.name }).click();

  await expect(probe).toContainText(`document=${READY_DOC.id}`);
  await expect(probe).toContainText("section=databank");
});

test("the trailing action goes to the library — assert the STORE, not a rendered echo", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");
  await expect(probe).not.toContainText("section=databank");

  await home.locator(TILE).getByRole("button", { name: "All documents →" }).click();

  await expect(probe).toContainText("section=databank");
});

test("an EMPTY bank teaches the first step instead of claiming a health it has no data for", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": () => [] });
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  await expect(tile.getByText("No documents yet")).toBeVisible();
  await expect(tile.getByRole("button", { name: "Add your first document" })).toBeVisible();
  // No health line, and no rows: an empty bank has no passages to report and nothing to be honest about
  // except that it is empty.
  await expect(tile.getByText("documents ·")).toHaveCount(0);
  await expect(tile.getByRole("listitem")).toHaveCount(0);
});

// A bank AFTER A BAD REINDEX — the state that actually stresses the health line: every non-ready phase
// populated at two digits, so the line carries a long datum AND four chips. Measured: the four-state
// fixture bank fits on one line at 390px, so a containment assertion over IT cannot fail (verified by
// planting `flex-nowrap`, which still passed). This bank is what makes the wrap load-bearing.
function crowdedRows(count: number, offset: number, over: Record<string, number>): readonly object[] {
  return Array.from({ length: count }, (_, i) => ({ ...READY_DOC, id: `document_${String(offset + i).padStart(20, "0")}`, ...over }));
}

const WEDGED_AGO_MS = 3_600_000;
const CROWDED_BANK = [
  ...crowdedRows(12, 100, { chunkCount: 0, embeddedCount: 0, updatedAt: READY_DOC.updatedAt - WEDGED_AGO_MS }),
  ...crowdedRows(11, 200, { charCount: 0, chunkCount: 0, embeddedCount: 0 }),
  ...crowdedRows(10, 300, { chunkCount: 0, embeddedCount: 0 }),
  ...crowdedRows(13, 400, { chunkCount: 39, embeddedCount: 22 }),
];

test("at the narrowest real host a crowded health line WRAPS — every chip stays inside the card", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": () => CROWDED_BANK });
  const home = await mount(<DatabankHomeTileNarrowStory />);

  const tile = home.locator(TILE);
  // Barrier on the SETTLED body first — geometry read while the tile's QueryBoundary is still showing its
  // reserved skeleton measures the skeleton, and `count()` does not auto-wait.
  await expect(tile.getByText("46 documents · 286 passages indexed")).toBeVisible();
  const chips = tile.locator('[data-slot="badge"]');
  await expect(chips.first()).toHaveText("12 stalled");

  const card = await tile.boundingBox();
  expect(card).not.toBeNull();
  const count = await chips.count();
  expect(count).toBeGreaterThan(0);
  const boxes = await Promise.all(Array.from({ length: count }, async (_, i) => await chips.nth(i).boundingBox()));
  for (const chip of boxes) {
    expect(chip).not.toBeNull();
    // The right edge of every chip is inside the card's right edge — a wrapped line, never one running off
    // the box. (Planted control: `flex-nowrap` on either health row REDs this; the inner one did, live.)
    expect((chip?.x ?? 0) + (chip?.width ?? 0)).toBeLessThanOrEqual((card?.x ?? 0) + (card?.width ?? 0));
  }
});
