// The Setup tab's schema doors: the row each one names and the action its button carries. One home so the
// e2e walk reads the same words the pane renders.
import { BUILT_IN_SCHEMA_LINE } from "./schema-line.ts";

export const SETUP_SCHEMA_ROWS = { score: "Score schema", analyze: "Analyze schema" } as const;

export const SETUP_SCHEMA_ACTIONS = ["Create", "Edit"] as const;

/** A stage on the built-in schema creates one; a stage on a saved schema edits it. */
export function schemaDoorActionOf(schemaLine: string): (typeof SETUP_SCHEMA_ACTIONS)[number] {
  return schemaLine === BUILT_IN_SCHEMA_LINE ? "Create" : "Edit";
}
