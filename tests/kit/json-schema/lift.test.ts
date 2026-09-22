// liftJsonSchema — the JSON-Schema → zod lift (PL-B). Three proofs: (1) the ROUND-TRIP golden — for every
// supported construct, lift → projectJsonSchema is semantically equivalent to the guest input (the engine's
// pin); (2) the TRUST BOUNDARY — the lifted zod actually ENFORCES the constraints (a guest cannot over-permit
// its tool args); (3) CONSERVATIVE-OR-REFUSE — every unsupported construct is a typed refusal naming it,
// never a silent strip.

import { JsonSchemaLiftError, liftJsonSchema, MAX_LIFT_DEPTH, projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "../../support/fixtures.ts";

/** Build a `properties`-chain of the given nesting depth ({ type:object, properties:{ child:{ …deeper } } }),
 *  bottoming out in a string leaf — the shape a deeply-nested guest schema takes. */
function nestObjects(depth: number): Record<string, unknown> {
  let node: Record<string, unknown> = { type: "string" };
  for (let i = 0; i < depth; i++) {
    node = { type: "object", properties: { child: node }, additionalProperties: false };
  }
  return node;
}

/** Lift a guest schema then project it back, dropping the root `$schema` dialect envelope zod v4 emits (it
 *  rides the wire but is not part of the guest's structural input — the round-trip is over the STRUCTURE). */
function roundTrip(input: Record<string, unknown>): Record<string, unknown> {
  const { $schema: _dialect, ...structure } = projectJsonSchema(liftJsonSchema(input));
  return structure;
}

test("round-trip: a representative supported object projects back to its input", () => {
  const input = {
    type: "object",
    properties: {
      name: { type: "string", minLength: 1, maxLength: 40 },
      count: { type: "integer", minimum: 0, maximum: 10 },
      ratio: { type: "number" },
      tags: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
      mood: { type: "string", enum: ["calm", "tense"] },
      flag: { type: "boolean" },
    },
    required: ["name", "count"],
    additionalProperties: false,
  };
  expect(roundTrip(input)).toEqual(input);
});

test("round-trip: nested object + array-of-object, every object node pinned closed", () => {
  const input = {
    type: "object",
    properties: {
      target: { type: "object", properties: { id: { type: "string" } }, required: ["id"], additionalProperties: false },
      points: { type: "array", items: { type: "object", properties: { x: { type: "number" } }, additionalProperties: false } },
    },
    additionalProperties: false,
  };
  expect(roundTrip(input)).toEqual(input);
});

test("a heterogeneous runtime-generated tree keeps identical wire bytes and executable parse behavior", () => {
  const input = {
    type: "object",
    properties: {
      target: {
        type: "object",
        properties: {
          label: { type: "string", minLength: 2 },
          value: { anyOf: [{ type: "number" }, { type: "boolean" }] },
        },
        required: ["label", "value"],
        additionalProperties: false,
      },
      tags: { type: "array", items: { type: "string", enum: ["a", "b"] } },
    },
    required: ["target"],
    additionalProperties: false,
  };
  const lifted = liftJsonSchema(input);

  expect(roundTrip(input)).toEqual(input);
  expect(lifted.safeParse({ target: { label: "ok", value: true }, tags: ["a"] }).success).toBe(true);
  expect(lifted.safeParse({ target: { label: "x", value: null }, tags: ["c"] }).success).toBe(false);
});

test("round-trip: a const literal survives", () => {
  const input = { type: "object", properties: { kind: { type: "string", const: "fixed" } }, required: ["kind"], additionalProperties: false };
  expect(roundTrip(input)).toEqual(input);
});

test("round-trip: a NUMBER enum and a BOOLEAN enum survive (#1865)", () => {
  // The construct that cost the story-clocks example its activation: an ordinary "pick one of these sizes"
  // arg. `z.literal([4,6,8])` is what lifts it, and its projection is byte-identical to the input — which is
  // the only reason the subset was allowed to widen here at all.
  const numeric = { type: "object", properties: { segments: { type: "number", enum: [4, 6, 8] } }, required: ["segments"], additionalProperties: false };
  expect(roundTrip(numeric)).toEqual(numeric);
  const flag = { type: "object", properties: { loud: { type: "boolean", enum: [true, false] } }, required: ["loud"], additionalProperties: false };
  expect(roundTrip(flag)).toEqual(flag);
});

test("trust boundary: a lifted number enum accepts ONLY its members", () => {
  const lifted = liftJsonSchema({
    type: "object",
    properties: { segments: { type: "number", enum: [4, 6, 8] } },
    required: ["segments"],
    additionalProperties: false,
  });
  expect(lifted.safeParse({ segments: 6 }).success).toBe(true);
  // Off-list, and the neighbouring integer — a lift that had widened to a bare `number` would take both.
  expect(lifted.safeParse({ segments: 5 }).success).toBe(false);
  expect(lifted.safeParse({ segments: 7 }).success).toBe(false);
  expect(lifted.safeParse({ segments: "6" }).success).toBe(false);
});

test("round-trip: a type-less anyOf union survives (the shape a zod union projects to)", () => {
  // The construct the rpg state tools actually carry (`trackerSets[].value`: a number-or-string cell) — the
  // agent-sdk terminal mount lifts these schemas back to zod to DECLARE them, so a refusal here would cost the
  // whole D112 fold on that wire.
  const input = {
    type: "object",
    properties: { value: { anyOf: [{ type: "number" }, { type: "string" }] } },
    required: ["value"],
    additionalProperties: false,
  };
  expect(roundTrip(input)).toEqual(input);
});

test("trust boundary: a lifted union accepts ONLY its member types", () => {
  const lifted = liftJsonSchema({
    type: "object",
    properties: { value: { anyOf: [{ type: "number" }, { type: "string", minLength: 2 }] } },
    required: ["value"],
    additionalProperties: false,
  });
  expect(lifted.safeParse({ value: 3 }).success).toBe(true);
  expect(lifted.safeParse({ value: "ok" }).success).toBe(true);
  // A member's OWN constraint still bites inside the union.
  expect(lifted.safeParse({ value: "x" }).success).toBe(false);
  // A type outside every member is refused.
  expect(lifted.safeParse({ value: true }).success).toBe(false);
});

test("trust boundary: the lifted zod ENFORCES the guest constraints (accept valid, reject over-permitted)", () => {
  const lifted = liftJsonSchema({
    type: "object",
    properties: {
      name: { type: "string", minLength: 2 },
      count: { type: "integer", minimum: 0 },
      mood: { type: "string", enum: ["calm", "tense"] },
    },
    required: ["name"],
    additionalProperties: false,
  });
  expect(lifted.safeParse({ name: "ok", count: 3, mood: "calm" }).success).toBe(true);
  // Optional omitted → still valid.
  expect(lifted.safeParse({ name: "ok" }).success).toBe(true);
  // minLength violated.
  expect(lifted.safeParse({ name: "x" }).success).toBe(false);
  // integer minimum violated.
  expect(lifted.safeParse({ name: "ok", count: -1 }).success).toBe(false);
  // non-integer for integer.
  expect(lifted.safeParse({ name: "ok", count: 1.5 }).success).toBe(false);
  // enum off-list.
  expect(lifted.safeParse({ name: "ok", mood: "furious" }).success).toBe(false);
  // extra key — STRIPPED, not passed to the handler (z.object drops unknown keys; the wire schema still tells
  // the model additionalProperties:false, and a smuggled key never reaches the guest handler).
  const stripped = lifted.safeParse({ name: "ok", extra: 1 });
  expect(stripped.success).toBe(true);
  expect(stripped.success && "extra" in stripped.data).toBe(false);
  // missing required.
  expect(lifted.safeParse({ count: 1 }).success).toBe(false);
});

// CONSERVATIVE-OR-REFUSE: each unsupported construct is a typed refusal citing the construct — never a lift.
const REFUSALS: ReadonlyArray<{ readonly why: string; readonly schema: Record<string, unknown> }> = [
  { why: "non-object root", schema: { type: "string" } },
  { why: "anyOf with a sibling type (ambiguous)", schema: { type: "object", properties: { x: { type: "string", anyOf: [{ type: "string" }] } } } },
  { why: "anyOf with one member (degenerate)", schema: { type: "object", properties: { x: { anyOf: [{ type: "string" }] } } } },
  { why: "anyOf carrying an unsupported member", schema: { type: "object", properties: { x: { anyOf: [{ type: "string" }, { type: "null" }] } } } },
  { why: "$ref", schema: { type: "object", properties: { x: { $ref: "#/$defs/Foo" } } } },
  { why: "oneOf", schema: { type: "object", properties: { x: { oneOf: [{ type: "string" }] } } } },
  { why: "allOf", schema: { type: "object", properties: { x: { allOf: [{ type: "string" }] } } } },
  { why: "not", schema: { type: "object", properties: { x: { not: { type: "string" } } } } },
  { why: "patternProperties", schema: { type: "object", patternProperties: { "^a": { type: "string" } } } },
  { why: "additionalProperties:true (open bag)", schema: { type: "object", properties: {}, additionalProperties: true } },
  { why: "additionalProperties schema", schema: { type: "object", properties: {}, additionalProperties: { type: "string" } } },
  { why: "string format", schema: { type: "object", properties: { x: { type: "string", format: "email" } } } },
  { why: "number multipleOf", schema: { type: "object", properties: { x: { type: "number", multipleOf: 2 } } } },
  { why: "exclusiveMinimum", schema: { type: "object", properties: { x: { type: "number", exclusiveMinimum: 0 } } } },
  { why: "nullable union (type array)", schema: { type: "object", properties: { x: { type: ["string", "null"] } } } },
  { why: "OpenAPI nullable", schema: { type: "object", properties: { x: { type: "string", nullable: true } } } },
  { why: "type-less number enum (projects a type the guest did not write)", schema: { type: "object", properties: { x: { enum: [1, 2, 3] } } } },
  // The three shapes the #1865 widening deliberately did NOT take, each because its projection differs from
  // its input: integer has no zod literal (comes back `number`), and a single non-string member comes back
  // `const`. A mixed enum has no lossless literal union at all.
  { why: "integer enum (zod has no integer literal)", schema: { type: "object", properties: { x: { type: "integer", enum: [4, 6, 8] } } } },
  { why: "single-member number enum (projects as const)", schema: { type: "object", properties: { x: { type: "number", enum: [6] } } } },
  { why: "mixed-type enum", schema: { type: "object", properties: { x: { type: "number", enum: [1, "a"] } } } },
  { why: "tuple items", schema: { type: "object", properties: { x: { type: "array", items: [{ type: "string" }] } } } },
  { why: "array without items", schema: { type: "object", properties: { x: { type: "array" } } } },
  { why: "uniqueItems", schema: { type: "object", properties: { x: { type: "array", items: { type: "string" }, uniqueItems: true } } } },
  { why: "missing type", schema: { type: "object", properties: { x: {} } } },
];

test("conservative-or-refuse: every unsupported construct throws JsonSchemaLiftError, never a silent lift", () => {
  for (const { why, schema } of REFUSALS) {
    expect(() => liftJsonSchema(schema), why).toThrow(JsonSchemaLiftError);
  }
});

test("a malformed regex pattern is a typed refusal, not a thrown SyntaxError", () => {
  expect(() => liftJsonSchema({ type: "object", properties: { x: { type: "string", pattern: "(" } } })).toThrow(JsonSchemaLiftError);
});

/** Capture the `JsonSchemaLiftError` a schema provokes (fails the test if it does not refuse). */
function refusalOf(schema: Record<string, unknown>): JsonSchemaLiftError {
  try {
    liftJsonSchema(schema);
  } catch (err) {
    if (err instanceof JsonSchemaLiftError) {
      return err;
    }
    throw err;
  }
  throw new Error("expected liftJsonSchema to refuse, but it lifted");
}

test("the refusal names the offending construct + its path", () => {
  const lift = refusalOf({ type: "object", properties: { inner: { type: "object", properties: { bad: { type: "string", format: "email" } } } } });
  expect(lift.construct).toBe("format");
  expect(lift.path).toContain("bad");
});

test("an over-deep guest schema is a TYPED refusal, not a stack-blowing RangeError (INFO-3 depth cap)", () => {
  // Well past the cap — an unbounded recurse here would throw a V8 RangeError; the cap makes it a typed refusal.
  const overDeep = nestObjects(MAX_LIFT_DEPTH + 50);
  const lift = refusalOf(overDeep);
  expect(lift).toBeInstanceOf(JsonSchemaLiftError);
  expect(lift.construct).toBe("max-depth-exceeded");
});

test("a schema AT the depth cap still lifts (the cap is a ceiling, not an off-by-one)", () => {
  // A leaf sits one level below the deepest object; nesting to the cap keeps every liftNode call within bound.
  const atLimit = nestObjects(MAX_LIFT_DEPTH);
  expect(() => liftJsonSchema(atLimit)).not.toThrow();
});

// ── the x-orb-ui render-hint channel (schema-renderer §4.2 — the ONE kit change the refinery needs) ──────

test("x-orb-ui is ACCEPTED-AND-IGNORED on every node kind — hinted ≡ stripped (the golden)", () => {
  const hinted = {
    type: "object",
    "x-orb-ui": { role: "hero" },
    properties: {
      overallScore: { type: "number", minimum: 1, maximum: 10, "x-orb-ui": { role: "hero" } },
      verdict: { type: "string", enum: ["good", "bad"], "x-orb-ui": { role: "verdict", tone: { good: "good", bad: "bad" } } },
      pick: { anyOf: [{ type: "string" }, { type: "number" }], "x-orb-ui": { label: "Pick" } },
      done: { const: "yes", "x-orb-ui": { label: "Done" } },
    },
    required: ["overallScore"],
  };
  const stripOrbUi = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      return node.map(stripOrbUi);
    }
    if (node === null || typeof node !== "object") {
      return node;
    }
    return Object.fromEntries(
      Object.entries(node as Record<string, unknown>)
        .filter(([k]) => k !== "x-orb-ui")
        .map(([k, v]) => [k, stripOrbUi(v)]),
    );
  };
  const liftedHinted = liftJsonSchema(hinted);
  const liftedStripped = liftJsonSchema(stripOrbUi(hinted) as Record<string, unknown>);
  // Behavior-identical zod: same projection (so a hint can never reach any wire) …
  expect(projectJsonSchema(liftedHinted)).toEqual(projectJsonSchema(liftedStripped));
  // … and same accept/refuse behavior on data.
  expect(liftedHinted.safeParse({ overallScore: 7, verdict: "good", pick: 3, done: "yes" }).success).toBe(true);
  expect(liftedHinted.safeParse({ overallScore: 99 }).success).toBe(false);
});

test("only x-orb-ui is ignored — any OTHER x- keyword still refuses (the positive control)", () => {
  const lift = refusalOf({ type: "object", properties: { a: { type: "string", "x-vendor-thing": true } } });
  expect(lift.construct).toBe("x-vendor-thing");
});
