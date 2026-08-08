// verb: list — owner-scoped, newest-activity first, optional origin filter, KEYSET-PAGED. Load-bearing:
// only the caller's own documents appear (cross-tenant isolation), the origin filter narrows, the list never
// leaks another owner's rows — and the bank is WALKABLE past its first page (the 101st document was
// unreachable before the cursor landed: the verb served one 100-row page and nothing could ask for more).

import { DATABANK_LIST_DEFAULT_LIMIT } from "@orb/contracts/databank";
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
