// scrubWireSchema — the per-WIRE keyword subset, one engine three modes. What is pinned here is the SPLIT: a
// hosted request must not carry a keyword the vendor documents as unsupported, and a guided-decoding request
// must KEEP the bounds xgrammar compiles (the populate lever). Both directions matter — a blanket strip would
// silently disarm the local enforcing wire, and no strip at all is what shipped the banned keywords.

import type { WireSchemaMode } from "@orb/contracts/inference";
import { checkWireSchema, effectiveStructuredLimits, scrubWireSchema, WIRE_SCHEMA_MODES, WIRE_SUBSETS } from "@orb/contracts/inference";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { z } from "zod";
import { expect, test } from "../../support/fixtures.ts";

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
  expect(refused).toEqual([{ keyword: "oneOf", path: "op" }]);
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

// ── the CONSTRAINT NOTE (task #40) ──────────────────────────────────────────────────────────────────────
// A stripped bound is APPENDED to the node's `description`, never silently deleted: the wire loses the
// keyword, the model keeps the intent, and the caller's zod belt still enforces the original.

test("hosted: every stripped bound class lands in the node's description, existing prose PRESERVED", () => {
  const scrubbed = scrubWireSchema<Record<string, unknown>>(
    {
      type: "object",
      properties: {
        hp: { type: "integer", description: "current hit points", minimum: 1, maximum: 10, multipleOf: 2 },
        name: { type: "string", minLength: 2, maxLength: 40 },
        tags: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
        span: { type: "number", exclusiveMinimum: 0, exclusiveMaximum: 1 },
      },
      minProperties: 1,
      maxProperties: 9,
    },
    "hosted-common",
  ).schema;
  const props = scrubbed["properties"] as Record<string, Record<string, unknown>>;
  // Numeric bounds — appended after the author's own prose, with exactly one space.
  expect(props["hp"]?.["description"]).toBe("current hit points [Constraints: minimum: 1, maximum: 10, multipleOf: 2]");
  // String lengths — no prose of its own, so the note BECOMES the description.
  expect(props["name"]?.["description"]).toBe("[Constraints: minLength: 2, maxLength: 40]");
  // Array constraints, INCLUDING a `minItems` above 1 (the case the card-refinery precedent clamped; this
  // wire drops the keyword outright, so the note is the whole carrier).
  expect(props["tags"]?.["description"]).toBe("[Constraints: minItems: 3, maxItems: 8]");
  expect(props["span"]?.["description"]).toBe("[Constraints: exclusiveMinimum: 0, exclusiveMaximum: 1]");
  // Object bounds note on the node that carried them.
  expect(scrubbed["description"]).toBe("[Constraints: minProperties: 1, maxProperties: 9]");
  // …and the keywords themselves are still OFF the wire — the note is a description, never a reprieve.
  const keys = collectKeys(scrubbed);
  for (const banned of ["minimum", "maximum", "multipleOf", "minLength", "maxLength", "minItems", "maxItems", "minProperties", "maxProperties"]) {
    expect(keys.has(banned)).toBe(false);
  }
});

test("the note's spelling is DETERMINISTIC: keyword order is the table's, never the input object's", () => {
  const noteOf = (node: Record<string, unknown>): unknown => scrubWireSchema(node, "hosted-common").schema["description"];
  // The same constraints, authored in three different key orders, produce one byte-identical note.
  expect(noteOf({ type: "integer", minimum: 1, maximum: 10 })).toBe("[Constraints: minimum: 1, maximum: 10]");
  expect(noteOf({ type: "integer", maximum: 10, minimum: 1 })).toBe("[Constraints: minimum: 1, maximum: 10]");
  expect(noteOf({ maximum: 10, type: "integer", minimum: 1 })).toBe("[Constraints: minimum: 1, maximum: 10]");
});

test("zod's `.int()` safe-integer bounds are NOT noted — a projection artifact is not the author's intent", () => {
  const projected = projectJsonSchema(z.object({ n: z.number().int(), rated: z.number().int().min(1).max(5) }));
  const props = scrubWireSchema(projected, "hosted-common").schema["properties"] as Record<string, Record<string, unknown>>;
  // `z.number().int()` stamps ±Number.MAX_SAFE_INTEGER on EVERY integer node; noting it would put 34 bytes of
  // machine noise in front of the model on every int field, and it says nothing the type does not.
  expect(props["n"]?.["description"]).toBeUndefined();
  // A REAL bound on the same node still notes.
  expect(props["rated"]?.["description"]).toBe("[Constraints: minimum: 1, maximum: 5]");
});

