// The Anthropic structured-output wire strip (D93). The agent-sdk backend feeds api.anthropic.com, whose
// `output_config.format.schema` subset rejects `oneOf` and every bound keyword (minItems/maxItems/minLength/…).
// sanitizeAnthropicOutputSchema is the per-backend translation (the mirror of vLLM's cleanJsonSchema, which
// KEEPS bounds); the bounds still ride the caller's post-parse zod belt. Load-bearing invariants:
//   • every bound keyword is stripped, on a CLONE (the same ResponseFormat.schema also feeds the vLLM wire).
//   • `oneOf` (a z.discriminatedUnion projection) THROWS a typed `invalid` error at the request boundary —
//     the D93 "flatten the union" guard fires BEFORE the live provider call, not as a cryptic 400.
//   • the four LIVE crew payload schemas (keeper/cardEvolution/director/proseAudit) project DIRTY (they carry
//     bounds) and come out anthropic-clean — proving the strip is load-bearing, not a no-op. The DIRECTOR is
//     the D93 canary: its twistOps was a `z.discriminatedUnion` (→ `oneOf`, which THROWS here) and was
//     flattened to an enum-tagged object — if it ever regresses, this loop THROWS instead of stripping.

import { crewCardEvolutionPayloadSchema, crewDirectorPayloadSchema, crewKeeperPayloadSchema, crewProseAuditPayloadSchema } from "@orb/contracts/crew";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { ProviderError } from "@orb/server/infra/providers";
import { sanitizeAnthropicOutputSchema } from "@orb/server/infra/providers/backends/agent-sdk";
import { z } from "zod";
import { expect, test } from "../../../../../support/fixtures";

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

test("the four live crew payload schemas project DIRTY and sanitize anthropic-clean (the strip is load-bearing)", () => {
  for (const schema of [crewKeeperPayloadSchema, crewCardEvolutionPayloadSchema, crewDirectorPayloadSchema, crewProseAuditPayloadSchema]) {
    const projected = projectJsonSchema(schema);
    const projectedKeys = collectKeys(projected);
    // Prove the wire schema WOULD carry a rejected bound today (else this test is guarding nothing).
    expect(BOUND_KEYWORDS.some((k) => projectedKeys.has(k))).toBe(true);
    // For the director this ALSO proves the twistOps flatten held — a `z.discriminatedUnion` would project to
    // `oneOf` and `sanitizeAnthropicOutputSchema` would THROW here instead of returning a clean tree (D93).
    const clean = collectKeys(sanitizeAnthropicOutputSchema(projected, MODEL));
    for (const bound of BOUND_KEYWORDS) {
      expect(clean.has(bound)).toBe(false);
    }
    expect(clean.has("oneOf")).toBe(false);
  }
});
