// The expanded persona editor is independent of the playing-as persona.
import type { PersonaId } from "@orb/kit/ids";
import { openConfigTo } from "./config-nav-store.ts";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";

const selection = createDrillSelectionStore<PersonaId>("persona-editor-selection");

export function selectPersonaEditor(personaId: PersonaId | null): void {
  if (personaId === null) {
    selection.clear();
  } else {
    selection.select(personaId);
  }
}

export function openPersonaEditor(personaId: PersonaId): void {
  selectPersonaEditor(personaId);
  openConfigTo("personas", "your-personas");
}

export function usePersonaEditorId(): PersonaId | null {
  return selection.usePrimaryId();
}
