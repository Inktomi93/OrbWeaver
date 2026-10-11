// The expanded persona editor is independent of the playing-as persona.
import type { PersonaId } from "@orb/kit/ids";
import { openConfigTo } from "./config-nav-store.ts";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const selection = createDrillSelectionStore<PersonaId>("persona-editor-selection");

// Set only by `openPersonaEditor` and taken by the editor as it mounts, so a deep link moves focus into
// the editor and a plain chevron expand never does.
let focusRequest: PersonaId | null = null;

export function selectPersonaEditor(personaId: PersonaId | null): void {
  if (focusRequest !== personaId) {
    focusRequest = null;
  }
  if (personaId === null) {
    selection.clear();
  } else {
    selection.select(personaId);
  }
}

export function openPersonaEditor(personaId: PersonaId): void {
  // An editor that is already open has nothing left to mount, so a request would wait for a later expand.
  focusRequest = selection.getPrimaryId() === personaId ? null : personaId;
  selectPersonaEditor(personaId);
  openConfigTo("personas", "your-personas");
}

/** True once per `openPersonaEditor` call, for the editor of that persona. */
export function takePersonaEditorFocus(personaId: PersonaId): boolean {
  if (focusRequest !== personaId) {
    return false;
  }
  focusRequest = null;
  return true;
}

export function usePersonaEditorId(): PersonaId | null {
  return selection.usePrimaryId();
}
