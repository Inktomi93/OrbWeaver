// The Setup tab's schema doors: the row each one names and the action its button carries. One home so the
// e2e walk reads the same words the pane renders.
import { DIALOG_VERBS } from "#lib";
import { BUILT_IN_SCHEMA_LINE } from "./schema-line.ts";

export const SETUP_SCHEMA_ROWS = { score: "Score schema", analyze: "Analyze schema" } as const;

const SCHEMA_EDIT_ACTION = "Edit";

export const SETUP_SCHEMA_ACTIONS = [DIALOG_VERBS.create, SCHEMA_EDIT_ACTION] as const;

/** The row that opens the card the session pinned at its start, and the action its button carries. */
export const SETUP_ORIGINAL_CARD_ROW = "Original card";
export const SETUP_VIEW_ACTION = "View";

/** A Setup row's button: its action, then the row, because several rows share one action word. */
export function setupDoorName(action: string, row: string): string {
  return `${action} ${row}`;
}

/** A stage on the built-in schema creates one; a stage on a saved schema edits it. */
export function schemaDoorActionOf(schemaLine: string): (typeof SETUP_SCHEMA_ACTIONS)[number] {
  return schemaLine === BUILT_IN_SCHEMA_LINE ? DIALOG_VERBS.create : SCHEMA_EDIT_ACTION;
}