test("guided-decoding notes NOTHING — the bounds ride the wire there, so a note would only duplicate them", () => {
  const guided = scrubWireSchema(
    { type: "object", properties: { hp: { type: "integer", description: "hp", minimum: 1, maximum: 10 } } },
    "guided-decoding",
  ).schema;
  const props = guided["properties"] as Record<string, Record<string, unknown>>;
  expect(props["hp"]).toEqual({ type: "integer", description: "hp", minimum: 1, maximum: 10 });
});

// ── the `minItems` CARVE-OUT (owner-supplied Anthropic structured-outputs doc, 2026-08-08: "Array minItems
//    (only values 0 and 1 supported)") ──────────────────────────────────────────────────────────────────────
// The ONE family-scoped exception to the bound strip. It must NOT leak to `hosted-common`, whose whole job is
// the intersection of families whose support for the keyword is unestablished.

test("anthropic-format KEEPS a supported minItems (0|1) verbatim — no clamp, no note, nothing to relay", () => {
  const kept = scrubWireSchema(
    { type: "object", properties: { a: { type: "array", minItems: 1 }, b: { type: "array", minItems: 0 } } },
    "anthropic-format",
  ).schema;
  const props = kept["properties"] as Record<string, Record<string, unknown>>;
  expect(props["a"]).toEqual({ type: "array", minItems: 1 });
  expect(props["b"]).toEqual({ type: "array", minItems: 0 });
});

test("anthropic-format CLAMPS an unsupported minItems to 1 and relays the AUTHOR's number in the description", () => {
  const clamped = scrubWireSchema(
    { type: "object", properties: { tags: { type: "array", description: "at least three", minItems: 3, maxItems: 8 } } },
    "anthropic-format",
  ).schema;
  const tags = (clamped["properties"] as Record<string, Record<string, unknown>>)["tags"];
  // The wire carries the strongest thing the endpoint can express …
  expect(tags?.["minItems"]).toBe(1);
  // … `maxItems` is still an unsupported keyword and comes off …
  expect(tags?.["maxItems"]).toBeUndefined();
  // … and BOTH real numbers reach the model, the author's own prose first.
  expect(tags?.["description"]).toBe("at least three [Constraints: minItems: 3, maxItems: 8]");
});

test("the carve-out is FAMILY-SCOPED: hosted-common still strips minItems outright (the intersection wire)", () => {
  const hosted = scrubWireSchema({ type: "object", properties: { tags: { type: "array", minItems: 3 } } }, "hosted-common").schema;
  const tags = (hosted["properties"] as Record<string, Record<string, unknown>>)["tags"];
  expect(tags?.["minItems"]).toBeUndefined();
  expect(tags?.["description"]).toBe("[Constraints: minItems: 3]");
  // The strict-compatible wire is the hosted subset plus a reshape — it inherits the strip, not the carve-out.
  const strict = scrubWireSchema({ type: "object", required: ["tags"], properties: { tags: { type: "array", minItems: 3 } } }, "strict-compatible").schema;
  expect((strict["properties"] as Record<string, Record<string, unknown>>)["tags"]?.["minItems"]).toBeUndefined();
});

test("strict-compatible: the note is HOISTED with the description, so it sits AT the property, not in arm 0", () => {
  const strict = scrubWireSchema({ type: "object", properties: { name: { type: "string", minLength: 2 } } }, "strict-compatible").schema;
  const props = strict["properties"] as Record<string, Record<string, unknown>>;
  expect(props["name"]).toEqual({ description: "[Constraints: minLength: 2]", anyOf: [{ type: "string" }, { type: "null" }] });
});

test("the BELT is untouched: the wire loses the keyword, the caller's zod still refuses the out-of-range reply", () => {
  const belt = z.object({ rating: z.number().min(1).max(10) });
  const wire = scrubWireSchema(projectJsonSchema(belt), "hosted-common").schema;
  const props = wire["properties"] as Record<string, Record<string, unknown>>;
  expect(props["rating"]?.["maximum"]).toBeUndefined(); // off the wire…
  expect(props["rating"]?.["description"]).toBe("[Constraints: minimum: 1, maximum: 10]"); // …stated to the model…
  expect(belt.safeParse({ rating: 11 }).success).toBe(false); // …and still enforced on the reply.
  expect(belt.safeParse({ rating: 10 }).success).toBe(true);
});

