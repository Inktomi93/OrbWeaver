// The expanded persona editor is independent of the playing-as persona.
import type { PersonaId } from "@orb/kit/ids";
import { openConfigTo } from "./config-nav-store.ts";
import { createGatedStore } from "./create-gated-store.ts";

interface PersonaEditorSelection {
  readonly personaId: PersonaId | null;
}
const useSelection = createGatedStore<PersonaEditorSelection>("persona-editor-selection", () => ({ personaId: null }));

export function selectPersonaEditor(personaId: PersonaId | null): void {
  useSelection.setState({ personaId }, false, "personaEditor/select");
}

export function openPersonaEditor(personaId: PersonaId): void {
  selectPersonaEditor(personaId);
  openConfigTo("personas", "your-personas");
}

export function usePersonaEditorId(): PersonaId | null {
  return useSelection((state) => state.personaId);
}
