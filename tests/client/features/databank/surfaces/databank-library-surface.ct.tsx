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
import { DatabankHomeTileAndLibraryStory, DatabankLibraryStory } from "../_ct-stories.tsx";
import { INDEXING_DOC, READY_DOC, stubDatabank } from "../fixtures.ts";

/** One wheel step of the deep-scroll walks below. The poll IS the scroll loop: each attempt wheels once and
 *  reports whether the target has arrived, so the walk needs no `waitForTimeout` and no awaits inside a `for`
 *  (both banned in CTs, and both would be a fixed sleep standing in for the settle this waits on). */
const SCROLL_STEP_PX = 600;
const SCROLL_POLL = { intervals: [100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100], timeout: 20_000 };

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
  await stubDatabank(page, { "databank.listGlobal": () => [] }, []);
  const list = await mount(<DatabankLibraryStory />);

  await expect(list.getByText("No documents yet")).toBeVisible();
  await expect(list.getByRole("button", { name: "Add a document" })).toBeVisible();
});

test("a search with no hits says so, and does NOT offer the create action (the bank is not empty)", async ({ mount, page }) => {
  const trpc = await stubDatabank(page);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByText("The Crimson Court")).toBeVisible();

  await list.getByRole("textbox", { name: "Search documents" }).fill("nothing matches this");

  await expect(list.getByText("No matches")).toBeVisible();
  await expect(list.getByRole("button", { name: "Add a document" })).toHaveCount(0);
  // THE TERM WENT OVER THE WIRE. Asserted on the recorded INPUT, because "the pane shows no rows" is exactly
  // what a client-side filter over the loaded window produced too — the wire is what tells the two apart.
  await expect.poll(() => trpc.lastInput("databank.list"), { intervals: [20, 50, 100] }).toMatchObject({ search: "nothing matches this" });
});

// ── The PHASE SCOPE home's health chips write (side-eye 2026-08-08 P2-a) ───────────────────────────────
// The chip is only half a fix: the other half is this pane honoring the scope, SAYING it is scoped, and
// offering the way out. Driven end-to-end in ONE mount — the tile writes the store, the list reacts.

/** FORTY healthy documents and a WEDGED one last. Two things ride on that depth: the stalled row is past the
 *  four the tile renders (which is when an aggregate chip earns its place — a phase visible in the rows shows
 *  no chip), AND past the pane's own first page of 30, which is what makes this a test of a SERVER lens.
 *  Under the client-side scope this pane used to run, clicking the chip filtered the loaded 30 rows, found no
 *  stalled document among them, and told the user nothing in their bank was stalled — while the chip they had
 *  just clicked said one was. */
const WEDGED_AGO_MS = 3_600_000;
const BANK_WITH_A_HIDDEN_STALL = [
  ...Array.from({ length: 40 }, (_, i) => ({
    ...READY_DOC,
    id: `document_${String(500 + i).padStart(20, "0")}`,
    name: `Healthy ${i}`,
    updatedAt: READY_DOC.updatedAt - i * 1000,
  })),
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
  const trpc = await stubDatabank(page, {}, BANK_WITH_A_HIDDEN_STALL);
  const both = await mount(<DatabankHomeTileAndLibraryStory />);
  const pane = both.getByRole("region", { name: "Library pane" });

  // Unscoped, the pane shows the whole bank (its first page of it).
  await expect(pane.getByRole("button", { exact: true, name: "Healthy 0" })).toHaveCount(1);

  await both.locator('[data-home-tile="databank.documents"]').getByRole("button", { name: "Show the 1 stalled documents in your databank" }).click();

  // The pane says it is scoped, and its rows are only that phase — INCLUDING the wedged document that lives
  // eleven rows past the page the pane had loaded.
  await expect(pane.getByText("Filtered:")).toBeVisible();
  await expect(pane.getByRole("button", { exact: true, name: "Treaty of Ashfen" })).toHaveCount(1);
  await expect(pane.getByRole("button", { exact: true, name: "Healthy 0" })).toHaveCount(0);
  // …because the SCOPE went over the wire, which is what distinguishes this from a window filter.
  await expect.poll(() => trpc.lastInput("databank.list"), { intervals: [20, 50, 100] }).toMatchObject({ phase: "stalled" });

  // …and the clear affordance puts the whole bank back.
  await pane.getByRole("button", { name: "Clear the Stalled filter" }).click();
  await expect(pane.getByRole("button", { exact: true, name: "Healthy 0" })).toHaveCount(1);
});

