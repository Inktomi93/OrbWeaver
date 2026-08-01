// The room-overrides form model — the pure wire<->form mapping half of the autosave form, kept DOM-free
// so the mappers are node-testable. The form works in an all-strings projection; empty text fields are
// OMITTED on write (a stored "" is not nullish, so the assembler would treat it as override-to-empty
// rather than inherit).
//
// THREE fields, not four: the per-chat author's note was retired (owner ruling 2026-08-01) — it was a
// second home for what `chat_injections` already owns (both landed as the same at-depth splice), so the
// Injections section beside this one is the ONE per-chat prose door.

import type { RoomOverrides } from "@orb/contracts/chat";

export interface RoomOverridesFormValues {
  readonly scenario: string;
  readonly mainPrompt: string;
  readonly postHistory: string;
}

export const ROOM_OVERRIDES_ENTITY_PREFIX = "room-overrides:";

export const EMPTY_ROOM_OVERRIDES_FORM: RoomOverridesFormValues = {
  scenario: "",
  mainPrompt: "",
  postHistory: "",
};

export function toRoomOverridesForm(overrides: RoomOverrides): RoomOverridesFormValues {
  return {
    scenario: overrides.scenario ?? "",
    mainPrompt: overrides.mainPrompt ?? "",
    postHistory: overrides.postHistory ?? "",
  };
}

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
  return overrides;
}
