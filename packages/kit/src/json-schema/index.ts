// @orb/kit/json-schema — the ONE zod → JSON-Schema projection rule (D79), pure + isomorphic. Serves BOTH
// tool arg schemas (the tool-use registry) and `ResponseFormat.schema` on the structured-output axis — one
// projection rule, one golden. Uses zod v4's native z.toJSONSchema, then pins additionalProperties:false on
// every object node so a model inventing extra keys fails our parse rather than slipping through downstream.

import { z } from "zod";

export { JsonSchemaLiftError, LIFTABLE_JSON_SCHEMA, liftJsonSchema, MAX_LIFT_DEPTH } from "./lift";

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