// ── the #40 coupling invariant (was prose-only: `WireSubset.clampMinItems`'s own doc comment) ──────────
// A mode that clamps `minItems` instead of stripping it MUST leave the keyword out of its `strip` set —
// `scrubKeywords` deletes a stripped keyword before the clamp step ever runs (it `continue`s past it), so
// a mode carrying BOTH would silently never clamp anything: the keyword is gone before `clampMinItems` can
// see it. The prose already stated this; nothing asserted it over the actual table.

test("no mode both STRIPS minItems and CLAMPS it — the clamp would never see a keyword the strip already dropped", () => {
  const offenders = WIRE_SCHEMA_MODES.filter((mode) => WIRE_SUBSETS[mode].clampMinItems && WIRE_SUBSETS[mode].strip.has("minItems"));
  expect(offenders).toEqual([]);
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
  expect(armOf("anthropic-format")?.["additionalProperties"]).toBe(false); // Anthropic requires every object closed
  // The hosted wire gets the tree exactly as projected (the projector already pinned what it built).
  expect(armOf("hosted-common")?.["additionalProperties"]).toBeUndefined();
});

// ── the gbnf and gemini-schema modes, and what a reshape records ─────────────────────────────────────

test("gbnf KEEPS integer bounds and strips them from a `number` node into the note (llama.cpp ranges are integer-only)", () => {
  const schema = { type: "object", required: ["n", "x"], properties: { n: { type: "integer", minimum: 1, maximum: 10 }, x: { type: "number", minimum: 0.5 } } };
  const props = scrubWireSchema(schema, "gbnf").schema["properties"] as Record<string, Record<string, unknown>>;
  expect(props["n"]).toMatchObject({ type: "integer", minimum: 1, maximum: 10 });
  expect(props["x"]).toEqual({ type: "number", description: "[Constraints: minimum: 0.5]" });
});

test("gbnf REFUSES what llama.cpp's converter skips silently: prefixItems, an unanchored pattern, a union beside properties", () => {
  const refusedOf = (schema: Record<string, unknown>): readonly string[] => scrubWireSchema(schema, "gbnf").refused.map((refusal) => refusal.keyword);
  expect(refusedOf({ type: "object", properties: { t: { type: "array", prefixItems: [{ type: "string" }] } } })).toEqual(["prefixItems"]);
  expect(refusedOf({ type: "object", properties: { id: { type: "string", pattern: "[a-z]+" } } })).toEqual(["unanchored pattern"]);
  expect(refusedOf({ type: "object", properties: { id: { type: "string", pattern: "^[a-z]+$" } } })).toEqual([]);
  expect(refusedOf({ type: "object", properties: { a: { type: "string" } }, anyOf: [{ required: ["a"] }] })).toEqual(["anyOf beside properties"]);
});

test("gemini-schema moves minLength and pattern into the note, keeps numeric bounds, and refuses oneOf and allOf", () => {
  const schema = {
    type: "object",
    properties: { name: { type: "string", minLength: 2, pattern: "^[A-Z]" }, n: { type: "integer", minimum: 1 }, pick: { oneOf: [{ type: "string" }] } },
  };
  const scrub = scrubWireSchema(schema, "gemini-schema");
  const props = scrub.schema["properties"] as Record<string, Record<string, unknown>>;
  expect(props["name"]).toEqual({ type: "string", description: "[Constraints: minLength: 2, pattern: ^[A-Z]]" });
  expect(props["n"]).toEqual({ type: "integer", minimum: 1 });
  expect(scrub.refused).toEqual([{ keyword: "oneOf", path: "pick" }]);
});

test("anthropic-format refuses allOf over a $ref and an external $ref, and names where", () => {
  const scrub = scrubWireSchema(
    { type: "object", properties: { a: { allOf: [{ $ref: "#/$defs/A" }] }, b: { $ref: "https://example.com/b.json" } }, $defs: { A: { type: "string" } } },
    "anthropic-format",
  );
  expect(scrub.refused).toEqual([
    { keyword: "allOf with $ref", path: "a" },
    { keyword: "external $ref", path: "b" },
  ]);
});

