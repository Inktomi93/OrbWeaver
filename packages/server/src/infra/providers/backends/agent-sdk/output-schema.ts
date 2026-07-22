// The Anthropic structured-output wire quirk (D93) — the agent-sdk backend talks to api.anthropic.com,
// whose `output_config.format.schema` subset is STRICTER than valid JSON Schema: it rejects `oneOf` and
// every numeric/array/string/object BOUND keyword (`minItems`/`maxItems`/`minLength`/…). The D79 projector
// (`@orb/kit/json-schema`) is the ONE projection rule and stays backend-agnostic; the bound-strip is a
// per-backend wire translation homed HERE, exactly mirroring vLLM's `cleanJsonSchema` (which KEEPS bounds —
// vLLM guided decoding enforces them). One schema, two wires, opposite needs → the normalization cannot live
// in the shared projector; it belongs where each request is built.
//
// Bounds are NOT dropped from enforcement — they ride the POST-PARSE zod belt (`runStructuredTurn` validates
// the reply against the FULL bounded schema). `oneOf` cannot be stripped without changing meaning, so it
// THROWS a typed `invalid` error (a flatten-the-discriminated-union build bug, per D93) rather than reaching
// the live provider as a cryptic 400.
//
// `allOf` (z.intersection/.and()) is PASSED THROUGH — live-probed ACCEPTED by the sonnet-5 structured wire
// (D93 close-out). `anyOf` (nullable()) is likewise accepted; only `oneOf` (discriminatedUnion) is refused.
//
// The walk is POSITION-AWARE: under a `properties`/`$defs`/`definitions` map the KEYS are field NAMES, not
// schema keywords, so a field literally named `maximum` or `oneOf` is descended into as a schema (never
// keyword-stripped and never a false throw); keyword matching resumes inside each field's own schema node.

import { ProviderError } from "../../contract";

// The bound keywords Anthropic's structured-output subset refuses. Stripped on clone; the zod safeParse belt
// re-imposes them after the wire round-trip.
const BOUND_KEYWORDS: ReadonlySet<string> = new Set<string>([
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
]);

// Keys whose VALUE is a `{ name → schema }` map — the names are data, never keywords.
const NAME_MAP_KEYWORDS: ReadonlySet<string> = new Set<string>(["properties", "$defs", "definitions"]);

function walk(node: unknown, model: string): unknown {
  if (Array.isArray(node)) {
    return node.map((item) => walk(item, model));
  }
  if (node === null || typeof node !== "object") {
    return node;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === "oneOf") {
      // `nullable()` projects to `anyOf` (accepted); only `z.discriminatedUnion` → `oneOf`, which the wire
      // refuses. Fail LOUD at the request boundary — the fix is flattening to an enum-tagged object (D93).
      throw new ProviderError({
        kind: "invalid",
        retryable: false,
        message:
          "agent-sdk: structured-output schema is not Anthropic-clean — 'oneOf' is rejected by the wire. Flatten the discriminated union to an enum-tagged object (D93).",
        model,
      });
    }
    if (BOUND_KEYWORDS.has(key)) {
      continue;
    }
    out[key] = NAME_MAP_KEYWORDS.has(key) ? walkNameMap(value, model) : walk(value, model);
  }
  return out;
}

// Descend a `{ name → schema }` map: every KEY is an opaque field name (kept verbatim, never keyword-matched),
// every VALUE is a schema node walked normally. This is what keeps a field named `maximum`/`oneOf` intact.
function walkNameMap(node: unknown, model: string): unknown {
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    return walk(node, model);
  }
  const out: Record<string, unknown> = {};
  for (const [name, schema] of Object.entries(node as Record<string, unknown>)) {
    out[name] = walk(schema, model);
  }
  return out;
}

/**
 * Strip the bound keywords Anthropic rejects from a projected structured-output schema and throw on `oneOf`
 * (D93). Returns a fresh object — never mutates the caller's cached `ResponseFormat.schema` (the same object
 * also feeds the vLLM wire, which needs the bounds kept). `model` is carried only for error provenance.
 */
export function sanitizeAnthropicOutputSchema(schema: Record<string, unknown>, model: string): Record<string, unknown> {
  return walk(schema, model) as Record<string, unknown>;
}
