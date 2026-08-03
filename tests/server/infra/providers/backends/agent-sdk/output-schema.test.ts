// The Anthropic structured-output wire strip (D93). The agent-sdk backend feeds api.anthropic.com, whose
// `output_config.format.schema` subset rejects `oneOf` and every bound keyword (minItems/maxItems/minLength/…).
// sanitizeAnthropicOutputSchema is the per-backend translation (the mirror of vLLM's cleanJsonSchema, which
// KEEPS bounds); the bounds still ride the caller's post-parse zod belt. Load-bearing invariants:
//   • every bound keyword is stripped, on a CLONE (the same ResponseFormat.schema also feeds the vLLM wire).
//   • `oneOf` (a z.discriminatedUnion projection) THROWS a typed `invalid` error at the request boundary —
//     the D93 "flatten the union" guard fires BEFORE the live provider call, not as a cryptic 400.

import { projectJsonSchema } from "@orb/kit/json-schema";
import { ProviderError } from "@orb/server/infra/providers";
import { sanitizeAnthropicOutputSchema } from "@orb/server/infra/providers/backends/agent-sdk";
import { z } from "zod";
import { expect, test } from "../../../../../support/fixtures.ts";

const MODEL = "claude-sonnet-test";

const BOUND_KEYWORDS = [
  "minItems",
  "maxItems",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minProperties",
  "maxProperties",
  "multipleOf",
] as const;

/** Collect every keyword appearing anywhere in a schema tree (for a bound-free assertion). */
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

test("strips every bound keyword while keeping type/enum/required/anyOf", () => {
  const dirty = {
    type: "object",
    required: ["tags", "count", "kind"],
    minProperties: 1,
    properties: {
      tags: { type: "array", items: { type: "string", minLength: 1, maxLength: 40 }, minItems: 1, maxItems: 8 },
      count: { type: "integer", minimum: 0, maximum: 10, multipleOf: 2, exclusiveMinimum: -1, exclusiveMaximum: 11 },
      kind: { type: "string", enum: ["a", "b"] },
      note: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
  };
  const clean = sanitizeAnthropicOutputSchema(dirty, MODEL);
  const keys = collectKeys(clean);
  for (const bound of BOUND_KEYWORDS) {
    expect(keys.has(bound)).toBe(false);
  }
  expect(keys.has("enum")).toBe(true);
  expect(keys.has("required")).toBe(true);
  expect(keys.has("anyOf")).toBe(true);
  const props = clean["properties"] as Record<string, Record<string, unknown>>;
  expect(props["kind"]?.["enum"]).toEqual(["a", "b"]);
});

test("does not mutate the input (the same schema object also feeds the vLLM wire, which keeps bounds)", () => {
  const input = { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 };
  sanitizeAnthropicOutputSchema(input, MODEL);
  expect(input.minItems).toBe(1);
  expect(input.maxItems).toBe(8);
});

test("throws a typed invalid ProviderError on oneOf (the flatten-the-discriminated-union guard, D93)", () => {
  const projected = projectJsonSchema(z.object({ op: z.discriminatedUnion("k", [z.object({ k: z.literal("a") }), z.object({ k: z.literal("b") })]) }));
  // The projector itself does NOT throw — a green pnpm check sails past; the guard fires here.
  expect(projected["properties"]).toBeDefined();
  let thrown: unknown;
  try {
    sanitizeAnthropicOutputSchema(projected, MODEL);
  } catch (err) {
    thrown = err;
  }
  expect(thrown).toBeInstanceOf(ProviderError);
  expect((thrown as ProviderError).kind).toBe("invalid");
  expect((thrown as ProviderError).retryable).toBe(false);
});

test("is position-aware: a field NAMED maximum/oneOf under properties survives (keys are names, not keywords)", () => {
  const schema = {
    type: "object",
    required: ["maximum", "oneOf"],
    properties: {
      // A data field literally named `maximum` — its OWN bound must still strip, but the field must survive.
      maximum: { type: "integer", maximum: 10, minimum: 0 },
      // A data field literally named `oneOf` — must NOT trip the union guard.
      oneOf: { type: "string", maxLength: 40 },
    },
  };
  const clean = sanitizeAnthropicOutputSchema(schema, MODEL) as { properties: Record<string, Record<string, unknown>> };
  // Both fields survive.
  expect(Object.keys(clean.properties)).toEqual(["maximum", "oneOf"]);
  // The bound keyword INSIDE each field's own schema still strips (keyword-position matching resumes below).
  expect(clean.properties["maximum"]?.["maximum"]).toBeUndefined();
  expect(clean.properties["maximum"]?.["minimum"]).toBeUndefined();
  expect(clean.properties["maximum"]?.["type"]).toBe("integer");
  expect(clean.properties["oneOf"]?.["maxLength"]).toBeUndefined();
  expect(clean.properties["oneOf"]?.["type"]).toBe("string");
});

test("passes allOf through (z.intersection — live-probed ACCEPTED by the sonnet-5 structured wire, D93)", () => {
  const projected = projectJsonSchema(z.intersection(z.object({ a: z.string().max(9) }), z.object({ b: z.number() })));
  const clean = sanitizeAnthropicOutputSchema(projected, MODEL) as Record<string, unknown>;
  expect(Array.isArray(clean["allOf"])).toBe(true);
  // The bound inside the allOf branch still strips.
  const keys = collectKeys(clean);
  expect(keys.has("maxLength")).toBe(false);
  expect(keys.has("allOf")).toBe(true);
});

test("strips the top-level `$schema`/`$id` meta keys (the SDK --json-schema validator can't resolve the 2020-12 meta ref, D93)", () => {
  // `z.toJSONSchema` (via projectJsonSchema) stamps `$schema: "https://json-schema.org/draft/2020-12/schema"`;
  // the bundled runtime's validator has no meta-schema under that ref → "not a valid JSON Schema" (live-caught
  // 2026-07-27, agent-sdk × vLLM, the rpgExtractionSchema round-trip). Stripping it changes no CONSTRAINT.
  const projected = projectJsonSchema(z.object({ a: z.string() }));
  expect(projected["$schema"]).toBeDefined(); // the projector DOES stamp it (the source of the bug)
  const clean = sanitizeAnthropicOutputSchema({ ...projected, $id: "urn:x" }, MODEL) as Record<string, unknown>;
  expect(clean["$schema"]).toBeUndefined();
  expect(clean["$id"]).toBeUndefined();
  // The real schema body survives.
  expect(clean["type"]).toBe("object");
  expect((clean["properties"] as Record<string, unknown>)["a"]).toBeDefined();
});

test("a field literally NAMED `$schema` under properties survives (meta-strip is keyword-position-aware)", () => {
  const schema = { type: "object", properties: { $schema: { type: "string" } } };
  const clean = sanitizeAnthropicOutputSchema(schema, MODEL) as { properties: Record<string, unknown> };
  expect(clean.properties["$schema"]).toEqual({ type: "string" });
});
