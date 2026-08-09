// .int tests for `updateSchema`: version bumps on CONTENT change only (the P1-B provenance pin), the
// merged document re-runs the whole belt, and foreign ids collapse leak-free.

import { DomainNotFoundError } from "@orb/kit/errors";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

const SCORE_CORE_REFUSAL = /overallScore/u;

test("update bumps version on CONTENT change only; foreign owner collapses to NOT_FOUND", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_usch_a" });
  const other = await seedUser(db, { id: "user_usch_b" });
  const h = makeRefineryHarness(db);
  const created = await h.svc.createSchema({ principal: principal(owner), name: "vibe_scorer", description: "v1", stage: "score", schema: validScoreSchema() });

  // A description-only edit is prose, not provenance — no version bump.
  const prose = await h.svc.updateSchema({ principal: principal(owner), schemaId: created.id, patch: { description: "rate the VIBE" } });
  expect(prose.version).toBe(1);

  // A schema edit IS provenance — the pin bumps.
  const bumped = await h.svc.updateSchema({
    principal: principal(owner),
    schemaId: created.id,
    patch: { schema: { ...validScoreSchema(), properties: { ...(validScoreSchema()["properties"] as object), extra: { type: "string" } } } },
  });
  expect(bumped.version).toBe(2);

  // The merged document re-runs the belt — an update cannot smuggle a core-less schema past it.
  await expect(
    h.svc.updateSchema({ principal: principal(owner), schemaId: created.id, patch: { schema: { type: "object", properties: {}, required: [] } } }),
  ).rejects.toThrow(SCORE_CORE_REFUSAL);

  // Foreign owner — leak-free collapse.
  await expect(h.svc.updateSchema({ principal: principal(other), schemaId: created.id, patch: { description: "steal" } })).rejects.toThrow(DomainNotFoundError);
});
