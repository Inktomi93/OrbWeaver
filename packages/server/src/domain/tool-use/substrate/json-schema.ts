// domain/tool-use/substrate/json-schema — the ONE zod → JSON-Schema projection rule (tool-use-design/
// 01 §2), computed ONCE at registration and cached on the registry entry. The SAME rule serves
// `ResponseFormat.schema` on the structured-output axis (04 §1) — one projector, both axes. The three
// rules (each pinned by the golden test):
//   1. zod v4's native `z.toJSONSchema` (draft 2020-12 — what OpenAI-wire `tools[]` accepts; no
//      zod-to-json-schema dependency).
//   2. `additionalProperties:false` pinned on EVERY object node (post-walk — neo's vLLM
//      `cleanJsonSchema` rule generalized + OpenAI strict-mode's requirement): a model inventing
//      extra keys fails OUR parse, never silently downstream.
//   3. Descriptions survive (`.describe()` IS the per-arg model documentation — prompt surface).

import { z } from "zod";

const OBJECT_TYPE = "object";

// Narrow an unknown to an indexable record (arrays excluded — they walk element-wise).
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// Post-walk: pin `additionalProperties:false` on every object node (nested objects, array items,
// union branches — anywhere a `type:"object"` appears). Mutates the projector's fresh output.
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

/** Project a tool's zod arg schema (or a structured-output payload schema) to the wire JSON Schema. */
export function projectArgSchema(schema: z.ZodType): Record<string, unknown> {
  const projected: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  pinObjectNodes(projected);
  return projected;
}
