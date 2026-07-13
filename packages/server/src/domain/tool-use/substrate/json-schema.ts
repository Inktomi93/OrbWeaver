// domain/tool-use/substrate/json-schema — the one zod → JSON-Schema projection rule, computed once at
// registration and cached; the same rule serves ResponseFormat.schema on the structured-output axis.
// Uses zod v4's native z.toJSONSchema, then pins additionalProperties:false on every object node so a model
// inventing extra keys fails our parse rather than silently downstream.

import { z } from "zod";

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

/** Project a tool's zod arg schema (or a structured-output payload schema) to the wire JSON Schema. */
export function projectArgSchema(schema: z.ZodType): Record<string, unknown> {
  const projected: Record<string, unknown> = { ...z.toJSONSchema(schema) };
  pinObjectNodes(projected);
  return projected;
}
