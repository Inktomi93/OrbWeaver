// The room-overrides autosave form (task #28; UI-Arch §13.4 — "Room overrides (per-chat) →
// createAutosaveEntityForm, flip-and-it-saves"). Built on `createAutosaveEntityForm` at MODULE scope
// (stable hook identity, §13.1), the same shape as `use-appearance-form.ts`: no module `config.save`
// (the persist fn closes over the live tRPC client, a React-context value unreachable here) — the
// SURFACE supplies `save` at call time. No draft mirror (the server row is the durable store; a
// crash-mirror would duplicate synced truth — the appearance-form precedent).
//
// THE FOUR FIELDS are `RoomOverrides` (contracts, host-only allowlist): scenario · mainPrompt ·
// postHistory · authorsNote. The form works in an ALL-STRINGS projection (each field defaults "") so the
// textareas are always controlled; the empty↔inherit mapping happens at the two seams below:
//   • `toRoomOverridesForm` — the wire `RoomOverrides` (optional fields) → all-strings (absent ⇒ "").
//   • `fromRoomOverridesForm` — all-strings → wire `RoomOverrides`, OMITTING empty fields. Omission is
//     load-bearing: a stored `""` is NOT nullish, so the assembler (`assemble.ts`) would treat it as an
//     override-to-empty, not inherit — so an emptied field must round-trip to an ABSENT key.

import type { RoomOverrides } from "@orb/contracts/chat";
import { createAutosaveEntityForm } from "#forms";

/** The all-strings projection the form edits (see the header — empty string ⇒ inherit). */
export interface RoomOverridesFormValues {
  readonly scenario: string;
  readonly mainPrompt: string;
  readonly postHistory: string;
  readonly authorsNote: string;
}

/** Room overrides are one blob per chat, so the chat id keys the form's remount (stable `mountKey`). */
export const ROOM_OVERRIDES_ENTITY_PREFIX = "room-overrides:";

const EMPTY_ROOM_OVERRIDES_FORM: RoomOverridesFormValues = {
  scenario: "",
  mainPrompt: "",
  postHistory: "",
  authorsNote: "",
};

/** Wire `RoomOverrides` (optional fields) → the form's all-strings shape (an absent field ⇒ ""). */
export function toRoomOverridesForm(overrides: RoomOverrides): RoomOverridesFormValues {
  return {
    scenario: overrides.scenario ?? "",
    mainPrompt: overrides.mainPrompt ?? "",
    postHistory: overrides.postHistory ?? "",
    authorsNote: overrides.authorsNote ?? "",
  };
}

/** The form's all-strings shape → wire `RoomOverrides`, OMITTING empty fields (empty ⇒ inherit — see
 *  the header; a trailing-whitespace-only field is treated as empty so "clear it" always inherits). */
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
  if (values.authorsNote.trim() !== "") {
    overrides.authorsNote = values.authorsNote;
  }
  return overrides;
}

export const useRoomOverridesForm = createAutosaveEntityForm<RoomOverridesFormValues>({
  defaultValues: EMPTY_ROOM_OVERRIDES_FORM,
});
