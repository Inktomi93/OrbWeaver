// @orb/kit/json-schema — the ONE zod → JSON-Schema projection rule (D79), pure + isomorphic. Serves BOTH
// tool arg schemas (the tool-use registry) and `ResponseFormat.schema` on the structured-output axis — one
// projection rule, one golden. Uses zod v4's native z.toJSONSchema, then pins additionalProperties:false on
// every object node.
//
// WHAT THE PIN ACTUALLY BUYS (probed on zod 4.4.3 — the pre-2026-08-02 header claimed the parse rejects extra
// keys, which is FALSE): the pin is a GRAMMAR-LEVEL PREVENTION only on a wire that COMPILES a grammar, and we
// drive exactly one — vLLM/xgrammar guided decoding (`vllm/surfaces/chat.ts`). It is ADVISORY everywhere else.
// (The pre-2026-08-03 header also named "an OpenRouter `strict` tool" as an enforcing wire: NO SUCH TOOL EXISTS
// in this tree — `WireTool` is `{name, description, parameters}` with no `strict` field
// (`providers/contract/chat.ts`), and the OpenRouter structured vehicle is a FORCED TOOL CALL, which compiles
// no grammar and therefore enforces nothing. Its schema is a prompt-shaped hint; the salvage parse is the
// backstop.) On a NON-enforcing wire the pin is advisory — and our own parse is no backstop either, because
// v4 `z.object` is STRIP mode: `z.object({targetRef,hpDelta}).safeParse({targetRef:"You",hpDelta:2,junk:"…"})`
// returns `success:true` with `junk` silently removed. Only `z.strictObject`/`.strict()` fails there, and the
// model-facing parses deliberately do NOT use it (EXT-4a salvage: rejecting a whole call over a junk key drops
// more than it saves). The residual silence is closed by OBSERVABILITY, not by strictness — the RPG vehicles
// itemize every key that failed to survive validation (`strippedToolCallKeys` + `salvageExtraction`'s
// `stripped`, in contracts/rpg/extraction.ts; the `rpg.extraction.stripped` log) so an invented key can never
// vanish into a success record (D112 (3), banned-silent-fork).

import { z } from "zod";

export { JsonSchemaLiftError, LIFTABLE_JSON_SCHEMA, liftJsonSchema, MAX_LIFT_DEPTH } from "./lift.ts";
// The per-WIRE keyword subset (what a given endpoint may legally receive) is a separate concern from the
// projection rule and is applied at each request-build site, never here — see `./wire-subset`.
export type { WireSchemaMode, WireSchemaScrub } from "./wire-subset.ts";
export { dropNullValues, scrubWireSchema, WIRE_SCHEMA_MODES } from "./wire-subset.ts";

const OBJECT_TYPE = "object";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function pinObjectNodes(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      pinObjectNodes(item);
    }
    return;
  }
  if (!isRecord(node)) {
    return;
  }
  if (node["type"] === OBJECT_TYPE && node["additionalProperties"] === undefined) {
    node["additionalProperties"] = false;
  }
  for (const value of Object.values(node)) {
    pinObjectNodes(value);
  }
}

/** Project a zod schema (a tool's args OR a structured-output payload) to the wire JSON Schema. */
export function projectJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const projected: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  pinObjectNodes(projected);
  return projected;
}
