// The schema editor's save check, run before the press: the SAME contracts belt the server runs on every write, so a
// refusal is named at the field the author fixes it in, never first met as a failed save. The bounded JSON walk runs first
// because it is iterative: a draft nested past the bound is refused before the belt's own recursive checks can overflow
// the stack. The sentence a bound refusal code reads as lives here too, for the refusal the editor shows before the press
// and the one the server answers after it.

import type { RefinerySchemaStage } from "@orb/contracts/refinery";
import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";
import { boundedJsonObjectSchema, JSON_BOUND_REFUSALS, JSON_MAX_DEPTH } from "@orb/kit/json";

type JsonBoundRefusal = (typeof JSON_BOUND_REFUSALS)[number];

const JSON_BOUND_REFUSAL_LINES: Record<JsonBoundRefusal, string> = {
  ["json_max_depth_exceeded"]: `The JSON nests deeper than ${JSON_MAX_DEPTH} levels, the most the editor accepts. Flatten the deepest part, often a long default or example value.`,
  ["json_not_json"]: "The JSON holds a value JSON cannot carry, such as a number that is not finite.",
  ["json_cycle"]: "The JSON refers back to itself. Remove the loop.",
};

/** The sentence a bound refusal code reads as; any other message is already a sentence and passes through. */
export function refusalSentenceOf(message: string): string {
  const code = JSON_BOUND_REFUSALS.find((refusal) => refusal === message);
  return code === undefined ? message : JSON_BOUND_REFUSAL_LINES[code];
}

/** One sentence per editor field the draft fails at; a field that passes is absent. */
export interface SchemaDraftIssues {
  readonly name?: string;
  readonly description?: string;
  readonly schema?: string;
}

interface SchemaDraft {
  readonly name: string;
  readonly description: string;
  readonly stage: RefinerySchemaStage;
  /** `null` while the JSON pane does not parse: there is nothing to refuse yet. */
  readonly schema: Record<string, unknown> | null;
}

/** Whether any field holds a refusal, which holds the save press off. */
export function hasSchemaDraftIssue(issues: SchemaDraftIssues): boolean {
  return issues.name !== undefined || issues.description !== undefined || issues.schema !== undefined;
}

/** What the server's belt would refuse in `draft`, at the field the author fixes it in. An empty name is the press's own
 *  disabled reason, not a refusal to scold the author with before they have typed one. */
export function schemaDraftIssuesOf(draft: SchemaDraft): SchemaDraftIssues {
  const issues: { name?: string; description?: string; schema?: string } = {};
  if (draft.schema === null) {
    return issues;
  }
  const bound = boundedJsonObjectSchema.safeParse(draft.schema);
  if (!bound.success) {
    return { schema: bound.error.issues.map((issue) => refusalSentenceOf(issue.message)).join(" ") };
  }
  const parsed = refinerySchemaDocumentSchema.safeParse(draft);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      const unnamed = field === "name" && draft.name.length === 0;
      if ((field === "name" || field === "description" || field === "schema") && !unnamed && issues[field] === undefined) {
        issues[field] = issue.message;
      }
    }
  }
  return issues;
}
