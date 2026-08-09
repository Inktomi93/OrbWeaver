// .int tests for `listSchemas`: the OWNER's library only (no cross-tenant rows), newest-updated first.

import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

test("lists only the caller's schemas, newest-updated first", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_lsch_a" });
  const other = await seedUser(db, { id: "user_lsch_b" });
  const h = makeRefineryHarness(db);
  const p = principal(owner);
  const first = await h.svc.createSchema({ principal: p, name: "first_scorer", description: "", stage: "score", schema: validScoreSchema() });
  h.advance(1000);
  await h.svc.createSchema({ principal: p, name: "second_scorer", description: "", stage: "score", schema: validScoreSchema() });
  await h.svc.createSchema({ principal: principal(other), name: "foreign_scorer", description: "", stage: "score", schema: validScoreSchema() });

  const rows = await h.svc.listSchemas({ principal: p });
  expect(rows.map((r) => r.name)).toEqual(["second_scorer", "first_scorer"]);

  // An update re-sorts the library (updated_at ordering, the roster convention).
  h.advance(1000);
  await h.svc.updateSchema({ principal: p, schemaId: first.id, patch: { description: "touched" } });
  const resorted = await h.svc.listSchemas({ principal: p });
  expect(resorted.map((r) => r.name)).toEqual(["first_scorer", "second_scorer"]);
});
