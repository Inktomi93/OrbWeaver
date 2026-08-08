// CT: the Databank LIST pane over the stubbed network, mounted at its REAL 320px production width. It
// drives the production reads (`databank.list` + the D-1 `databank.listGlobal`) and pins the four rulings
// that make this pane different from the legacy surface it replaces:
//
//   §6.1  Ready is the ABSENCE of a chip — a phase badge renders only for a non-ready row.
//   §6.1  `Everywhere` is the row's ONE state toggle, carrying `aria-pressed`, mirrored in the kebab (N3),
//         and firing the OWNER-scoped attach/detach.
//   §6.1  No inline verb, and NO Duplicate item: a document has no copy verb.
//   D-1   ONE `listGlobal` read paints every row's toggle, however many rows there are — never legacy's
//         `listAttachments` PER ROW (40 documents = 40 round-trips to paint one pane).
//
// The row's global state is asserted through `aria-pressed` (the affordance's own datum) and the write
// through the recorded MUTATION INPUT — never through a UI reaction to a stubbed response.

import { expect, test } from "@playwright/experimental-ct-react";
import { DatabankHomeTileAndLibraryStory, DatabankLibraryStory, DatabankLibraryTallStory } from "../_ct-stories.tsx";
import { INDEXING_DOC, pagedBank, READY_DOC, stubDatabank } from "../fixtures.ts";

test("a phase chip renders ONLY for a non-ready row — Ready is the absence of a chip (§6.1)", async ({ mount, page }) => {
  await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);

  await expect(list.getByText("The Crimson Court")).toBeVisible();
  // The two in-flight/degenerate rows say their phase…
  await expect(list.getByText("Indexing", { exact: true })).toBeVisible();
  await expect(list.getByText("Empty", { exact: true })).toBeVisible();
  // …and the steady state says nothing at all. A "Ready" chip on most rows is chrome that costs title width.
  await expect(list.getByText("Ready", { exact: true })).toHaveCount(0);
});

// DBFIX — THE LIST ROW CARRIES THE STALL TRUTH. A document whose ingest never ran (the SWEEP found three of
// seven in that state) rendered `Queued` on this list FOREVER; the only surface that ever admitted something
// was wrong was the DETAIL pane's stall hint, five minutes in, for a user who thought to open the row. The
// list is where a user actually notices, so the verdict and its remedy live here now.
test("a wedged row says STALLED on the LIST, not Queued — and carries its remedy", async ({ mount, page }) => {
  await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("Treaty of Ashfen")).toBeVisible();

  const chip = list.locator('[data-slot="list-row-root"]', { hasText: "Treaty of Ashfen" }).getByText("Stalled", { exact: true });
  await expect(chip).toBeVisible();
  // The remedy is on the chip itself — the sentence would ellipsis the row's scent line at the 320px floor.
  await expect(chip).toHaveAttribute("title", "Still queued — Reindex can restart a stuck job.");
  // …and the repair it names is one click away on this row's own kebab.
  await list.locator('[data-slot="list-row-root"]', { hasText: "Treaty of Ashfen" }).hover();
  await list.getByRole("button", { name: "Actions for Treaty of Ashfen", exact: true }).click();
  await expect(page.getByRole("menuitem", { name: "Reindex" })).toBeVisible();
});

test("a FRESH in-flight row still reads Queued — the stall verdict is a frozen clock, not a zero count", async ({ mount, page }) => {
  await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("The Crimson Court")).toBeVisible();

  // `Heraldry plates` extracted to nothing and `Duskwater Barony` is mid-embed: neither is wedged, and
  // exactly one row in the bank earns the danger chip.
  await expect(list.getByText("Stalled", { exact: true })).toHaveCount(1);
  await expect(list.getByText("Indexing", { exact: true })).toBeVisible();
});

test("the row subtitle is the scent: provenance · size · passages", async ({ mount, page }) => {
  await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);

  await expect(list.getByText("Upload · 24.5 KB · 12 passages")).toBeVisible();
  await expect(list.getByText("Wiki · 91.7 KB · 39 passages")).toBeVisible();
});

