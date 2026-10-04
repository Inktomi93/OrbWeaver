// .int tests for `previewSchemaPlan`: the draft the plan judges is the one a refinery run would send (belted and
// projected closed), and a draft the belt refuses has no plan.

import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

test("the plan is asked about the projected draft a run would send; a belt-refused draft gets no plan and asks nothing", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_psp_a" });
  const h = makeRefineryHarness(db);
  const p = principal(owner);

  expect(await h.svc.previewSchemaPlan({ principal: p, schema: validScoreSchema(), stage: "score" })).toEqual({ outcome: "unbound" });
  // The projection closes every object, exactly as the run's send does.
  expect(h.planCalls).toHaveLength(1);
  expect(h.planCalls[0]).toMatchObject({ type: "object", additionalProperties: false });

  expect(await h.svc.previewSchemaPlan({ principal: p, schema: { type: "string" }, stage: "score" })).toBeNull();
  expect(h.planCalls).toHaveLength(1);
});
