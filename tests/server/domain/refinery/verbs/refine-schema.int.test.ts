// .int tests for `refineSchema` — one conversational iteration over the CURRENT draft (the loop is
// verb-call-per-instruction; the retry budget stays the structured-turn's one).

import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

test("refines the CURRENT draft: the prompt carries the schema + the instruction; a valid reply lands as the draft", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rsch_a" });
  const h = makeRefineryHarness(db);
  h.queueReply(JSON.stringify({ name: "vibe_scorer2", schema: validScoreSchema() }));
  const refined = await h.svc.refineSchema({ principal: principal(owner), schema: validScoreSchema(), instruction: "add a mood note", stage: "score" });
  expect(refined.kind).toBe("draft");
  const call = h.summarizeCalls.at(-1);
  expect(call?.user).toContain("add a mood note");
  expect(call?.user).toContain('"overallScore"');
  expect(call?.user).toContain("Modify this schema");
});
