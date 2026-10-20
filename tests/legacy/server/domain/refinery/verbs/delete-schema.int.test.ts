// .int tests for `deleteSchema`: the owner's delete lands; foreign/absent ids collapse leak-free.
// @subject packages/server/src/domain/refinery/verbs/delete-schema.ts

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefinerySchemaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "@orb/testkit/node/db.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

test("the owner's delete lands; foreign and absent ids collapse to NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_dsch_a" });
  const other = await seedUser(db, { id: "user_dsch_b" });
  const h = makeRefineryHarness(db);
  const created = await h.svc.createSchema({
    principal: await principal(db, owner),
    name: "vibe_scorer",
    description: "",
    stage: "score",
    schema: validScoreSchema(),
  });

  await expect(h.svc.deleteSchema({ principal: await principal(db, other), schemaId: created.id })).rejects.toThrow(DomainNotFoundError);
  await expect(h.svc.deleteSchema({ principal: await principal(db, owner), schemaId: castId<RefinerySchemaId>("refinery_schema_gone") })).rejects.toThrow(
    DomainNotFoundError,
  );

  await h.svc.deleteSchema({ principal: await principal(db, owner), schemaId: created.id });
  expect(await h.svc.listSchemas({ principal: await principal(db, owner) })).toHaveLength(0);
  // Create + delete announced; the foreign and absent refusals did not (both threw before any write).
  expect(h.userEvents).toEqual([
    { userId: owner, event: { type: "refineryChanged" } },
    { userId: owner, event: { type: "refineryChanged" } },
  ]);
});
