// .int tests for `generateSchema` (the NL→schema door) AFTER task #36's enforced-structured-output rework:
// the ENFORCED grammar rides every call, the well-known core is SPLICED (not asked for), the three
// authoring arms each drive their own call shape, and the honest-refusal / errors-as-data arms resolve
// rather than throw. The prompt is asserted for what it must NOT contain too — the veto was about a prompt
// begging for JSON, and a green that only checks the happy path would not have caught it.

import type { SchemaForgeResult } from "@orb/server/domain/refinery";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeRefineryHarness, principal, seedUser } from "../_support.ts";

/** Narrow a forge result to one arm, THROWING (never `expect`-inside-an-`if`) so the assertions after it are
 *  unconditional — the shape `noConditionalExpect` is asking for on a union-returning verb. */
function asArm<K extends SchemaForgeResult["kind"]>(result: SchemaForgeResult, kind: K): Extract<SchemaForgeResult, { kind: K }> {
  if (result.kind !== kind) {
    throw new Error(`expected the ${kind} arm, got ${result.kind}: ${JSON.stringify(result)}`);
  }
  return result as Extract<SchemaForgeResult, { kind: K }>;
}

/** `$ref` and an open `additionalProperties` map are the two structural failures measured on hosted endpoints. */
const OPEN_KEY_MAP_RE = /"additionalProperties":\{/;

/** One design row in the forge's leaf language. */
function fieldRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return { path: "mood", type: "string", description: "the dominant mood", required: true, ...over };
}
function designReply(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ name: "vibe_scorer", description: "a vibe readout", fields: [fieldRow()], ...over });
}

test("a design becomes a belt-legal draft; the call rides the ENFORCED grammar and the prompt teaches the task, not the format", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_a" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply());
  const result = asArm(await h.svc.generateSchema({ principal: principal(owner), description: "rate the vibe 1-10 plus a mood", stage: "score" }), "draft");

  // The stage core was SPLICED — the model never described it, and it is required at the exact 1-10 scale.
  const properties = result.schema["properties"] as Record<string, Record<string, unknown>>;
  expect(properties["overallScore"]).toMatchObject({ type: "number", minimum: 1, maximum: 10 });
  expect(result.schema["required"]).toContain("overallScore");
  expect(properties["mood"]).toMatchObject({ type: "string" });
  expect(result.dropped).toEqual([]);

  const call = h.summarizeCalls.at(-1);
  // THE ENFORCEMENT PAYLOAD is on the request — the whole point of the rework. It asks for the enforcing
  // wire vehicle explicitly, and its schema is the design grammar (fields), never a free-form object.
  expect(call?.opts?.responseFormat?.name).toBe("refinery_schema_design");
  expect(call?.opts?.responseFormat?.vehicle).toBe("response-format");
  const wireSchema = JSON.stringify(call?.opts?.responseFormat?.schema);
  expect(wireSchema).toContain('"fields"');
  expect(wireSchema).toContain('"needsRaw"');
  // …and it is SERVABLE: no $ref (Anthropic-family compilers refuse recursion) and no open key map (the
  // 2026-08-09 probe measured that variant returning an EMPTY design on that family).
  expect(wireSchema).not.toContain("$ref");
  expect(wireSchema).not.toMatch(OPEN_KEY_MAP_RE);

  // The prose slot teaches the DESIGN TASK. The vetoed instruction class is gone, and the {{core}}/{{task}}
  // tokens resolved rather than shipping literally.
  expect(call?.system).not.toContain("Respond with ONLY");
  expect(call?.system).not.toContain("{{core}}");
  expect(call?.system).not.toContain("{{task}}");
  expect(call?.system).toContain("overallScore");
  expect(call?.system).toContain("Design the whole schema now");
  expect(call?.user).toContain("rate the vibe");
  // The schema_forge posture, re-budgeted for the row language.
  expect(call?.opts?.maxOutputTokens).toBe(2048);
  expect(call?.opts?.temperature).toBe(0.2);
});

// The side-gen posture ladder folds the owner's preset `topP` in; the call must carry it, not drop it at a seam.
test("the owner's preset sampling reaches the forge call whole — topP included", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_topp" });
  const h = makeRefineryHarness(db, { presetParams: { topP: 0.85, temperature: 0.5 } });
  h.queueReply(designReply());
  asArm(await h.svc.generateSchema({ principal: principal(owner), description: "rate the vibe", stage: "score" }), "draft");
  expect(h.summarizeCalls.at(-1)?.opts).toMatchObject({ topP: 0.85, temperature: 0.5 });
});

test("a row the transpiler cannot place is itemized on the draft, never silently dropped", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_drop" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply({ fields: [fieldRow(), fieldRow({ path: "mood.tone" })] }));
  const result = asArm(await h.svc.generateSchema({ principal: principal(owner), description: "anything", stage: "score" }), "draft");
  expect(result.dropped).toHaveLength(1);
  expect(result.dropped[0]).toContain("mood.tone");
});

