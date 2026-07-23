// verb: list — owner-scoped, newest-activity first, optional origin filter. Load-bearing: only the caller's
// own documents appear (cross-tenant isolation), the origin filter narrows, and the list never leaks another
// owner's rows.

import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makeDatabankHarness, principalFor, seedUser } from "../_support.ts";

test("lists only the caller's documents, newest-activity first, and filters by origin", async () => {
  const db = await freshDb();
  const h = makeDatabankHarness(db);
  const owner = await seedUser(db, { handle: "owner" });
  const other = await seedUser(db, { handle: "other" });

  const first = await h.service.createFromText({ principal: principalFor(owner), name: "one.md", text: "first note" });
  h.advance(1000);
  const second = await h.service.createFromText({ principal: principalFor(owner), name: "two.md", text: "second note" });
  await h.service.createFromText({ principal: principalFor(other), name: "foreign.md", text: "not yours" });

  const list = await h.service.list({ principal: principalFor(owner) });
  expect(list.map((d) => d.id)).toEqual([second.document.id, first.document.id]); // newest updatedAt first

  const text = await h.service.list({ principal: principalFor(owner), origin: "text" });
  expect(text).toHaveLength(2);
  const uploads = await h.service.list({ principal: principalFor(owner), origin: "upload" });
  expect(uploads).toHaveLength(0);
});
