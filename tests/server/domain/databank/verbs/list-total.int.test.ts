// A databank list page carries the total of the documents its lens selects, not the size of the bank and not the page.
// @subject packages/server/src/domain/databank/verbs/list.ts

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