test("Everywhere is the row's ONE state toggle: aria-pressed carries the state, from ONE listGlobal read", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("The Crimson Court")).toBeVisible();

  // The pressed toggle is rest-VISIBLE (D11 when-on) and states its own datum.
  await expect(list.getByRole("button", { name: "Stop feeding The Crimson Court to every chat" })).toHaveAttribute("aria-pressed", "true");

  // An un-global row's toggle is reveal-gated, so reach it the way a user does — by hovering the row.
  await list.locator('[data-slot="list-row-root"]', { hasText: "Duskwater Barony" }).hover();
  await expect(list.getByRole("button", { name: "Feed Duskwater Barony to every chat" })).toHaveAttribute("aria-pressed", "false");

  // THE POINT OF D-1: three rows, ONE global read — and no per-row reverse lookup at all. Polled, because a
  // request count is node-side state that settles independently of the DOM barrier above.
  await expect.poll(() => trpc.count("databank.listGlobal"), { intervals: [20, 50, 100] }).toBe(1);
  await expect.poll(() => trpc.count("databank.listAttachments"), { intervals: [20, 50, 100] }).toBe(0);
});

test("pressing Everywhere fires the OWNER-scoped attach with that row's id", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("Duskwater Barony")).toBeVisible();

  await list.locator('[data-slot="list-row-root"]', { hasText: "Duskwater Barony" }).hover();
  await list.getByRole("button", { name: "Feed Duskwater Barony to every chat" }).click();

  // The PAYLOAD is the assertion (assert-the-mutation-fired), not a re-render of a stubbed response.
  await expect.poll(() => trpc.lastInput("databank.attachGlobal"), { intervals: [20, 50, 100] }).toEqual({ documentId: INDEXING_DOC.id });
  await expect.poll(() => trpc.count("databank.attachGlobal"), { intervals: [20, 50, 100] }).toBe(1);
});

test("un-pressing Everywhere fires DETACH, not attach — the toggle is a real two-way write", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);

  await list.getByRole("button", { name: "Stop feeding The Crimson Court to every chat" }).click();

  await expect.poll(() => trpc.lastInput("databank.detachGlobal"), { intervals: [20, 50, 100] }).toEqual({ documentId: READY_DOC.id });
  await expect.poll(() => trpc.count("databank.attachGlobal"), { intervals: [20, 50, 100] }).toBe(0);
});

test("the kebab mirrors Everywhere (N3), offers Reindex, and has NO Duplicate — a document has no copy verb", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("The Crimson Court")).toBeVisible();

  await list.locator('[data-slot="list-row-root"]', { hasText: "The Crimson Court" }).hover();
  await list.getByRole("button", { name: "Actions for The Crimson Court", exact: true }).click();

  await expect(page.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Reindex" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Duplicate" })).toHaveCount(0);
  // The mirror arm names the same write the inline toggle does, in the state-appropriate direction.
  await page.getByRole("menuitem", { name: "Stop feeding every chat" }).click();
  await expect.poll(() => trpc.count("databank.detachGlobal"), { intervals: [20, 50, 100] }).toBe(1);
});

test("Delete goes through the confirm, and reaches the server only after it", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("The Crimson Court")).toBeVisible();

  await list.locator('[data-slot="list-row-root"]', { hasText: "The Crimson Court" }).hover();
  await list.getByRole("button", { name: "Actions for The Crimson Court", exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();

  // The destructive verb is dialog-gated: at the SETTLED state with the confirm open, nothing has been sent.
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await expect.poll(() => trpc.count("databank.remove"), { intervals: [20, 50, 100] }).toBe(0);

  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect.poll(() => trpc.lastInput("databank.remove"), { intervals: [20, 50, 100] }).toEqual({ id: READY_DOC.id });
});

test("the empty bank TEACHES and offers the next step — never a blank pane", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": pagedBank([]), "databank.listGlobal": () => [] });
  const list = await mount(<DatabankLibraryStory />);

  await expect(list.getByText("No documents yet")).toBeVisible();
  await expect(list.getByRole("button", { name: "Add a document" })).toBeVisible();
});

test("a search with no hits says so, and does NOT offer the create action (the bank is not empty)", async ({ mount, page }) => {
  await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("The Crimson Court")).toBeVisible();

  await list.getByRole("textbox", { name: "Search documents" }).fill("nothing matches this");

  await expect(list.getByText("No matches")).toBeVisible();
  await expect(list.getByRole("button", { name: "Add a document" })).toHaveCount(0);
});

