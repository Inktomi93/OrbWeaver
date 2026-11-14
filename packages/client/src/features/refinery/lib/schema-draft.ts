// The schema editor's save check, run before the press: the SAME contracts belt the server runs on every write, so a
// refusal is named at the field the author fixes it in, never first met as a failed save.

import type { RefinerySchemaStage } from "@orb/contracts/refinery";
import { refinerySchemaDocumentSchema } from "@orb/contracts/refinery";

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
