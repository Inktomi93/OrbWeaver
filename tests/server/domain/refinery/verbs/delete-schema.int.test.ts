// .int tests for `deleteSchema`: the owner's delete lands; foreign/absent ids collapse leak-free.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { RefinerySchemaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

test("the owner's delete lands; foreign and absent ids collapse to NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_dsch_a" });
  const other = await seedUser(db, { id: "user_dsch_b" });
  const h = makeRefineryHarness(db);
  const created = await h.svc.createSchema({ principal: principal(owner), name: "vibe_scorer", description: "", stage: "score", schema: validScoreSchema() });

  await expect(h.svc.deleteSchema({ principal: principal(other), schemaId: created.id })).rejects.toThrow(DomainNotFoundError);
  await expect(h.svc.deleteSchema({ principal: principal(owner), schemaId: castId<RefinerySchemaId>("refinery_schema_gone") })).rejects.toThrow(
    DomainNotFoundError,
  );

  await h.svc.deleteSchema({ principal: principal(owner), schemaId: created.id });
  expect(await h.svc.listSchemas({ principal: principal(owner) })).toHaveLength(0);
});