// ── THE LENSES ARE THE SERVER'S (owner ruling 2026-08-13, landed here 2026-08-14) ──────────────────────
// The pane used to hold a ≤150-row window (`maxPages: 5`) and run its name filter and its phase scope over
// whatever was loaded, behind an explicit "Load more" tail. Two defects in one shape: rows evicted off the
// head of the window unrecoverably, and every lens was a claim about pages the client happened to hold — a
// term matching only document 101 said "No matches in view", and a health chip scoped the pane to whichever
// of the wedged documents had been paged in. These pin the fix through the WIRE and the rendered rows.

/** A bank four pages deep at the pane's page size (30). `updatedAt` DESCENDS with the index so the fixture is
 *  in the same order the verb serves (`updatedAt DESC, id DESC`) and the keyset walk is meaningful. */
const DEEP_BANK = Array.from({ length: 130 }, (_, i) => ({
  ...READY_DOC,
  id: `document_${String(i).padStart(20, "0")}`,
  name: `Document ${String(i + 1)}`,
  updatedAt: READY_DOC.updatedAt - i * 1000,
}));

test("a search hits a document FOUR pages deep — the term goes to the server, not to the loaded rows", async ({ mount, page }) => {
  const trpc = await stubDatabank(page, { "databank.listGlobal": () => [] }, DEEP_BANK);
  const list = await mount(<DatabankLibraryStory />);

  // The first page landed (the default `library.pageSize` is 30) and document 101 is nowhere near it.
  await expect(list.getByRole("button", { exact: true, name: "Document 1" })).toHaveCount(1);
  await expect(list.getByRole("button", { exact: true, name: "Document 101" })).toHaveCount(0);

  await list.getByRole("textbox", { name: "Search documents" }).fill("Document 101");

  // THE ROW ITSELF, with no paging gesture and no "load more to keep looking" hedge in between.
  await expect(list.getByRole("button", { exact: true, name: "Document 101" })).toHaveCount(1);
  await expect(list.getByText("No matches in view")).toHaveCount(0);
  await expect(list.getByRole("button", { name: "Load more" })).toHaveCount(0);
  await expect.poll(() => trpc.lastInput("databank.list"), { intervals: [20, 50, 100] }).toMatchObject({ search: "Document 101" });
});

test("a document PAST the first page is reachable — the virtual list walks the keyset as you scroll", async ({ mount, page }) => {
  await stubDatabank(page, { "databank.listGlobal": () => [] }, DEEP_BANK);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByRole("button", { exact: true, name: "Document 1" })).toHaveCount(1);

  // The tail-fetch guard is the LIST's own now (`<VirtualList onEndApproach>`); the explicit "Load more"
  // button is gone with the non-virtualized container that needed it.
  await expect(list.getByRole("button", { name: "Load more" })).toHaveCount(0);

  // Walk to the tail the way a user does — each wheel step lets the guard pull the next page. The poll IS
  // the scroll loop (no fixed sleep, no awaits inside a `for`).
  const rows = list.getByRole("list", { name: "Documents" });
  await rows.hover();
  const deep = list.getByRole("button", { exact: true, name: "Document 101" });
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, SCROLL_STEP_PX);
      return deep.count();
    }, SCROLL_POLL)
    .toBeGreaterThan(0);
});

test("the HEAD page is never evicted — the row you started at is still there after a deep scroll", async ({ mount, page }) => {
  // THE EVICTION TRAP. `maxPages: 5` with `getPreviousPageParam: () => undefined` made the head page
  // unrecoverable: past the cap TanStack dropped page 1 and nothing could fetch it back. The proof is the
  // BAND COUNT, not the DOM rows — at the bottom of a virtualized list the head rows are legitimately
  // unmounted either way, so "is row 1 in the DOM" cannot tell eviction from virtualization. The count is
  // the server's census, so it stays 130 while the loaded set is what changes.
  await stubDatabank(page, { "databank.listGlobal": () => [] }, DEEP_BANK);
  const list = await mount(<DatabankLibraryStory />);
  await expect(list.getByRole("button", { exact: true, name: "Document 1" })).toHaveCount(1);

  const rows = list.getByRole("list", { name: "Documents" });
  await rows.hover();
  const tail = list.getByRole("button", { exact: true, name: "Document 130" });
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, SCROLL_STEP_PX);
      return tail.count();
    }, SCROLL_POLL)
    .toBeGreaterThan(0);

  // …and scrolling back finds the head row again, which an evicted page could not produce.
  await expect
    .poll(async () => {
      await page.mouse.wheel(0, -SCROLL_STEP_PX);
      return list.getByRole("button", { exact: true, name: "Document 1" }).count();
    }, SCROLL_POLL)
    .toBeGreaterThan(0);
});

test("a phase scope that matches nothing reads as GOOD NEWS with its own way out, not as an empty bank", async ({ mount, page }) => {
  await stubDatabank(page, {}, BANK_WITH_A_HIDDEN_STALL);
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