test("needsRaw resolves as the HONEST REFUSAL arm with a starter skeleton — never a flattened approximation", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_raw" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply({ needsRaw: true, needsRawReason: "the score can also be the word 'unrated'" }));
  const result = asArm(await h.svc.generateSchema({ principal: principal(owner), description: "a score that can be unrated", stage: "score" }), "needs-raw");
  expect(result.message).toContain("unrated");
  expect(result.message).toContain("raw schema editor");
  // The skeleton carries what DID fit, so the raw door opens on a starting point rather than a blank pane.
  expect((result.skeleton["properties"] as Record<string, unknown>)["mood"]).toBeDefined();
});

test("a reply outside the grammar retries ONCE and then resolves as the failed arm carrying the raw text", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_b" });
  const h = makeRefineryHarness(db);
  // Turn 1: a row with an unknown leaf type (the closed vocabulary refuses). Turn 2: fixed.
  h.queueReply(JSON.stringify({ name: "bad", description: "", fields: [fieldRow({ type: "date" })] }));
  h.queueReply(designReply());
  const fixed = await h.svc.generateSchema({ principal: principal(owner), description: "anything", stage: "score" });
  expect(fixed.kind).toBe("draft");
  expect(h.summarizeCalls).toHaveLength(2);
  // The retry quotes the grammar's own complaint back at the model, by path.
  expect(h.summarizeCalls[1]?.user).toContain("fields");

  h.queueReply("not even json");
  h.queueReply('{"name":"still_bad","description":"","fields":[{"path":"x","type":"date","description":"","required":true}]}');
  const failed = await h.svc.generateSchema({ principal: principal(owner), description: "anything", stage: "analyze" });
  expect(failed).toMatchObject({ kind: "failed", raw: expect.stringContaining("still_bad") });
});

test("the GUIDED arm plans first, then designs each planned field in ONE batch, and the plan owns the paths", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_guided" });
  const h = makeRefineryHarness(db);
  h.queueReply(
    JSON.stringify({
      name: "deep_scorer",
      description: "a thorough readout",
      fields: [
        { path: "mood", intent: "the dominant mood" },
        { path: "pace", intent: "how fast it moves" },
      ],
    }),
  );
  // The per-field turns. The second RENAMES its own path — the plan must win, or a field call could reshape
  // the schema the plan and the author agreed on.
  h.queueReply(JSON.stringify({ field: fieldRow({ path: "mood", enum: ["calm", "tense"] }) }));
  h.queueReply(JSON.stringify({ field: fieldRow({ path: "sneaky", type: "number", minimum: 1, maximum: 5 }) }));

  const result = asArm(
    await h.svc.generateSchema({ principal: principal(owner), description: "a thorough vibe read", stage: "score", arm: "guided" }),
    "draft",
  );
  expect(Object.keys(result.schema["properties"] as object).sort()).toEqual(["mood", "overallScore", "pace"]);

  // Call 1 = the plan grammar; calls 2-3 = the per-field grammar, in ONE batched summarize.
  expect(h.summarizeCalls[0]?.opts?.responseFormat?.name).toBe("refinery_schema_plan");
  expect(h.summarizeCalls[0]?.system).toContain("Do NOT design fields yet");
  expect(h.summarizeCalls[1]?.opts?.responseFormat?.name).toBe("refinery_schema_field");
  expect(h.summarizeCalls[1]?.system).toContain("EXACTLY ONE field");
  expect(h.summarizeCalls[2]?.user).toContain("pace");
  expect(h.summarizeCalls).toHaveLength(3);
});

test("the TWO-STAGE arm designs the structure hint-free, then a second call chooses the display vocabulary", async () => {
  const db = await freshDb();
  const owner = await seedUser(db, { id: "user_gsch_two" });
  const h = makeRefineryHarness(db);
  h.queueReply(designReply({ fields: [fieldRow({ enum: ["calm", "tense"] })] }));
  h.queueReply(JSON.stringify({ hints: [{ path: "mood", role: "verdict", tones: [{ member: "calm", tone: "good" }] }] }));

  const result = asArm(await h.svc.generateSchema({ principal: principal(owner), description: "a vibe read", stage: "score", arm: "two-stage" }), "draft");
  const mood = (result.schema["properties"] as Record<string, Record<string, unknown>>)["mood"] ?? {};
  expect(mood["x-orb-ui"]).toEqual({ role: "verdict", tone: { calm: "good" } });

  expect(h.summarizeCalls[0]?.system).toContain("Leave every display hint");
  expect(h.summarizeCalls[1]?.opts?.responseFormat?.name).toBe("refinery_schema_hints");
  // The hint call is shown the FINISHED fields, so it can only style what exists.
  expect(h.summarizeCalls[1]?.user).toContain("mood");
  expect(h.summarizeCalls).toHaveLength(2);
});