// ── The PHASE SCOPE home's health chips write (side-eye 2026-08-08 P2-a) ───────────────────────────────
// The chip is only half a fix: the other half is this pane honoring the scope, SAYING it is scoped, and
// offering the way out. Driven end-to-end in ONE mount — the tile writes the store, the list reacts.

/** Five healthy documents and a WEDGED one last, so the stalled row sits past the four the tile renders —
 *  which is exactly when an aggregate chip earns its place (a phase visible in the rows shows no chip). */
const WEDGED_AGO_MS = 3_600_000;
const BANK_WITH_A_HIDDEN_STALL = [
  ...Array.from({ length: 5 }, (_, i) => ({ ...READY_DOC, id: `document_${String(500 + i).padStart(20, "0")}`, name: `Healthy ${i}` })),
  {
    ...READY_DOC,
    id: "document_00000000000000000999",
    name: "Treaty of Ashfen",
    chunkCount: 0,
    embeddedCount: 0,
    updatedAt: READY_DOC.updatedAt - WEDGED_AGO_MS,
  },
];

test("a health chip scopes this pane to that phase, says so, and offers the way back", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": pagedBank(BANK_WITH_A_HIDDEN_STALL) });
  const both = await mount(<DatabankHomeTileAndLibraryStory />);
  const pane = both.getByRole("region", { name: "Library pane" });

  // Unscoped, the pane shows the whole bank.
  await expect(pane.getByRole("button", { exact: true, name: "Healthy 0" })).toHaveCount(1);

  await both.locator('[data-home-tile="databank.documents"]').getByRole("button", { name: "Show the 1 stalled documents in your databank" }).click();

  // The pane says it is scoped, and its rows are only that phase.
  await expect(pane.getByText("Filtered:")).toBeVisible();
  await expect(pane.getByRole("button", { exact: true, name: "Treaty of Ashfen" })).toHaveCount(1);
  await expect(pane.getByRole("button", { exact: true, name: "Healthy 0" })).toHaveCount(0);

  // …and the clear affordance puts the whole bank back.
  await pane.getByRole("button", { name: "Clear the Stalled filter" }).click();
  await expect(pane.getByRole("button", { exact: true, name: "Healthy 0" })).toHaveCount(1);
});

// ── PAGINATION — the 100-doc ceiling ───────────────────────────────────────────────────────────────────
// The pane used to render exactly `databank.list`'s default page and offer no way to ask for another, so a
// bank's 101st document was unreachable from the UI — a ceiling the tile's honest "100+" had just made
// visible. These pin the two halves: the tail control REACHES the row past the cap, and a search that finds
// nothing among the loaded rows says THAT rather than claiming the bank has no such document.

/** A bank two pages deep at the pane's page size. `updatedAt` DESCENDS with the index so the fixture is in
 *  the same order the verb serves (`updatedAt DESC, id DESC`) and the keyset walk is meaningful. */
const DEEP_BANK = Array.from({ length: 130 }, (_, i) => ({
  ...READY_DOC,
  id: `document_${String(i).padStart(20, "0")}`,
  name: `Document ${String(i + 1)}`,
  updatedAt: READY_DOC.updatedAt - i * 1000,
}));

test("a document PAST the first page is reachable — Load more walks the keyset", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": pagedBank(DEEP_BANK), "databank.listGlobal": () => [] });
  const list = await mount(<DatabankLibraryTallStory />);

  // The first page landed (the default `library.pageSize` is 30) and the bank's 101st document is NOT in it.
  await expect(list.getByRole("button", { exact: true, name: "Document 1" })).toHaveCount(1);
  await expect(list.getByRole("button", { exact: true, name: "Document 101" })).toHaveCount(0);

  // Walk to it the way a user does. Each press appends the next page, so the row lands on the fourth.
  const loadMore = list.getByRole("button", { name: "Load more", exact: true });
  for (let i = 0; i < 3; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: pressing a control and waiting for the page it fetches is sequential by construction — this loop IS the user walking the keyset.
    await expect(loadMore).toBeEnabled();
    await loadMore.click();
    // Barrier on the SETTLED page: the row count only grows once the next page's rows have rendered.
    await expect(list.getByRole("button", { exact: true, name: "Document 101" })).toHaveCount(i === 2 ? 1 : 0);
  }

  // …and the tail control retires itself when the bank is exhausted (130 rows = the last page is short).
  await loadMore.click();
  await expect(list.getByRole("button", { exact: true, name: "Document 130" })).toHaveCount(1);
  await expect(loadMore).toHaveCount(0);
});

