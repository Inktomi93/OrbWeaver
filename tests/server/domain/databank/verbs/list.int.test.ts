// verb: list — owner-scoped, newest-activity first, KEYSET-PAGED, with EVERY library lens applied
// server-side. Load-bearing: only the caller's own documents appear (cross-tenant isolation), the origin
// filter narrows, the list never leaks another owner's rows — and the bank is WALKABLE past its first page
// (the 101st document was unreachable before the cursor landed).
//
// THE LENS PINS (owner ruling 2026-08-13) are written against a bank DEEPER THAN ONE PAGE, because that is
// the only population where a server-side lens and a client-side one differ: the pane used to filter the
// ≤150 loaded rows, so a term matching only a document on page 4 read as "no matches" over a bank that
// plainly contains it. Each pin below puts its match out of reach of the first page on purpose.

import { DATABANK_LIST_DEFAULT_LIMIT, STALE_INGEST_MS } from "@orb/contracts/databank";
import type { DocumentId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

test("lists only the caller's documents, newest-activity first, and filters by origin", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });

  const first = await h.service.createFromText({ principal: principalFor(owner), name: "one.md", text: "first note" });
  h.advance(1000);
  const second = await h.service.createFromText({ principal: principalFor(owner), name: "two.md", text: "second note" });
  await h.service.createFromText({ principal: principalFor(other), name: "foreign.md", text: "not yours" });

  const list = await h.service.list({ principal: principalFor(owner) });
  expect(list.items.map((d) => d.id)).toEqual([second.document.id, first.document.id]); // newest updatedAt first
  expect(list.nextCursor).toBeNull(); // a short page is the end of the bank

  const text = await h.service.list({ principal: principalFor(owner), origin: "text" });
  expect(text.items).toHaveLength(2);
  const uploads = await h.service.list({ principal: principalFor(owner), origin: "upload" });
  expect(uploads.items).toHaveLength(0);

  // The census counts the caller's OWN bank over the request's scope — never the other owner's row, and
  // never "how many rows this page carried".
  expect(list.totalCount).toBe(2);
  expect(text.totalCount).toBe(2);
  expect(uploads.totalCount).toBe(0);
});

test("SEARCH is the server's: a document only reachable on a later page comes back on the FIRST page", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const principal = principalFor(owner);

  // The needle is written FIRST, so every later document sorts above it (`updatedAt DESC`) and it lands
  // deep in the bank — the exact row a client-side filter over the loaded window could never find.
  const needle = await h.service.createFromText({ principal, name: "Treaty of Ashfen.md", text: "the accord" });
  for (let i = 0; i < DATABANK_LIST_DEFAULT_LIMIT; i += 1) {
    h.advance(1000);
    // biome-ignore lint/performance/noAwaitInLoops: the seed order IS the fixture — each createFromText mints the next id off the harness's sequence, and Promise.all would race the (updatedAt, id) ordering.
    await h.service.createFromText({ principal, name: `filler-${String(i)}.md`, text: `note ${String(i)}` });
  }

  const unsearched = await h.service.list({ principal });
  expect(unsearched.items.map((d) => d.id)).not.toContain(needle.document.id);
  expect(unsearched.totalCount).toBe(DATABANK_LIST_DEFAULT_LIMIT + 1);

  const found = await h.service.list({ principal, search: "ashfen" });
  expect(found.items.map((d) => d.id)).toEqual([needle.document.id]);
  // The census follows the LENS, not the bank: a searched read counts its matches.
  expect(found.totalCount).toBe(1);
  expect(found.nextCursor).toBeNull();

  // Case-insensitive, substring, and whitespace-only is the UNSEARCHED bank rather than a search for a space.
  expect((await h.service.list({ principal, search: "  TREATY " })).items).toHaveLength(1);
  expect((await h.service.list({ principal, search: "   " })).totalCount).toBe(DATABANK_LIST_DEFAULT_LIMIT + 1);
  expect((await h.service.list({ principal, search: "no document is called this" })).totalCount).toBe(0);
});

