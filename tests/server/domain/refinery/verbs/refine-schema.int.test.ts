// .int tests for `refineSchema` — one conversational iteration over the CURRENT draft (the loop is
// verb-call-per-instruction; the retry budget stays the structured-turn's one). Post-task-#36 the model
// answers in the forge's leaf language, so the CURRENT schema is prompt material rather than a typed input —
// which is what lets a hand-authored raw-door schema (outside the leaf language) still be refined.

import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

const designReply = JSON.stringify({
  name: "vibe_scorer2",
  description: "a vibe readout",
  fields: [
    { path: "mood", type: "string", description: "the mood", required: true, enum: ["COZY", "SHARP"] },
    { path: "moodNote", type: "string", description: "one line on the mood", required: false, maxLength: 200 },
  ],
});

test("refines the CURRENT draft: the prompt carries the schema + the instruction; the reply lands as a belt-legal draft", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rsch_a" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply);
  const refined = await h.svc.refineSchema({ principal: principal(owner), schema: validScoreSchema(), instruction: "add a mood note", stage: "score" });
  if (refined.kind !== "draft") {
    throw new Error(`expected the draft arm, got ${refined.kind}`);
  }
  expect(Object.keys(refined.schema["properties"] as object).sort()).toEqual(["mood", "moodNote", "overallScore"]);
  const call = h.summarizeCalls.at(-1);
  expect(call?.user).toContain("add a mood note");
  expect(call?.user).toContain('"overallScore"');
  expect(call?.user).toContain("The schema as it stands today");
  expect(call?.opts?.responseFormat?.name).toBe("refinery_schema_design");
  expect(call?.opts?.responseFormat?.vehicle).toBe("response-format");
});

test("a schema carrying a construct OUTSIDE the leaf language still refines — the current schema is prompt material, not a typed input", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_rsch_raw" });
  const h = makeRefineryHarness(db);
  // A hand-authored raw-door schema with a union node: unrepresentable as a design ROW, and that is fine —
  // it rides the prompt as JSON. (This is the regression guard for the "no inverse transpile" claim.)
  const handAuthored = {
    type: "object",
    properties: {
      overallScore: { type: "number", minimum: 1, maximum: 10 },
      odd: { anyOf: [{ type: "string" }, { type: "number" }] },
    },
    required: ["overallScore"],
  };
  h.queueReply(designReply);
  const refined = await h.svc.refineSchema({ principal: principal(owner), schema: handAuthored, instruction: "add a mood", stage: "score" });
  expect(refined.kind).toBe("draft");
  expect(h.summarizeCalls.at(-1)?.user).toContain("anyOf");
});
