// contracts/refinery/schema-authoring — the SF0 document belt (lift + refinery tightenings + the
// well-known core) and the render-hint vocabulary. The belt's REFUSALS are the contract: each arm is
// pinned with a planted violation (a green that cannot fail ratifies nothing), and the healing read-side
// hint posture is pinned against the refusing save-side one.

import type { REFINERY_SCHEMA_STAGES } from "@orb/contracts/refinery";
import { REFINERY_SCHEMA_MAX_DEPTH, refinerySchemaDocumentSchema, renderHintOf, renderHintSchema } from "@orb/contracts/refinery";
import { expect, test } from "../../support/fixtures.ts";

function scoreSchema(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: "object",
    properties: { overallScore: { type: "number", minimum: 1, maximum: 10 }, ...extra },
    required: ["overallScore"],
  };
}

test("a belt-legal score document parses; each tightening arm refuses with its own message", () => {
  expect(refinerySchemaDocumentSchema.safeParse({ name: "ok_scorer", description: "", stage: "score", schema: scoreSchema() }).success).toBe(true);

  const refusalOf = (schema: Record<string, unknown>, stage: (typeof REFINERY_SCHEMA_STAGES)[number] = "score"): string => {
    const result = refinerySchemaDocumentSchema.safeParse({ name: "x", description: "", stage, schema });
    expect(result.success).toBe(false);
    return result.success ? "" : (result.error.issues[0]?.message ?? "");
  };

  // pattern — refused HERE even though kit's lift accepts it (the refinery ReDoS tightening).
  expect(refusalOf(scoreSchema({ p: { type: "string", pattern: "a+" } }))).toContain("pattern");
  // depth — one past the refinery cap (kit's own cap is 32; the tightening is what bites).
  let deep: Record<string, unknown> = { type: "object", properties: {}, required: [] };
  for (let i = 0; i < REFINERY_SCHEMA_MAX_DEPTH + 1; i += 1) {
    deep = { type: "object", properties: { down: deep }, required: [] };
  }
  expect(
    refusalOf({
      ...deep,
      properties: { ...(deep["properties"] as object), overallScore: { type: "number", minimum: 1, maximum: 10 } },
      required: ["overallScore"],
    }),
  ).toContain("deeper");
  // malformed hint — refuses at save (the read side heals instead, below).
  expect(refusalOf(scoreSchema({ h: { type: "string", "x-orb-ui": { role: "no-such-role" } } }))).toContain("x-orb-ui");
  // the well-known cores, both stages.
  expect(refusalOf({ type: "object", properties: { notes: { type: "string" } }, required: [] })).toContain("overallScore");
  expect(refusalOf({ type: "object", properties: { verdict: { type: "string", enum: ["GOOD"] } }, required: ["verdict"] }, "analyze")).toContain("verdict");
  // an out-of-subset construct rides the lift's own refusal through, path intact (a $ref node has no
  // `type`, so the lift's first refusal is the missing type — the subset teaching + the pointer path).
  const liftRefusal = refusalOf({ type: "object", properties: { a: { $ref: "#/x" } }, required: [] });
  expect(liftRefusal).toContain("liftable subset");
  expect(liftRefusal).toContain("#/properties/a");
  // the name grammar is the wire ResponseFormat identifier's.
  expect(refinerySchemaDocumentSchema.safeParse({ name: "has spaces", description: "", stage: "score", schema: scoreSchema() }).success).toBe(false);
});

test("hints: the save side REFUSES malformed, the render side HEALS to null — the two postures, pinned apart", () => {
  expect(renderHintSchema.safeParse({ role: "hero" }).success).toBe(true);
  expect(renderHintSchema.safeParse({ role: "no-such-role" }).success).toBe(false);
  // strict: an unknown hint key refuses (the closed vocabulary).
  expect(renderHintSchema.safeParse({ glitter: true }).success).toBe(false);
  // renderHintOf heals — render-by-structure, never a render failure.
  expect(renderHintOf({ "x-orb-ui": { role: "hero" } })).toEqual({ role: "hero" });
  expect(renderHintOf({ "x-orb-ui": { role: "no-such-role" } })).toBeNull();
  expect(renderHintOf({})).toBeNull();
});
