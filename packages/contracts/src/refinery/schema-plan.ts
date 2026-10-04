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
  // The model has no way to return a structured answer at all, whatever the schema.
  z.strictObject({ outcome: z.literal("no-structured"), model: z.string() }),
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
export const REFINERY_SCHEMA_PLAN_UNCHECKED_LINE = "Couldn't check this against your Utility model right now. It still saves.";

/** The plan outcomes under which a refinery run on this schema would fail. */
export const REFINERY_SCHEMA_PLAN_FAILING: ReadonlySet<RefinerySchemaPlan["outcome"]> = new Set<RefinerySchemaPlan["outcome"]>([
  "refused",
  "background-refused",
  "no-structured",
]);

/** The one line the editor shows for a plan; each leads with its verdict. */
export function refinerySchemaPlanLine(plan: RefinerySchemaPlan): string {
  if (plan.outcome === "unbound") {
    return "No Utility model is set in Model roles, so this can't be checked yet. It still saves.";
  }
  if (plan.outcome === "background-refused") {
    return `Won't run: your Utility model (${plan.model}) doesn't allow background work. Turn it on in Connections. It still saves.`;
  }
  if (plan.outcome === "no-structured") {
    return `Won't run: your Utility model (${plan.model}) can't return structured answers. Pick another Utility model in Model roles. It still saves.`;
  }
  if (plan.outcome === "refused") {
    return `Won't run on your Utility model (${plan.model}): ${plan.reasons.join("; ")}. It still saves.`;
  }
  return plan.carrier === "native"
    ? `Fits your Utility model (${plan.model}): it follows this shape exactly.`
    : `Fits your Utility model (${plan.model}) through a tool call; the answer is checked when it comes back.`;
}
