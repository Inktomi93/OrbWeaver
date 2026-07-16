// The room-overrides form model — the pure wire<->form mapping half of the autosave form, kept DOM-free
// so the mappers are node-testable. The form works in an all-strings(+number) projection; empty text
// fields are OMITTED on write (a stored "" is not nullish, so the assembler would treat it as
// override-to-empty rather than inherit).

import type { RoomOverrides } from "@orb/contracts/chat";
import { AUTHORS_NOTE_DEFAULT_DEPTH, AUTHORS_NOTE_DEFAULT_ROLE } from "@orb/contracts/chat";
import { isAssistantPrefill } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";

export interface RoomOverridesFormValues {
  readonly scenario: string;
  readonly mainPrompt: string;
  readonly postHistory: string;
  readonly authorsNote: string;
  readonly authorsNoteDepth: number | null;
  readonly authorsNoteRole: string;
}

export const ROOM_OVERRIDES_ENTITY_PREFIX = "room-overrides:";

export const EMPTY_ROOM_OVERRIDES_FORM: RoomOverridesFormValues = {
  scenario: "",
  mainPrompt: "",
  postHistory: "",
  authorsNote: "",
  authorsNoteDepth: AUTHORS_NOTE_DEFAULT_DEPTH,
  authorsNoteRole: AUTHORS_NOTE_DEFAULT_ROLE,
};

export function toRoomOverridesForm(overrides: RoomOverrides): RoomOverridesFormValues {
  return {
    scenario: overrides.scenario ?? "",
    mainPrompt: overrides.mainPrompt ?? "",
    postHistory: overrides.postHistory ?? "",
    authorsNote: overrides.authorsNote?.prompt ?? "",
    authorsNoteDepth: overrides.authorsNote?.depth ?? AUTHORS_NOTE_DEFAULT_DEPTH,
    authorsNoteRole: overrides.authorsNote?.role ?? AUTHORS_NOTE_DEFAULT_ROLE,
  };
}

// setRoomOverrides writes the whole strict blob, so an invalid authorsNote (assistant-at-depth-0
// prefill) would 400 the entire write, silently failing an unrelated sibling edit. So while the note
// combo is invalid we withhold it from the wire; siblings keep saving.
export function fromRoomOverridesForm(values: RoomOverridesFormValues): RoomOverrides {
  const overrides: RoomOverrides = {};
  if (values.scenario.trim() !== "") {
    overrides.scenario = values.scenario;
  }
  if (values.mainPrompt.trim() !== "") {
    overrides.mainPrompt = values.mainPrompt;
  }
  if (values.postHistory.trim() !== "") {
    overrides.postHistory = values.postHistory;
  }
  if (values.authorsNote.trim() !== "" && !isAuthorsNotePrefill(values)) {
    overrides.authorsNote = {
      prompt: values.authorsNote,
      depth: values.authorsNoteDepth ?? AUTHORS_NOTE_DEFAULT_DEPTH,
      role: values.authorsNoteRole as MessageRole,
    };
  }
  return overrides;
}

export function isAuthorsNotePrefill(values: RoomOverridesFormValues): boolean {
  return (
    values.authorsNote.trim() !== "" &&
    // Align with the save's own coercion: a cleared depth writes the default, not 0.
    isAssistantPrefill(values.authorsNoteRole as MessageRole, values.authorsNoteDepth ?? AUTHORS_NOTE_DEFAULT_DEPTH)
  );
}
