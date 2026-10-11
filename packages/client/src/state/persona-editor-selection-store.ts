// The expanded persona editor is independent of the playing-as persona.
import type { PersonaId } from "@orb/kit/ids";
import { openConfigTo } from "./config-nav-store.ts";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";
import { dropPersonaEditorFocusExcept, requestPersonaEditorFocus } from "./persona-editor-focus-store.ts";

const selection = createDrillSelectionStore<PersonaId>("persona-editor-selection");

export function selectPersonaEditor(personaId: PersonaId | null): void {
  dropPersonaEditorFocusExcept(personaId);
  if (personaId === null) {
    // An accordion toggle in a list, not a list-to-content switch: no content crossfade.
    selection.clearInPlace();
  } else {
    selection.select(personaId, { swap: false });
  }
}

/** The Edit door: open that persona's editor in Settings and move focus into it, whether or not it was
 *  already the selected one. */
export function openPersonaEditor(personaId: PersonaId): void {
  selectPersonaEditor(personaId);
  requestPersonaEditorFocus(personaId);
  openConfigTo("personas", "your-personas");
}

export function usePersonaEditorId(): PersonaId | null {
  return selection.usePrimaryId();
}
