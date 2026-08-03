// scrubWireSchema — the per-WIRE keyword subset, one engine three modes. What is pinned here is the SPLIT: a
// hosted request must not carry a keyword the vendor documents as unsupported, and a guided-decoding request
// must KEEP the bounds xgrammar compiles (the populate lever). Both directions matter — a blanket strip would
// silently disarm the local enforcing wire, and no strip at all is what shipped the banned keywords.

import type { WireSchemaMode } from "@orb/kit/json-schema";
import { dropNullValues, projectJsonSchema, scrubWireSchema, WIRE_SCHEMA_MODES } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures";

/** Every keyword appearing anywhere in a schema tree. */
function collectKeys(node: unknown, acc: Set<string> = new Set()): Set<string> {
  if (Array.isArray(node)) {
    for (const item of node) {
      collectKeys(item, acc);
    }
    return acc;
  }
  if (node === null || typeof node !== "object") {
    return acc;
  }
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    acc.add(key);
    collectKeys(value, acc);
  }
  return acc;
}

// A payload carrying every class at once: string bounds, numeric bounds, array bounds, annotations, the
// dialect meta key, and the constructs that must always survive.
const DIRTY = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  type: "object",
  title: "Delta",
  required: ["tags", "count", "kind"],
  properties: {
    tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 40 }, minItems: 1, maxItems: 8 },
    count: { type: "integer", minimum: 0, maximum: 10, multipleOf: 2, default: 0 },
    kind: { type: "string", enum: ["a", "b"], description: "which one" },
    note: { anyOf: [{ type: "string" }, { type: "null" }] },
  },
} as const;

test("hosted-common drops every BOUND keyword + the dialect meta key (both vendors' documented subsets)", () => {
  const keys = collectKeys(scrubWireSchema({ ...DIRTY }, "hosted-common").schema);
  for (const banned of ["minLength", "maxLength", "minimum", "maximum", "multipleOf", "minItems", "maxItems", "$schema"]) {
    expect(keys.has(banned)).toBe(false);
  }
  // …while the semantics the model is actually steered by survive.
  expect(keys.has("enum")).toBe(true);
  expect(keys.has("required")).toBe(true);
  expect(keys.has("anyOf")).toBe(true);
  expect(keys.has("description")).toBe(true); // prompt surface — never an annotation to drop
  // Annotations are NOT stripped on this wire (only the guided-decoding validator chokes on them).
  expect(keys.has("title")).toBe(true);
});

test("guided-decoding KEEPS the bounds (xgrammar compiles them — the populate lever) and drops only annotations", () => {
  const keys = collectKeys(scrubWireSchema({ ...DIRTY }, "guided-decoding").schema);
  for (const kept of ["minLength", "maxLength", "minimum", "maximum", "multipleOf", "minItems", "maxItems", "enum", "required"]) {
    expect(keys.has(kept)).toBe(true);
  }
  for (const dropped of ["title", "default", "$schema"]) {
    expect(keys.has(dropped)).toBe(false);
  }
});

test("anthropic-format REPORTS oneOf as refused (never strips it — removing it would change the meaning)", () => {
  const projected = projectJsonSchema(z.object({ op: z.discriminatedUnion("k", [z.object({ k: z.literal("a") }), z.object({ k: z.literal("b") })]) }));
  const { schema, refused } = scrubWireSchema(projected, "anthropic-format");
  expect(refused).toEqual(["oneOf"]);
  expect(collectKeys(schema).has("oneOf")).toBe(true); // reported, not silently rewritten
  // The other two wires carry `oneOf` fine (the forced-tool vehicle compiles no grammar; xgrammar accepts it).
  expect(scrubWireSchema(projected, "hosted-common").refused).toEqual([]);
  expect(scrubWireSchema(projected, "guided-decoding").refused).toEqual([]);
});

test("every mode is position-aware: a FIELD named `maximum`/`title`/`$schema`/`oneOf` survives, its own bounds still scrub", () => {
  const schema = {
    type: "object",
    properties: {
      maximum: { type: "integer", maximum: 10 },
      title: { type: "string", maxLength: 4 },
      $schema: { type: "string" },
      oneOf: { type: "string" },
    },
  };
  for (const mode of WIRE_SCHEMA_MODES) {
    const scrubbed = scrubWireSchema(schema, mode as WireSchemaMode);
    const props = scrubbed.schema["properties"] as Record<string, Record<string, unknown>>;
    expect(Object.keys(props)).toEqual(["maximum", "title", "$schema", "oneOf"]);
    // A field NAMED `oneOf` is data — it can never trip the Anthropic union refusal.
    expect(scrubbed.refused).toEqual([]);
  }
  // (In `strict-compatible` the field's own node is wrapped in the null union — pinned in its own test below.)
  const guided = scrubWireSchema(schema, "guided-decoding").schema["properties"] as Record<string, Record<string, unknown>>;
  expect(guided["maximum"]?.["type"]).toBe("integer");
  // Inside the field's OWN node, keyword matching resumes: the hosted wire drops that field's bound.
  const hosted = scrubWireSchema(schema, "hosted-common").schema["properties"] as Record<string, Record<string, unknown>>;
  expect(hosted["maximum"]?.["maximum"]).toBeUndefined();
});

