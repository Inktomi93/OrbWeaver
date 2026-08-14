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
import { isPlainObject } from "#guards";

/** A raw JSON-Schema blob that has NOT been through {@link projectJsonSchema}: the stored refinery schema,
 *  a lifted guest tool schema, an author's draft in the raw-JSON door. Plain by construction — structurally
 *  a `Record<string, unknown>` and nothing more, so it can never satisfy {@link WireReady}. The name is the
 *  documentation: a signature typed `Unprojected` is announcing "this is a stored/authored blob, not yet
 *  wire-projected". */
export type Unprojected = Record<string, unknown>;

// Phantom brand — {@link projectJsonSchema} is the ONE mint (its single `as WireReady` below is the only
// producer in the tree). Nothing else can name this symbol, so no other module can forge the brand in an
// object literal; the brand-transparent transforms (`scrubWireSchema`, the rpg constrainers) are GENERIC
// over the caller's brand and thread it through without minting it. The `ChatModelId`/`credentials` phantom
// precedents (contracts) are the same shape.
declare const wireReadyBrand: unique symbol;

/** A JSON Schema that has provably been through {@link projectJsonSchema} — `additionalProperties:false`
 *  pinned on every object node, ready for a provider wire (D79). It is the ONLY value `ResponseFormat.schema`
 *  accepts, which turns "every structured-output send projects first" from a doc-note (task #41) into a
 *  COMPILE-TIME invariant: a raw {@link Unprojected} at a send-site fails `tsc`. A `WireReady` is still a
 *  `Record<string, unknown>` (the brand is phantom), so every downstream consumer that reads `.schema` as a
 *  plain record — the per-wire subset scrubbers, the wire request builders — keeps working unchanged. */
export type WireReady = Record<string, unknown> & { readonly [wireReadyBrand]: true };

export { JsonSchemaLiftError, LIFTABLE_JSON_SCHEMA, liftJsonSchema, MAX_LIFT_DEPTH, RENDER_HINT_KEY } from "./lift.ts";
// The per-WIRE keyword subset (what a given endpoint may legally receive) is a separate concern from the
// projection rule and is applied at each request-build site, never here — see `./wire-subset`.
export type { WireSchemaMode, WireSchemaScrub } from "./wire-subset.ts";
export { dropNullValues, scrubWireSchema, WIRE_SCHEMA_MODES, WIRE_SUBSETS } from "./wire-subset.ts";

const OBJECT_TYPE = "object";

function pinObjectNodes(node: unknown): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      pinObjectNodes(item);
    }
    return;
  }
  if (!isPlainObject(node)) {
    return;
  }
  if (node["type"] === OBJECT_TYPE && node["additionalProperties"] === undefined) {
    node["additionalProperties"] = false;
  }
  for (const value of Object.values(node)) {
    pinObjectNodes(value);
  }
}

/** Project a zod schema (a tool's args OR a structured-output payload) to the wire JSON Schema. The ONE
 *  producer of {@link WireReady} — the single `as WireReady` in the tree, so "was this projected?" has one
 *  provable answer and a send-site cannot skip it. */
export function projectJsonSchema(schema: z.ZodType): WireReady {
  const projected: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  pinObjectNodes(projected);
  return projected as WireReady;
}
