// What the author's bound Utility model would do with a draft schema: the structured planner's own answer for that
// connection, in the author's words. Server-computed (only the server holds the bound connection); the editor
// renders it beside the hosted accounting in `schema-advisory.ts`.

import { z } from "zod";
import type { WireSchemaViolation } from "#inference";

/** How a fitting schema rides: held to the shape as the model writes (`native`), or filled in through a tool call
 *  whose answer is checked when it comes back (`tool`). */
export const REFINERY_SCHEMA_CARRIERS = ["native", "tool"] as const;

export const refinerySchemaPlanSchema = z.discriminatedUnion("outcome", [
  z.strictObject({ outcome: z.literal("unbound") }),
  // Refinery runs are background work, which the bound connection does not allow.
  z.strictObject({ outcome: z.literal("background-refused"), model: z.string() }),
  z.strictObject({ outcome: z.literal("sends"), model: z.string(), carrier: z.enum(REFINERY_SCHEMA_CARRIERS) }),
  z.strictObject({ outcome: z.literal("refused"), model: z.string(), reasons: z.array(z.string()) }),
]);
export type RefinerySchemaPlan = z.infer<typeof refinerySchemaPlanSchema>;

function where(path: string): string {
  return path === "" ? "the top level" : `"${path}"`;
}

/** One planner violation as a reason an author can act on: what in their schema, against what limit. */
export function schemaPlanReasonOf(violation: WireSchemaViolation): string {
  switch (violation.kind) {
    case "optional-props":
      return `${violation.count} optional fields, past its limit of ${violation.limit} — make some required`;
    case "union-props":
      return `${violation.count} fields that can hold more than one kind of value (an optional field counts once it may be empty), past its limit of ${violation.limit}`;
    case "strict-tools":
      return `${violation.count} strictly checked tools, past its limit of ${violation.limit}`;
    case "object-props":
      return `${violation.count} fields in all, past its limit of ${violation.limit}`;
    case "depth":
      return `nesting ${violation.count} levels deep, past its limit of ${violation.limit}`;
    case "enum-values":
      return `${violation.count} choice-list values in all, past its limit of ${violation.limit}`;
    case "name-chars":
      return `${violation.count} characters of field names and choices, past its limit of ${violation.limit}`;
    case "long-enum-chars":
      return `one long choice list of ${violation.count} characters, past its limit of ${violation.limit}`;
    case "refused-keyword":
      return `"${violation.keyword}" at ${where(violation.path)}, which it cannot follow`;
    case "root-not-object":
      return "a top level that is not an object with fields";
    case "ambiguous-null":
      return `${where(violation.path)} being both optional and allowed to be empty, which it cannot tell apart — make it required, or drop the empty choice`;
    case "no-vehicle":
      return "no way to return structured answers at all";
    case "vendor-refused":
      return "a shape its provider refused";
  }
}

/** The line the editor shows when the plan could not be asked (the server or the network failed). */
export const REFINERY_SCHEMA_PLAN_UNCHECKED_LINE = "Couldn't check this shape against your Utility model just now. It will still save.";

/** The one line the editor shows for a plan. */
export function refinerySchemaPlanLine(plan: RefinerySchemaPlan): string {
  if (plan.outcome === "unbound") {
    return "Whether this fits depends on the model bound to Utility in Model roles, and none is bound yet. It will still save.";
  }
  if (plan.outcome === "background-refused") {
    return `Your Utility model (${plan.model}) is on a connection that doesn't allow background work, so refinery runs can't use it — allow background work for it in Connections. It will still save.`;
  }
  if (plan.outcome === "refused") {
    return `Your Utility model (${plan.model}) cannot take this shape, so refinery runs with it would fail: ${plan.reasons.join("; ")}. It will still save.`;
  }
  return plan.carrier === "native"
    ? `Your Utility model (${plan.model}) takes this shape and is held to it as it writes.`
    : `Your Utility model (${plan.model}) cannot be held to this shape as it writes, so it fills it in through a tool call; the answer is checked when it comes back.`;
}