test("strict-compatible records exactly the reshaped paths, with [*] for an array of objects", () => {
  const schema = {
    type: "object",
    required: ["changes"],
    properties: {
      note: { type: "string" },
      changes: { type: "array", items: { type: "object", required: ["field"], properties: { field: { type: "string" }, value: { type: "string" } } } },
    },
  };
  const scrub = scrubWireSchema(schema, "strict-compatible");
  expect(scrub.reshapedPaths).toEqual(["changes[*].value", "note"]);
  expect(scrub.ambiguousPaths).toEqual([]);
  // A mode that does not reshape records nothing.
  expect(scrubWireSchema(schema, "hosted-common").reshapedPaths).toEqual([]);
});

test("an optional AND nullable property is ambiguous under the reshape; a required nullable one is the author's null", () => {
  const schema = {
    type: "object",
    required: ["kept"],
    properties: { kept: { anyOf: [{ type: "string" }, { type: "null" }] }, maybe: { type: ["string", "null"] } },
  };
  const scrub = scrubWireSchema(schema, "strict-compatible");
  expect(scrub.ambiguousPaths).toEqual(["maybe"]);
  expect(scrub.reshapedPaths).toEqual([]);
});

test("a reshaped path two union arms share with an author-declared nullable is ambiguous too", () => {
  const schema = {
    type: "object",
    required: ["entry"],
    properties: {
      entry: {
        anyOf: [
          { type: "object", required: [], properties: { value: { type: "string" } } },
          { type: "object", required: ["value"], properties: { value: { anyOf: [{ type: "string" }, { type: "null" }] } } },
        ],
      },
    },
  };
  expect(scrubWireSchema(schema, "strict-compatible").ambiguousPaths).toEqual(["entry.value"]);
});

test("null accepted through a $ref, an enum, a const or an all-null allOf counts as nullable: optional is ambiguous, never reshaped", () => {
  const schema = {
    type: "object",
    required: [],
    properties: {
      viaRef: { $ref: "#/$defs/Maybe" },
      viaEnum: { enum: ["a", null] },
      viaConst: { const: null },
      viaAllOf: { allOf: [{ type: ["string", "null"] }, { anyOf: [{ type: "null" }, { type: "string" }] }] },
      plainRef: { $ref: "#/$defs/Word" },
    },
    $defs: { Maybe: { anyOf: [{ type: "string" }, { type: "null" }] }, Word: { type: "string" } },
  };
  const scrub = scrubWireSchema(schema, "strict-compatible");
  expect(scrub.ambiguousPaths.toSorted()).toEqual(["viaAllOf", "viaConst", "viaEnum", "viaRef"]);
  // PLANTED CONTROL: a $ref to a non-null def is an ordinary optional and is reshaped.
  expect(scrub.reshapedPaths).toEqual(["plainRef"]);
});

test("a required field nullable through an enum or a $ref is the author's null: a reshape sharing its path is ambiguous", () => {
  const sharing = (declared: Record<string, unknown>): Record<string, unknown> => ({
    type: "object",
    required: ["entry"],
    properties: {
      entry: {
        anyOf: [
          { type: "object", required: [], properties: { value: { type: "string" } } },
          { type: "object", required: ["value"], properties: { value: declared } },
        ],
      },
    },
    $defs: { Maybe: { type: ["string", "null"] } },
  });
  expect(scrubWireSchema(sharing({ enum: ["x", null] }), "strict-compatible").ambiguousPaths).toEqual(["entry.value"]);
  expect(scrubWireSchema(sharing({ $ref: "#/$defs/Maybe" }), "strict-compatible").ambiguousPaths).toEqual(["entry.value"]);
  // PLANTED CONTROL: an enum without null declares no null, so the reshape owns the path.
  expect(scrubWireSchema(sharing({ enum: ["x", "y"] }), "strict-compatible").ambiguousPaths).toEqual([]);
});

test("a reshape inside $defs lands at each value path that references it", () => {
  const schema = {
    type: "object",
    required: ["a", "b"],
    properties: { a: { $ref: "#/$defs/Pair" }, b: { type: "array", items: { $ref: "#/$defs/Pair" } } },
    $defs: { Pair: { type: "object", required: ["k"], properties: { k: { type: "string" }, v: { type: "string" } } } },
  };
  expect(scrubWireSchema(schema, "strict-compatible").reshapedPaths).toEqual(["a.v", "b[*].v"]);
});

const keywordsRefused = (schema: Record<string, unknown>, mode: WireSchemaMode): string[] =>
  scrubWireSchema(schema, mode)
    .refused.map((refusal) => refusal.keyword)
    .toSorted();