test("the PHASE lens narrows the whole bank — a wedged document deep in it is one chip away", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const principal = principalFor(owner);

  // FOUR phases, seeded by their DATA (there is no status column — the counts and the clock are the truth):
  //   wedged  — canon, never ingested, `updatedAt` frozen past the stall threshold
  //   queued  — canon, never ingested, written just now
  //   blank   — extracted to nothing
  //   ready   — ingested, so its chunks exist in the active space
  const wedged = await h.service.createFromText({ principal, name: "wedged.md", text: "canon that never indexed" });
  const blank = await h.service.createFromText({ principal, name: "blank.md", text: "" });
  const ready = await h.service.createFromText({ principal, name: "ready.md", text: "canon that indexed" });
  await h.ingest.ingestDocument({ documentId: ready.document.id, signal: AbortSignal.timeout(30_000) });
  // Everything above is now older than the stall window; the queued row is written after the jump so only
  // the wedged one has stopped moving.
  h.advance(STALE_INGEST_MS + 1000);
  const queued = await h.service.createFromText({ principal, name: "queued.md", text: "canon just added" });
  // …and a page of filler on top, so none of the four is on the first page of the UNFILTERED list.
  for (let i = 0; i < DATABANK_LIST_DEFAULT_LIMIT; i += 1) {
    h.advance(1000);
    // biome-ignore lint/performance/noAwaitInLoops: sequential seeding — see the search pin above.
    await h.service.createFromText({ principal, name: `filler-${String(i)}.md`, text: `note ${String(i)}` });
  }

  const idsOf = async (phase: "empty" | "indexing" | "ready" | "stalled"): Promise<DocumentId[]> =>
    (await h.service.list({ principal, phase })).items.map((d) => d.id);

  expect(await idsOf("stalled")).toEqual([wedged.document.id]);
  expect(await idsOf("empty")).toEqual([blank.document.id]);
  expect(await idsOf("ready")).toContain(ready.document.id);
  // `queued` is in flight and still moving — and it sits BELOW the filler, i.e. off the first page of the
  // phase-filtered read too, so the pin is the census plus a composed search rather than page membership.
  const indexing = await h.service.list({ principal, phase: "indexing" });
  expect(indexing.totalCount).toBe(DATABANK_LIST_DEFAULT_LIMIT + 1);
  expect((await h.service.list({ principal, phase: "indexing", search: "queued" })).items.map((d) => d.id)).toEqual([queued.document.id]);
  const indexingIds = indexing.items.map((d) => d.id);
  expect(indexingIds).not.toContain(wedged.document.id);
  expect(indexingIds).not.toContain(ready.document.id);
  expect(indexingIds).not.toContain(blank.document.id);

  // The lenses COMPOSE, over the same scope the census counts.
  const scoped = await h.service.list({ principal, phase: "stalled", search: "wedge" });
  expect(scoped.items.map((d) => d.id)).toEqual([wedged.document.id]);
  expect(scoped.totalCount).toBe(1);
  expect((await h.service.list({ principal, phase: "stalled", search: "ready" })).totalCount).toBe(0);
});

test("walks the WHOLE bank by cursor — every document past the first page is reachable exactly once", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const principal = principalFor(owner);

  // A bank one document PAST the old ceiling, and the tail written in the SAME millisecond as its
  // neighbours (`advance` is not called) — the tie the `(updatedAt, id)` keyset exists for. A cursor on
  // `updatedAt` alone would either re-serve or skip the rows sharing the boundary timestamp.
  const total = DATABANK_LIST_DEFAULT_LIMIT + 1;
  for (let i = 0; i < total; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: the seed order IS the fixture — each createFromText mints the next id off the harness's sequence, and Promise.all would race exactly the (updatedAt, id) ordering this test walks.
    await h.service.createFromText({ principal, name: `doc-${String(i)}.md`, text: `note ${String(i)}` });
  }

  const firstPage = await h.service.list({ principal });
  expect(firstPage.items).toHaveLength(DATABANK_LIST_DEFAULT_LIMIT);
  expect(firstPage.nextCursor).not.toBeNull();

  const walked: DocumentId[] = firstPage.items.map((d) => d.id);
  let cursor = firstPage.nextCursor;
  while (cursor !== null) {
    // biome-ignore lint/performance/noAwaitInLoops: a keyset walk is sequential BY DEFINITION — page N+1's cursor does not exist until page N comes back.
    const page = await h.service.list({ principal, cursor });
    walked.push(...page.items.map((d) => d.id));
    cursor = page.nextCursor;
  }

  // Every row exactly once — no duplicate across the page boundary, none dropped.
  expect(walked).toHaveLength(total);
  expect(new Set(walked).size).toBe(total);
});

test("pages at the caller's own size and clamps a request above the ceiling", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const principal = principalFor(owner);
  const seeded = 7;
  for (let i = 0; i < seeded; i += 1) {
    // biome-ignore lint/performance/noAwaitInLoops: sequential seeding — see the keyset-walk test above.
    await h.service.createFromText({ principal, name: `doc-${String(i)}.md`, text: `note ${String(i)}` });
  }

  const page = await h.service.list({ principal, limit: 3 });
  expect(page.items).toHaveLength(3);
  expect(page.nextCursor).not.toBeNull();

  // Over the ceiling is CLAMPED, not honored — so a surface can never be handed a page the next cursor
  // would then disagree about.
  const oversized = await h.service.list({ principal, limit: DATABANK_LIST_DEFAULT_LIMIT * 10 });
  expect(oversized.items).toHaveLength(seeded);
  expect(oversized.nextCursor).toBeNull();
});
