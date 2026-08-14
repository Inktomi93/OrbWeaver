// verb: bankHealth — the home tile's D-7 census. Load-bearing: every number counts the WHOLE bank, which is
// the whole reason the verb exists. The tile used to sum the one 100-row page it renders four rows of, so on
// a bank past that page it reported "100+ documents" and counted its attention chips ("12 stalled") over the
// newest hundred while reading as a claim about the bank.
//
// So the population here is DEEPER THAN A PAGE on purpose, and the wedged/blank documents sit at the BOTTOM
// of it — under the old page-derived reading they were invisible, and every assertion below would have been
// off by exactly the rows the page could not see.

import { DATABANK_LIST_DEFAULT_LIMIT, STALE_INGEST_MS } from "@orb/contracts/databank";
import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

const INGEST_TIMEOUT_MS = 30_000;

test("counts the WHOLE bank by phase — including the documents past the first page", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const other = await seedUser(db, { handle: castId<Handle>("other") });
  const principal = principalFor(owner);

  // The two documents the page-derived version lied about: written FIRST, so they sort to the bottom of a
  // bank that is about to grow past one page.
  await h.service.createFromText({ principal, name: "wedged.md", text: "canon that never indexed" });
  await h.service.createFromText({ principal, name: "blank.md", text: "" });
  const ready = await h.service.createFromText({ principal, name: "ready.md", text: "canon that indexed" });
  await h.ingest.ingestDocument({ documentId: ready.document.id, signal: AbortSignal.timeout(INGEST_TIMEOUT_MS) });
  h.advance(STALE_INGEST_MS + 1000);
  for (let i = 0; i < DATABANK_LIST_DEFAULT_LIMIT; i += 1) {
    h.advance(1000);
    // biome-ignore lint/performance/noAwaitInLoops: the seed order IS the fixture — each createFromText mints the next id off the harness's sequence, and Promise.all would race the (updatedAt, id) ordering.
    await h.service.createFromText({ principal, name: `filler-${String(i)}.md`, text: `note ${String(i)}` });
  }
  // A foreign bank that must not appear in any number below.
  await h.service.createFromText({ principal: principalFor(other), name: "foreign.md", text: "not yours" });

  const health = await h.service.bankHealth({ principal });
  const seeded = DATABANK_LIST_DEFAULT_LIMIT + 3;

  expect(health.total).toBe(seeded);
  // The two rows the page could not see, counted:
  expect(health.byPhase.stalled).toBe(1);
  expect(health.byPhase.empty).toBe(1);
  // `ready` is the one ingested document; every filler is canon-with-no-chunks written inside the stall
  // window, so they are `indexing`.
  expect(health.byPhase.ready).toBe(1);
  expect(health.byPhase.indexing).toBe(DATABANK_LIST_DEFAULT_LIMIT);
  // Unreachable in this substrate (a chunk row exists only after a successful embed), and counted anyway so
  // the day it becomes reachable needs no edit here.
  expect(health.byPhase.embedding).toBe(0);
  // The phases partition the bank — no document is counted twice or dropped.
  const summed = Object.values(health.byPhase).reduce((a, b) => a + b, 0);
  expect(summed).toBe(seeded);

  // Passages are the bank's live chunks; only `ready` has any, and every chunk it has is embedded.
  expect(health.chunks).toBeGreaterThan(0);
  expect(health.passages).toBe(health.chunks);
});

test("an empty bank is all zeros, not an absent census", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });

  const health = await h.service.bankHealth({ principal: principalFor(owner) });
  expect(health).toEqual({ byPhase: { embedding: 0, empty: 0, indexing: 0, ready: 0, stalled: 0 }, chunks: 0, passages: 0, total: 0 });
});