test("anthropic-format refuses what Anthropic's subset lists as unsupported: complex enums, other formats, lookaround, open maps, recursion", () => {
  const schema = {
    type: "object",
    required: ["a", "b", "c", "d"],
    properties: {
      a: { enum: [{ x: 1 }, "y"] },
      b: { type: "string", format: "ipv4-ish" },
      c: { type: "string", pattern: "^(?=x)x$" },
      d: { type: "object", additionalProperties: { type: "string" } },
    },
  };
  expect(keywordsRefused(schema, "anthropic-format")).toEqual([
    "additionalProperties other than false",
    "enum of objects or arrays",
    "unsupported pattern feature",
    "unsupported string format",
  ]);
  const recursive = {
    type: "object",
    required: ["n"],
    properties: { n: { $ref: "#/$defs/Node" } },
    $defs: { Node: { type: "object", required: [], properties: { next: { $ref: "#/$defs/Node" } } } },
  };
  expect(keywordsRefused(recursive, "anthropic-format")).toEqual(["recursive $ref"]);
  // A root-recursive zod schema projects its self-reference as `"$ref": "#"`.
  interface TreeNode {
    name: string;
    kids: TreeNode[];
  }
  const treeNode: z.ZodType<TreeNode> = z.object({
    name: z.string(),
    get kids() {
      return z.array(treeNode);
    },
  });
  const rootRecursive = projectJsonSchema(treeNode);
  expect(JSON.stringify(rootRecursive)).toContain('"$ref":"#"');
  expect(checkWireSchema([rootRecursive], "anthropic-format", undefined).violations).toEqual([
    { kind: "refused-keyword", mode: "anthropic-format", keyword: "recursive $ref", path: "" },
  ]);
  // PLANTED CONTROL: a documented format, a plain anchored pattern and a flat reference all fit.
  const fine = {
    type: "object",
    required: ["when", "code", "ref"],
    properties: { when: { type: "string", format: "date" }, code: { type: "string", pattern: "^[A-Z]{3}$" }, ref: { $ref: "#/$defs/Leaf" } },
    $defs: { Leaf: { type: "string" } },
  };
  expect(keywordsRefused(fine, "anthropic-format")).toEqual([]);
});

test("guided-decoding refuses what xgrammar refuses: a length bound beside pattern or format, propertyNames beside properties", () => {
  const schema = {
    type: "object",
    properties: { s: { type: "string", pattern: "^a+$", maxLength: 4 }, m: { type: "object", propertyNames: { pattern: "^k" }, properties: {} } },
  };
  expect(keywordsRefused(schema, "guided-decoding")).toEqual(["pattern or format with a length bound", "propertyNames beside property constraints"]);
  // PLANTED CONTROL: either bound alone compiles.
  expect(
    keywordsRefused({ type: "object", properties: { s: { type: "string", pattern: "^a+$" }, t: { type: "string", maxLength: 4 } } }, "guided-decoding"),
  ).toEqual([]);
});

test("gbnf refuses what llama.cpp's converter skips or breaks on: $anchor, minContains, and a reference inside a definition", () => {
  const schema = {
    type: "object",
    properties: { a: { $anchor: "x", type: "string" }, b: { type: "array", items: { type: "string" }, minContains: 1 }, c: { $ref: "#/$defs/Outer" } },
    $defs: { Outer: { type: "object", properties: { inner: { $ref: "#/$defs/Inner" } } }, Inner: { type: "string" } },
  };
  expect(keywordsRefused(schema, "gbnf")).toEqual(["$anchor", "$ref inside $defs", "minContains"]);
});

test("strict-compatible caps one string enum past 250 values at 15,000 characters; a short enum of long values is not that ceiling", () => {
  const long = Array.from({ length: 251 }, (_, i) => `${"v".repeat(60)}${String(i)}`);
  const schema = { type: "object", required: ["pick"], properties: { pick: { type: "string", enum: long } } };
  const limits = effectiveStructuredLimits("strict-compatible", undefined);
  expect(checkWireSchema([schema], "strict-compatible", limits).violations).toMatchObject([{ kind: "long-enum-chars", limit: 15_000 }]);
  const short = { type: "object", required: ["pick"], properties: { pick: { type: "string", enum: long.slice(0, 250) } } };
  expect(checkWireSchema([short], "strict-compatible", limits).fits).toBe(true);
});
