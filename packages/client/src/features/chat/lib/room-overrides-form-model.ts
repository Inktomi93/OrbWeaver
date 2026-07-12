// The room-overrides form MODEL — the PURE wire↔form mapping half of the room-overrides autosave form
// (the hook itself lives in `hooks/use-room-overrides-form`, built on `createAutosaveEntityForm`). Kept
// DOM-free here (no `#forms` import) so the load-bearing mappers are node-testable (Spine-Testing.md §7).
//
// THE FOUR FIELDS are `RoomOverrides` (contracts, host-only allowlist): scenario · mainPrompt ·
// postHistory · authorsNote. scenario/mainPrompt/postHistory are plain text overrides; `authorsNote` is
// the shared `{prompt, depth?, role?}` at-depth injection directive (task #22 — the host sets its depth +
// role, mirroring the persona-editor/injections-manager controls). The form works in an ALL-STRINGS(+number)
// projection so its controls are always controlled; the empty↔inherit + directive mapping happens at the two
// seams below:
//   • `toRoomOverridesForm` — the wire `RoomOverrides` → the form shape (absent text ⇒ ""; an unset
//     authorsNote depth/role ⇒ the house AUTHORS_NOTE_DEFAULT_* so the controls show the effective placement).
//   • `fromRoomOverridesForm` — the form shape → wire `RoomOverrides`, OMITTING empty text fields. Omission is
//     load-bearing: a stored `""` is NOT nullish, so the assembler would treat it as an override-to-empty, not
//     inherit — so an emptied field round-trips to an ABSENT key. A non-empty authorsNote carries its
//     host-set depth/role through as the directive.

import type { RoomOverrides } from "@orb/contracts/chat";
import { AUTHORS_NOTE_DEFAULT_DEPTH, AUTHORS_NOTE_DEFAULT_ROLE } from "@orb/contracts/chat";
import { isAssistantPrefill } from "@orb/kit/injection";
import type { MessageRole } from "@orb/kit/message-role";

/** The form's edit shape (see the header — text fields as strings, the authorsNote depth as the
 *  NumberField's `number | null`, its role as the bound SelectField's string). */
export interface RoomOverridesFormValues {
  readonly scenario: string;
  readonly mainPrompt: string;
  readonly postHistory: string;
  readonly authorsNote: string;
  readonly authorsNoteDepth: number | null;
  readonly authorsNoteRole: string;
}

/** Room overrides are one blob per chat, so the chat id keys the form's remount (stable `mountKey`). */
export const ROOM_OVERRIDES_ENTITY_PREFIX = "room-overrides:";

export const EMPTY_ROOM_OVERRIDES_FORM: RoomOverridesFormValues = {
  scenario: "",
  mainPrompt: "",
  postHistory: "",
  authorsNote: "",
  authorsNoteDepth: AUTHORS_NOTE_DEFAULT_DEPTH,
  authorsNoteRole: AUTHORS_NOTE_DEFAULT_ROLE,
};

/** Wire `RoomOverrides` → the form shape (absent text ⇒ ""; an unset authorsNote depth/role ⇒ the house
 *  default, so the controls show the placement that will actually be used). */
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

/** The form shape → wire `RoomOverrides`, OMITTING empty text fields (empty ⇒ inherit — see the header; a
 *  trailing-whitespace-only field is treated as empty so "clear it" always inherits). A non-empty authorsNote
 *  carries its host-set depth/role as the shared injection directive.
 *
 *  SEND-GUARD (whole-blob autosave hostage fix): `setRoomOverrides` writes the WHOLE `.strict()` blob, so an
 *  invalid authorsNote (the assistant-at-depth-0 prefill the server rejects) would 400 the ENTIRE write —
 *  silently failing an unrelated sibling edit (Scenario etc.) the user was NOT warned about. So while the note
 *  combo is invalid we WITHHOLD it from the wire (the inline warning already tells the user the note isn't
 *  landing); siblings keep saving, and the note resumes the moment the combo is fixed. */
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

/** The write-guard mirror (contract `roomAuthorsNoteSchema` / `cardDepthPromptWriteSchema`, the shared
 *  `isAssistantPrefill` — `@orb/kit/injection`): assistant-role at depth 0 is a response prefill —
 *  unsupported across providers. The editor surfaces a warning on this combination (the persona-editor
 *  precedent); the server guard rejects it if submitted. Only meaningful when the note is non-empty (an
 *  empty note is omitted on save, so it never reaches the guard). */
export function isAuthorsNotePrefill(values: RoomOverridesFormValues): boolean {
  return (
    values.authorsNote.trim() !== "" &&
    // Align with the save's own coercion (a null/cleared depth writes AUTHORS_NOTE_DEFAULT_DEPTH, NOT 0):
    // a cleared depth field lands at the default (≥1), so it's not a prefill and shows no warning.
    isAssistantPrefill(
      values.authorsNoteRole as MessageRole,
      values.authorsNoteDepth ?? AUTHORS_NOTE_DEFAULT_DEPTH,
    )
  );
}