test("never mutates the caller's schema — the SAME cached object also feeds the wire that needs the dropped keywords", () => {
  const input = { type: "object", properties: { n: { type: "integer", minimum: 1 } }, minProperties: 1 };
  scrubWireSchema(input, "hosted-common");
  expect(input.minProperties).toBe(1);
  expect(input.properties.n.minimum).toBe(1);
});

// ── strict-compatible (the OpenAI-strict OPTION, owner-built 2026-08-03) ────────────────────────────────
// "All fields or function parameters must be specified as `required`" + "Emulate optional parameters using
// union with null" (OpenAI structured-outputs guide). Zero optionals also clears Anthropic's undocumented
// optional-count ceiling — one reshape, both walls.

test("strict-compatible: EVERY property lands in `required`, and each optional becomes an anyOf null-union", () => {
  const projected = projectJsonSchema(z.object({ targetRef: z.string(), status: z.string().optional(), hp: z.number().int().optional() }));
  expect(projected["required"]).toEqual(["targetRef"]); // the projection is optional-by-construction…
  const strict = scrubWireSchema(projected, "strict-compatible").schema;
  const props = strict["properties"] as Record<string, Record<string, unknown>>;
  expect(strict["required"]).toEqual(["targetRef", "status", "hp"]); // …and every property is required here
  // The REQUIRED field is untouched — no pointless union on a field that was never optional.
  expect(props["targetRef"]).toEqual({ type: "string" });
  // The optionals carry the union, spelled `anyOf` — NEVER `"type":["string","null"]` (only OpenAI documents
  // the type-array form; `anyOf` + the `null` type are inside BOTH vendors' subsets).
  expect(props["status"]).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
  expect(JSON.stringify(strict)).not.toContain('["string","null"]');
  expect(props["hp"]?.["anyOf"]).toBeDefined();
  // The hosted keyword strip still applies (the safe-integer bounds zod stamps for `.int()` are gone).
  expect(JSON.stringify(strict)).not.toContain("maximum");
});

test("strict-compatible: nested objects are reshaped too, `description` is HOISTED, and an already-nullable field is left alone", () => {
  const strict = scrubWireSchema(
    {
      type: "object",
      properties: {
        scene: {
          type: "object",
          properties: { location: { type: "string", description: "where" }, note: { anyOf: [{ type: "string" }, { type: "null" }] } },
        },
      },
    },
    "strict-compatible",
  ).schema;
  // `scene` was itself optional, so it is the null-union too — its OBJECT arm carries the nested reshape.
  const sceneField = (strict["properties"] as Record<string, Record<string, unknown>>)["scene"] as Record<string, unknown>;
  const scene = (sceneField["anyOf"] as Record<string, unknown>[])[0] as Record<string, unknown>;
  expect(scene["required"]).toEqual(["location", "note"]);
  const sceneProps = scene["properties"] as Record<string, Record<string, unknown>>;
  // The instruction stays AT the property (a model reading the field sees it, not buried in arm 0).
  expect(sceneProps["location"]).toEqual({ description: "where", anyOf: [{ type: "string" }, { type: "null" }] });
  // An already-nullable field is not double-wrapped.
  expect(sceneProps["note"]).toEqual({ anyOf: [{ type: "string" }, { type: "null" }] });
});

test("dropNullValues: a null-valued key lands IDENTICALLY to an omitted one (the `null ≡ absent` half of strict)", () => {
  // The two payloads a strict wire vs an omit wire produce for the SAME extraction.
  const strictShaped = {
    party: [{ targetRef: "player", hpDelta: -2, status: null, addCondition: null, trackerDeltas: [{ key: "grit", delta: 1 }] }],
    scene: { location: "the ford", weather: null },
    quests: null,
  };
  const omitShaped = {
    party: [{ targetRef: "player", hpDelta: -2, trackerDeltas: [{ key: "grit", delta: 1 }] }],
    scene: { location: "the ford" },
  };
  expect(dropNullValues(strictShaped)).toEqual(omitShaped);
  // An ARRAY slot is positional — a null element is NOT erased (that would renumber the rest).
  expect(dropNullValues({ xs: [1, null, 2] })).toEqual({ xs: [1, null, 2] });
});

test("the CLOSED-OBJECT pin is per-mode: on where the wire requires it, and byte-invisible where it does not", () => {
  // The rpg constraint builds `oneOf` branches post-projection; an unpinned arm on an ENFORCING wire would
  // invite invented keys on exactly the shape the constraint exists to bind.
  // `t` is REQUIRED so the strict mode leaves it un-wrapped and all four modes read at the same path.
  const constrained = { type: "object", required: ["t"], properties: { t: { oneOf: [{ type: "object", properties: { a: { type: "string" } } }] } } };
  const armOf = (mode: WireSchemaMode): Record<string, unknown> | undefined => {
    const scrubbed = scrubWireSchema(constrained, mode).schema;
    return ((scrubbed["properties"] as Record<string, Record<string, unknown>>)["t"]?.["oneOf"] as Record<string, unknown>[])[0];
  };
  expect(armOf("guided-decoding")?.["additionalProperties"]).toBe(false); // xgrammar compiles the closure
  expect(armOf("strict-compatible")?.["additionalProperties"]).toBe(false); // OpenAI strict demands it
  // The hosted/Anthropic wires get the tree EXACTLY as projected (the projector already pinned what it built).
  expect(armOf("hosted-common")?.["additionalProperties"]).toBeUndefined();
  expect(armOf("anthropic-format")?.["additionalProperties"]).toBeUndefined();
});
