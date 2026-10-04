// The connection editor's fact-row line for an embedder write, and where focus returns once the write settles.

import type { EditorEmbedderCheck, EditorEmbedRefusal } from "./connection-editor-refusal.tsx";
import { EmbedderCheckingStatus, EmbedRefusalAlert } from "./connection-editor-refusal.tsx";
import type { FactRowNote } from "./connection-fact-rows.tsx";

/** The fact row's line: the check while it runs, else the last refusal from that row. */
export function factNoteOf(checking: EditorEmbedderCheck | null, refused: EditorEmbedRefusal | null): FactRowNote | undefined {
  if (checking !== null) {
    return checking.path === null ? undefined : { path: checking.path, content: <EmbedderCheckingStatus /> };
  }
  return refused === null || refused.path === null ? undefined : { path: refused.path, content: <EmbedRefusalAlert onRow={true} refusal={refused.refusal} /> };
}

/** The pressed Override or Reset goes away with the change, so focus returns to its row once the write settles. */
export function focusFact(facts: HTMLElement | null, path: string | null): void {
  if (path !== null) {
    facts?.querySelector<HTMLElement>(`[data-fact="${path}"]`)?.focus();
  }
}
