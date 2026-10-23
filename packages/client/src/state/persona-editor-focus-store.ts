// A pending "move focus into this persona's editor" request, raised only by the switcher's Edit door and
// taken by the editor region once it is on screen — a chevron expand never raises one. A fresh object per
// request makes a repeat request for the same persona observable.
import type { PersonaId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";

interface PersonaEditorFocusRequest {
  readonly personaId: PersonaId;
}

interface PersonaEditorFocusState {
  readonly request: PersonaEditorFocusRequest | null;
}

const usePersonaEditorFocusStore = createGatedStore<PersonaEditorFocusState>("persona-editor-focus", (): PersonaEditorFocusState => ({ request: null }));

export function requestPersonaEditorFocus(personaId: PersonaId): void {
  usePersonaEditorFocusStore.setState({ request: { personaId } }, false, "personaEditorFocus/request");
}

/** A request for a persona other than `keep` (or all of them, with `null`) is stale. */
export function dropPersonaEditorFocusExcept(keep: PersonaId | null): void {
  if (usePersonaEditorFocusStore.getState().request?.personaId !== keep) {
    usePersonaEditorFocusStore.setState({ request: null }, false, "personaEditorFocus/drop");
  }
}

export function takePersonaEditorFocus(): void {
  usePersonaEditorFocusStore.setState({ request: null }, false, "personaEditorFocus/take");
}

/** The pending request, reactive. */
export function usePersonaEditorFocusRequest(): PersonaEditorFocusRequest | null {
  return usePersonaEditorFocusStore((s) => s.request);
}