test("at the REAL 320×700 pane the tail control is reachable by scrolling — not clipped out of the list", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": pagedBank(DEEP_BANK), "databank.listGlobal": () => [] });
  // The PRODUCTION mount, not the tall story: a "Load more" at the end of a 30-row page lives past the fold
  // of a 700px pane, and a tail control a user cannot scroll to is the same as no tail control at all.
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByRole("button", { exact: true, name: "Document 1" })).toHaveCount(1);

  const loadMore = list.getByRole("button", { name: "Load more", exact: true });
  await loadMore.scrollIntoViewIfNeeded();
  await expect(loadMore).toBeInViewport();

  // Geometry, not just presence: the control sits INSIDE the pane's box (a row that overflows the 320px
  // floor is this surface's most common rendered defect).
  const paneBox = await list.boundingBox();
  const buttonBox = await loadMore.boundingBox();
  // Throw-guard (not an `if` around the expects — a conditional expect that skips reads as a pass): a
  // visible, in-viewport control always has a box, so a null here is a real failure, not a branch.
  if (paneBox === null || buttonBox === null) {
    throw new Error("expected rendered boxes for the pane and the Load more control");
  }
  expect(buttonBox.x).toBeGreaterThanOrEqual(paneBox.x);
  expect(buttonBox.x + buttonBox.width).toBeLessThanOrEqual(paneBox.x + paneBox.width);

  // …and it works from there: the next page lands.
  await loadMore.click();
  await expect(list.getByRole("button", { exact: true, name: "Document 31" })).toHaveCount(1);
});

test("a search with no hits among the LOADED rows says so — it never claims the whole bank has none", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": pagedBank(DEEP_BANK), "databank.listGlobal": () => [] });
  const list = await mount(<DatabankLibraryTallStory />);
  await expect(list.getByRole("button", { exact: true, name: "Document 1" })).toHaveCount(1);

  // "Document 101" exists in the bank and not in the loaded window — the exact case where a flat "No
  // matches" would be a lie about data the client never fetched.
  await list.getByRole("textbox", { name: "Search documents" }).fill("Document 101");
  await expect(list.getByText("No matches in view")).toBeVisible();
  await expect(list.getByText("No matches", { exact: true })).toHaveCount(0);

  // And the empty state's own action keeps looking — a scoped dead end is not an answer.
  await list.getByRole("button", { name: "Load more", exact: true }).click();
  await list.getByRole("button", { name: "Load more", exact: true }).click();
  await list.getByRole("button", { name: "Load more", exact: true }).click();
  await expect(list.getByRole("button", { exact: true, name: "Document 101" })).toHaveCount(1);
});

test("a phase scope that matches nothing reads as GOOD NEWS with its own way out, not as an empty bank", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.list": pagedBank(BANK_WITH_A_HIDDEN_STALL) });
  const both = await mount(<DatabankHomeTileAndLibraryStory />);
  const pane = both.getByRole("region", { name: "Library pane" });

  await both.locator('[data-home-tile="databank.documents"]').getByRole("button", { name: "Show the 1 stalled documents in your databank" }).click();
  await expect(pane.getByRole("button", { exact: true, name: "Treaty of Ashfen" })).toHaveCount(1);

  // Deleting is not needed to reach the state — searching within the scope empties it, which is the same
  // arm: a scope with no matches must never read "No documents yet" (the bank has six).
  await pane.getByRole("textbox", { name: "Search documents" }).fill("zzzz");
  await expect(pane.getByText("No documents in that state")).toBeVisible();
  await expect(pane.getByText("No documents yet")).toHaveCount(0);
  await expect(pane.getByRole("button", { name: "Show every document" })).toBeVisible();
});
