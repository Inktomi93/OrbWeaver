// .int tests for `generateSchema` (the NL→schema door): the §4.5 lift-refusal BRIDGE (the bounded
// retry's correction quotes the belt's refusal with its path), the {{core}} stage splice, the
// schema_forge posture, and the errors-as-data double-failure arm (show-the-partial).

import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

test("a valid draft resolves; the system prompt teaches the subset + splices the stage core", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_a" });
  const h = makeRefineryHarness(db);
  h.queueReply(JSON.stringify({ name: "vibe_scorer", schema: validScoreSchema() }));
  const result = await h.svc.generateSchema({ principal: principal(owner), description: "rate the vibe 1-10 plus a mood", stage: "score" });
  expect(result).toEqual({ kind: "draft", name: "vibe_scorer", schema: validScoreSchema() });
  const call = h.summarizeCalls.at(-1);
  // The schemaForge slot + the SCORE core splice (the {{core}} token resolved, not echoed).
  expect(call?.system).toContain("x-orb-ui");
  expect(call?.system).toContain('"overallScore"');
  expect(call?.system).not.toContain("{{core}}");
  expect(call?.user).toContain("rate the vibe");
  // The generation call runs the schema_forge posture (the summarize seam speaks `maxTokens`).
  expect(call?.opts?.maxTokens).toBe(768);
  expect(call?.opts?.temperature).toBe(0.2);
  expect(call?.opts?.responseFormat?.name).toBe("refinery_schema_draft");
});

test("the bounded retry's correction IS the belt refusal; a DOUBLE failure resolves as the failed arm with the raw reply", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_b" });
  const h = makeRefineryHarness(db);
  // Turn 1: a draft outside the subset. Turn 2: fixed — the correction prompt carried the refusal.
  h.queueReply(JSON.stringify({ name: "bad", schema: { type: "object", properties: { a: { oneOf: [{ type: "string" }] } }, required: [] } }));
  h.queueReply(JSON.stringify({ name: "good_scorer", schema: validScoreSchema() }));
  const fixed = await h.svc.generateSchema({ principal: principal(owner), description: "anything", stage: "score" });
  expect(fixed.kind).toBe("draft");
  expect(h.summarizeCalls).toHaveLength(2);
  expect(h.summarizeCalls[1]?.user).toContain("liftable subset");
  expect(h.summarizeCalls[1]?.user).toContain("#/properties/a");

  // Double failure → the failed arm CARRIES the raw last reply for hand-fixing (errors-as-data).
  h.queueReply("not even json");
  h.queueReply('{"name":"still_bad","schema":{"type":"object","properties":{"x":{"$ref":"#/nope"}},"required":[]}}');
  const failed = await h.svc.generateSchema({ principal: principal(owner), description: "anything", stage: "analyze" });
  expect(failed).toMatchObject({ kind: "failed", raw: expect.stringContaining("still_bad") });
});
