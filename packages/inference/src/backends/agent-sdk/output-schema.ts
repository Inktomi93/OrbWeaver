// The Anthropic structured-output wire quirk (D93) — the agent-sdk backend talks to api.anthropic.com,
// whose `output_config.format.schema` subset is STRICTER than valid JSON Schema: it rejects `oneOf` and
// every numeric/array/string/object BOUND keyword (`minItems`/`maxItems`/`minLength`/…). The D79 projector
// (`@orb/kit/json-schema`) is the ONE projection rule and stays backend-agnostic; DECIDING which subset this
// wire may carry is a per-backend wire translation homed HERE (the mirror of vLLM's `cleanJsonSchema`, which
// KEEPS bounds — guided decoding enforces them). One schema, several wires, opposite needs → the normalization
// cannot live in the shared projector; it belongs where each request is built. What IS shared is the walk
// itself (`scrubWireSchema`, kit) — the keyword table is vocabulary, and three hand-rolled walkers drifted
// (this one was position-aware, vLLM's was not). This module owns the MODE and the typed refusal; the engine
// owns the traversal.
//
// Bounds are NOT dropped from enforcement — they ride the POST-PARSE zod belt (`runStructuredTurn` validates
// the reply against the FULL bounded schema). `oneOf` cannot be stripped without changing meaning, so it
// THROWS a typed `invalid` error (a flatten-the-discriminated-union build bug, per D93) rather than reaching
// the live provider as a cryptic 400.
//
// `allOf` (z.intersection/.and()) is PASSED THROUGH — live-probed ACCEPTED by the sonnet-5 structured wire
// (D93 close-out). `anyOf` (nullable()) is likewise accepted; only `oneOf` (discriminatedUnion) is refused.

import { scrubWireSchema } from "@orb/contracts/inference";
import { ProviderError } from "../../contract/errors.ts";

/**
 * Strip the bound keywords Anthropic rejects from a projected structured-output schema and throw on `oneOf`
 * (D93). Returns a fresh object — never mutates the caller's cached `ResponseFormat.schema` (the same object
 * also feeds the vLLM wire, which needs the bounds kept). `model` is carried only for error provenance.
 */
export function sanitizeAnthropicOutputSchema(schema: Record<string, unknown>, model: string): Record<string, unknown> {
  const { schema: clean, refused } = scrubWireSchema(schema, "anthropic-format");
  if (refused.length > 0) {
    // `nullable()` projects to `anyOf` (accepted); only `z.discriminatedUnion` → `oneOf`, which the wire
    // refuses. Fail LOUD at the request boundary — the fix is flattening to an enum-tagged object (D93).
    throw new ProviderError({
      kind: "invalid",
      retryable: false,
      message: `agent-sdk: structured-output schema is not Anthropic-clean — '${refused.join("', '")}' is rejected by the wire. Flatten the discriminated union to an enum-tagged object (D93).`,
      model,
    });
  }
  return clean;
}

/** ResponseFormat → the SDK's `outputFormat` option. Only schema crosses — name/strict/description are the
 *  caller's own OpenAI-path validator metadata (no SDK slot). Bound-stripped for the Anthropic wire (D93);
 *  the bounds still ride the caller's post-parse belt. Shared by the AGENT runner and the CHAT runner's
 *  structured-output mount — one mapping, every skin. */
export function toSdkOutputFormat(rf: { readonly schema: Record<string, unknown> }, model: string): { type: "json_schema"; schema: Record<string, unknown> } {
  return { type: "json_schema", schema: sanitizeAnthropicOutputSchema(rf.schema, model) };
}
