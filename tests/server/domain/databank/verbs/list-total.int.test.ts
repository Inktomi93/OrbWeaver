// A databank list page carries the total of the documents its lens selects, not the size of the bank and not the page.
// @subject packages/server/src/domain/databank/verbs/list.ts

import { STALE_INGEST_MS } from "@orb/contracts/databank";
import { expect, test } from "@orb/testkit/node";
import { createServerHarness, seedCorpusActors } from "@orb/testkit/node/composed";

test("totalCount is the count of the search's matches across the whole bank, beyond the page and below the bank's size", async () => {
  await using root = await createServerHarness({ startJobs: false });
  const { owner } = await seedCorpusActors(root);
  const names = ["Harbour tides", "Harbour lights", "Harbour charts", "Orchard notes", "Lantern notes"];
  for (const name of names) {
    await root.services.databank.createFromText({ principal: owner, name, text: `${name} body.` });
  }

  const everything = await root.services.databank.list({ principal: owner });
  expect(everything.totalCount).toBe(names.length);

  const narrowed = await root.services.databank.list({ principal: owner, search: "harbour", limit: 2 });
  expect(narrowed.items).toHaveLength(2);
  expect(narrowed.nextCursor).not.toBeNull();
  expect(narrowed.totalCount).toBe(3);

  const missed = await root.services.databank.list({ principal: owner, search: "no such document" });
  expect(missed.items).toEqual([]);
  expect(missed.totalCount).toBe(0);
});

test("totalCount is the count of the phase's documents, beyond the page and below the bank's size", async ({ clock }) => {
  await using root = await createServerHarness({ startJobs: false, clock });
  const { owner } = await seedCorpusActors(root);
  const stalledNames = ["Stalled tides", "Stalled lights"];
  const indexingNames = ["Fresh charts", "Fresh notes", "Fresh logs"];
  for (const name of stalledNames) {
    await root.services.databank.createFromText({ principal: owner, name, text: `${name} body.` });
  }
  // A document with canon, no chunks and an updatedAt that stopped moving is stalled; one written since is still indexing.
  clock.advance(STALE_INGEST_MS + 1);
  for (const name of indexingNames) {
    await root.services.databank.createFromText({ principal: owner, name, text: `${name} body.` });
  }

  const everything = await root.services.databank.list({ principal: owner });
  expect(everything.totalCount).toBe(stalledNames.length + indexingNames.length);

  const indexing = await root.services.databank.list({ principal: owner, phase: "indexing", limit: 2 });
  expect(indexing.items).toHaveLength(2);
  expect(indexing.nextCursor).not.toBeNull();
  expect(indexing.totalCount).toBe(indexingNames.length);

  const stalled = await root.services.databank.list({ principal: owner, phase: "stalled" });
  expect(stalled.items.map((item) => item.name).toSorted()).toEqual(stalledNames.toSorted());
  expect(stalled.totalCount).toBe(stalledNames.length);

  // No chunk exists, so no document is ready: the count is the lens's empty answer, not the bank's size.
  const ready = await root.services.databank.list({ principal: owner, phase: "ready" });
  expect(ready.items).toEqual([]);
  expect(ready.totalCount).toBe(0);

  const narrowed = await root.services.databank.list({ principal: owner, phase: "indexing", search: "notes" });
  expect(narrowed.items.map((item) => item.name)).toEqual(["Fresh notes"]);
  expect(narrowed.totalCount).toBe(1);
});
