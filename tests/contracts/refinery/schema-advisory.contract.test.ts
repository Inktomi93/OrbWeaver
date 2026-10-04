// Contract tests for the raw-door PREFLIGHT (`schema-advisory.ts`): the ADVISORY tier between the belt's
// refusals and a clean save. Two properties this suite exists to hold:
//   1. it never blocks — a belt-legal schema produces advisories, never a refusal, and a garbage draft
//      produces an empty read rather than a throw (it runs on every keystroke of the JSON pane);
//   2. its wire claims are DERIVED, not declared — the stripped-keyword advisory names exactly what
//      `scrubWireSchema(…, "hosted-common")` removes, so it cannot drift from the wire it describes. The
//      NEGATIVE control below is the load-bearing half: a schema with no bound keywords must produce no
//      strip advisory, or the arm is firing on something else.

import { scrubWireSchema } from "@orb/contracts/inference";
import { refinerySchemaAdvisoryOf, refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { expect, test } from "../../support/fixtures.ts";

/** A belt-legal SCORE schema carrying the well-known core plus bounds the hosted wire does not carry. */
function boundedScoreSchema(): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      overallScore: { type: "number", minimum: 1, maximum: 10 },
      summary: { type: "string", maxLength: 400 },
      issues: { type: "array", items: { type: "string" }, minItems: 1 },
    },
    required: ["overallScore"],
  };
}

test("a bounded schema is BELT-LEGAL and still advises: the bounds the hosted wire drops are named, from the scrub itself", () => {
  const schema = boundedScoreSchema();
  // Tier 1 (the belt) is untouched — this schema SAVES.
  expect(refinerySchemaDocumentSchema.safeParse({ name: "bounded", description: "", stage: "score", schema }).success).toBe(true);

  const { advisories } = refinerySchemaAdvisoryOf(schema);
  const strip = advisories.find((a) => a.code === "wire-bounds-stripped");
  expect(strip).toBeDefined();
  // The advisory names exactly the keywords the scrub removed — derived, not a copied vendor table.
  const wire = JSON.stringify(scrubWireSchema(schema, "hosted-common").schema);
  for (const keyword of ["minimum", "maximum", "maxLength", "minItems"]) {
    expect(strip?.message).toContain(keyword);
    expect(wire).not.toContain(`"${keyword}"`);
  }
  // ADVISORY, not refusal: nothing here carries a blocking shape.
  expect(advisories.every((a) => a.message.length > 0)).toBe(true);
});

test("NEGATIVE CONTROL: a schema with no bound keywords advises nothing about the wire (the arm can be silent)", () => {
  const schema = {
    type: "object",
    properties: { overallScore: { type: "number" }, mood: { type: "string", enum: ["cozy", "tense"] } },
    required: ["overallScore", "mood"],
  };
  const { advisories, stats } = refinerySchemaAdvisoryOf(schema);
  expect(advisories).toEqual([]);
  // maxDepth counts NODE levels: the root is 0, its two leaf properties are 1.
  expect(stats).toEqual({ properties: 2, optionalFields: 0, anyOfBlocks: 0, anyOfVariants: 0, enums: 1, maxDepth: 1 });
});

test("the render-hint channel is never reported as stripped (it is ours and rides no wire)", () => {
  const schema = {
    type: "object",
    properties: { overallScore: { type: "number", "x-orb-ui": { role: "hero" } } },
    required: ["overallScore"],
  };
  expect(refinerySchemaAdvisoryOf(schema).advisories).toEqual([]);
});

test("stats count nested properties, optionals, unions and depth — the accounting the author reasons with", () => {
  const schema = {
    type: "object",
    properties: {
      overallScore: { type: "number" },
      block: {
        type: "object",
        properties: { a: { type: "string" }, b: { type: "string" } },
        required: ["a"],
      },
      rows: { type: "array", items: { type: "object", properties: { note: { type: "string" } }, required: [] } },
    },
    required: ["overallScore"],
  };
  const { stats } = refinerySchemaAdvisoryOf(schema);
  // 3 at the root + 2 in `block` + 1 in the array's item object.
  expect(stats.properties).toBe(6);
  // root: block + rows optional; block: b optional; item: note optional.
  expect(stats.optionalFields).toBe(4);
  // root(0) → properties(1) → items(2) → its properties(3).
  expect(stats.maxDepth).toBe(3);
});

test("a ceiling the target states is the planner's own violation: the hosted intersection binds past 24 optionals, a local target states none", () => {
  const optionalsOf = (n: number): Record<string, unknown> => ({
    type: "object",
    properties: Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i}`, { type: "string" }])),
    required: [],
  });
  // 24 optionals fit Anthropic's documented table, the strictest hosted ceiling.
  expect(refinerySchemaAdvisoryOf(optionalsOf(24)).advisories.filter((a) => a.code === "wire-limit")).toEqual([]);
  // 25 do not, and the advisory says how many against which limit.
  const over = refinerySchemaAdvisoryOf(optionalsOf(25)).advisories.filter((a) => a.code === "wire-limit");
  expect(over).toHaveLength(1);
  expect(over[0]?.message).toContain("optional-props 25 over the limit of 24");
  // A bound local target (vLLM guided decoding, no stated ceiling) raises none.
  expect(refinerySchemaAdvisoryOf(optionalsOf(25), { mode: "guided-decoding", limits: undefined }).advisories.filter((a) => a.code === "wire-limit")).toEqual(
    [],
  );
});

test("a construct the target's grammar cannot carry is a wire-refused advisory at its path", () => {
  const schema = { type: "object", properties: { pick: { oneOf: [{ type: "string" }, { type: "number" }] } }, required: ["pick"] };
  const refused = refinerySchemaAdvisoryOf(schema, { mode: "gemini-schema", limits: undefined }).advisories.filter((a) => a.code === "wire-refused");
  expect(refused.map((a) => a.path)).toEqual(["pick"]);
  // PLANTED CONTROL: the hosted intersection carries `oneOf`, so the same schema raises nothing there.
  expect(refinerySchemaAdvisoryOf(schema).advisories.filter((a) => a.code === "wire-refused")).toEqual([]);
});

test("a wide union advises on its variant count, at the node's own path", () => {
  const arms = Array.from({ length: 9 }, (_, i) => ({ type: "string", enum: [`a${i}`] }));
  const schema = { type: "object", properties: { pick: { anyOf: arms } }, required: [] };
  const advisories = refinerySchemaAdvisoryOf(schema).advisories;
  const union = advisories.find((a) => a.code === "anyof-variants");
  expect(union?.path).toBe("#/properties/pick");
  expect(union?.message).toContain("9 alternatives");
  // Eight is fine — the threshold is a real edge, not an always-on nag.
  expect(refinerySchemaAdvisoryOf({ type: "object", properties: { pick: { anyOf: arms.slice(0, 8) } }, required: [] }).advisories).toEqual([]);
});

test("TOTAL over a draft the belt has NOT judged: a shapeless value reads empty instead of throwing", () => {
  // The JSON pane calls this on every keystroke, over half-typed drafts that no belt has seen.
  expect(refinerySchemaAdvisoryOf({}).advisories).toEqual([]);
  expect(refinerySchemaAdvisoryOf({ type: "object" }).stats.properties).toBe(0);
  expect(refinerySchemaAdvisoryOf({ properties: "not an object" }).advisories).toEqual([]);
  expect(refinerySchemaAdvisoryOf({ type: "object", properties: { a: null }, required: 7 }).advisories).toEqual([]);
});
