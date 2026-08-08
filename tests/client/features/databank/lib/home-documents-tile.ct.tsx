// CT: databank's HOME tile (databank-surface-spec D-7 — "recent documents + an ingest-health line"),
// mounted through the REAL `HomeSurface` over the REAL data layer (routeTrpc-stubbed `databank.list`).
//
// What this pins, beyond "it renders":
//   · the HEALTH LINE is a DERIVATION of the same counts the rows carry — passages embedded OF passages
//     that exist, so a half-embedded bank cannot read as finished;
//   · an aggregate chip appears ONLY for what the rows do not already show, and when it appears it is a
//     CONTROL that scopes the library to that phase and goes there (the store, not a rendered echo);
//   · READY is the ABSENCE of a chip on a row here too (§6.1) — the tile does not re-litigate the ruling;
//   · the EMPTY bank opens the ingest CEREMONY (the shell modal slot), not a section, and drops the
//     "All documents →" link rather than promising a list of nothing;
//   · the tile SUBSUMES its jump row — beside the real jump grid, Databank appears once;
//   · at the NARROWEST real host (390px content) the health chips stay INSIDE the tile card.

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankHomeTileNarrowStory, DatabankHomeTileStory, DatabankHomeTileWithJumpGridStory } from "../_ct-stories.tsx";
import { INDEXING_DOC, READY_DOC, stubDatabank } from "../fixtures.ts";

const TILE = '[data-home-tile="databank.documents"]';

// A bank AFTER A BAD REINDEX — the state the aggregates exist for: every non-ready phase populated at two
// digits, far past the four rows the tile renders. (The four-state fixture bank is fully VISIBLE in those
// rows, which is exactly why it must produce no aggregates at all — the test below pins that.)
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

test("the health line counts embedded passages OF the passages that exist", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  // 12 of 12 + 22 of 39 + 0 + 0. "34 passages indexed" alone would read as a finished count on a bank
  // that is 17 passages short of it.
  await expect(tile.getByText("4 documents · 34 of 51 passages indexed")).toBeVisible();
});

test("no aggregate chip for a phase the ROWS already show — only the rows' own chips render", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  await expect(tile.getByText("4 documents · 34 of 51 passages indexed")).toBeVisible();
  // The bank is four documents and the tile renders four rows, so every non-ready phase is already named
  // ON a row. The badges present are therefore exactly the row chips, in list order (READY contributes
  // none) — an aggregate here would be the same fact twice.
  await expect(tile.locator('[data-slot="badge"]')).toHaveText(["Indexing", "Empty", "Stalled"]);
  await expect(tile.getByRole("group", { name: "Ingest attention" })).toHaveCount(0);
});

test("a phase that reaches PAST the rows earns an aggregate, worst first, as a named control", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": () => CROWDED_BANK });
  const home = await mount(<DatabankHomeTileWithJumpGridStory />);

  const group = home.locator(TILE).getByRole("group", { name: "Ingest attention" });
  await expect(group.getByRole("button")).toHaveText(["12 stalled", "11 empty", "10 queued", "13 indexing"]);
  // The chip's TEXT is a count; its accessible name has to be the promise, or a screen reader hears a
  // number where a verb belongs.
  await expect(group.getByRole("button", { name: "Show the 12 stalled documents in your databank" })).toBeVisible();
});

test("clicking an aggregate scopes the library to that phase AND goes there — assert the STORES", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": () => CROWDED_BANK });
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");
  await expect(probe).toContainText("phase=none");

  await home.locator(TILE).getByRole("button", { name: "Show the 12 stalled documents in your databank" }).click();

  await expect(probe).toContainText("phase=stalled");
  await expect(probe).toContainText("section=databank");
});

test("a READY row carries no phase chip; a non-ready row carries its own, plus a recency stamp", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileStory />);

  const tile = home.locator(TILE);
  const ready = tile.getByRole("listitem").filter({ hasText: READY_DOC.name });
  const indexing = tile.getByRole("listitem").filter({ hasText: INDEXING_DOC.name });

  await expect(ready).toContainText("Upload · 24.5 KB · 12 passages");
  await expect(ready.locator('[data-slot="badge"]')).toHaveCount(0);
  await expect(indexing.locator('[data-slot="badge"]')).toHaveText(["Indexing"]);
  // The list is called "Recent documents" — sighted users get the ordering cue too, not just the SR label.
  // The page clock is frozen at the fixtures' own instant, so the newest rows read as "now".
  await expect(ready.locator('[data-slot="list-row-meta"]')).toBeVisible();
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

test("an EMPTY bank teaches the first step, opens the CEREMONY, and drops the link to nothing", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": () => [] });
  const home = await mount(<DatabankHomeTileStory />);
  const probe = home.locator("output");

  const tile = home.locator(TILE);
  await expect(tile.getByText("No documents yet")).toBeVisible();
  // No health line, no rows: an empty bank has no passages to report and nothing to be honest about
  // except that it is empty.
  await expect(tile.getByText("documents ·")).toHaveCount(0);
  await expect(tile.getByRole("listitem")).toHaveCount(0);
  // …and no second control promising a list of zero documents (P2-b).
  await expect(tile.getByRole("button", { name: "All documents →" })).toHaveCount(0);

  // The button OPENS THE DIALOG — it used to only move the rail, landing the user on the library's own
  // empty state with the same sentence and the real button under it (P1-2).
  await tile.getByRole("button", { name: "Add your first document" }).click();
  await expect(probe).toContainText("modal=addDocument");
});

test("the tile SUBSUMES its jump row — Databank is one door on home, not two", async ({ mount, page }) => {
  await stubDatabank(page);
  const home = await mount(<DatabankHomeTileWithJumpGridStory />);

  const jump = home.locator('[data-home-tile="home.jump"]');
  // The grid is REAL and still derives every other section from the registry…
  await expect(jump.getByRole("button", { name: "Chats" })).toBeVisible();
  // …but the section this tile carries in full is gone from it.
  await expect(jump.getByRole("button", { name: "Databank" })).toHaveCount(0);
});

test("at the narrowest real host a crowded health line WRAPS — every chip stays inside the card", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": () => CROWDED_BANK });
  const home = await mount(<DatabankHomeTileNarrowStory />);

  const tile = home.locator(TILE);
  // Barrier on the SETTLED body first — geometry read while the tile's QueryBoundary is still showing its
  // reserved skeleton measures the skeleton, and `count()` does not auto-wait.
  await expect(tile.getByText("46 documents · 286 of 507 passages indexed")).toBeVisible();
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
