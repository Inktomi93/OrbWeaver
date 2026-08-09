// .int tests for `createSchema`: the write belt (lift + tightenings + well-known core) refuses BEFORE
// anything persists, and the S5 per-owner CASE-INSENSITIVE name hygiene.

import type { RefinerySchemaStage } from "@orb/contracts/refinery";
import { ZodError } from "zod";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser, validScoreSchema } from "../_support.ts";

const PATTERN_REFUSAL = /pattern/u;
const DEPTH_REFUSAL = /deeper/u;
const HINT_REFUSAL = /x-orb-ui/u;
const SCORE_CORE_REFUSAL = /overallScore/u;
const VERDICT_CORE_REFUSAL = /verdict/u;
const NAME_TAKEN_REFUSAL = /already have a schema/u;

test("create runs the whole belt and returns the library row at version 1", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_csch_a" });
  const h = makeRefineryHarness(db);
  const created = await h.svc.createSchema({
    principal: principal(owner),
    name: "vibe_scorer",
    description: "rate the vibe 1-10",
    stage: "score",
    schema: validScoreSchema(),
  });
  expect(created.version).toBe(1);
  expect(created.stage).toBe("score");
  expect(created.schema).toEqual(validScoreSchema());
});

test("the belt refuses: out-of-subset, pattern, over-depth, malformed hint, missing core — each typed", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_csch_b" });
  const h = makeRefineryHarness(db);
  const p = principal(owner);
  const create = (schema: Record<string, unknown>, stage: RefinerySchemaStage = "score"): ReturnType<typeof h.svc.createSchema> =>
    h.svc.createSchema({ principal: p, name: "x", description: "", stage, schema });

  // Out-of-subset ($ref) — the lift's own refusal rides through.
  await expect(create({ type: "object", properties: { a: { $ref: "#/x" } }, required: [] })).rejects.toThrow(ZodError);
  // pattern — the refinery ReDoS refusal (kit would ACCEPT this; the positive control that the
  // tightening, not the lift, is what bites).
  await expect(
    create({ ...validScoreSchema(), properties: { ...(validScoreSchema()["properties"] as object), p: { type: "string", pattern: "a+" } } }),
  ).rejects.toThrow(PATTERN_REFUSAL);
  // over-depth (9 nested objects > the refinery cap of 8; kit's cap is 32 — again the tightening bites).
  let deep: Record<string, unknown> = { type: "object", properties: {}, required: [] };
  for (let i = 0; i < 9; i += 1) {
    deep = { type: "object", properties: { down: deep }, required: [] };
  }
  const deepWithCore = {
    ...deep,
    properties: { ...(deep["properties"] as object), overallScore: { type: "number", minimum: 1, maximum: 10 } },
    required: ["overallScore"],
  };
  await expect(create(deepWithCore)).rejects.toThrow(DEPTH_REFUSAL);
  // malformed hint — refuses at SAVE (render-side heals, save-side refuses).
  await expect(
    create({
      ...validScoreSchema(),
      properties: { ...(validScoreSchema()["properties"] as object), h: { type: "string", "x-orb-ui": { role: "no-such-role" } } },
    }),
  ).rejects.toThrow(HINT_REFUSAL);
  // missing core — a score schema without the 1-10 overallScore.
  await expect(create({ type: "object", properties: { notes: { type: "string" } }, required: [] })).rejects.toThrow(SCORE_CORE_REFUSAL);
  // analyze core — verdict enum must be exactly the three spellings.
  await expect(
    create({ type: "object", properties: { verdict: { type: "string", enum: ["GOOD", "BAD"] } }, required: ["verdict"] }, "analyze"),
  ).rejects.toThrow(VERDICT_CORE_REFUSAL);
});

test("S5 hygiene: per-owner name uniqueness is CASE-INSENSITIVE; another owner may reuse the name", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_csch_c" });
  const other = await seedUser(db, { id: "user_csch_d" });
  const h = makeRefineryHarness(db);
  await h.svc.createSchema({ principal: principal(owner), name: "MyScorer", description: "", stage: "score", schema: validScoreSchema() });
  await expect(
    h.svc.createSchema({ principal: principal(owner), name: "myscorer", description: "", stage: "score", schema: validScoreSchema() }),
  ).rejects.toThrow(NAME_TAKEN_REFUSAL);
  await expect(
    h.svc.createSchema({ principal: principal(other), name: "myscorer", description: "", stage: "score", schema: validScoreSchema() }),
  ).resolves.toBeDefined();
});
