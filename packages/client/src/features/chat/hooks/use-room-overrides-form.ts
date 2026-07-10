// The room-overrides autosave form (task #28; UI-Arch §13.4 — "Room overrides (per-chat) →
// createAutosaveEntityForm, flip-and-it-saves"). Built on `createAutosaveEntityForm` at MODULE scope
// (stable hook identity, §13.1), the same shape as `use-appearance-form.ts`: no module `config.save`
// (the persist fn closes over the live tRPC client, a React-context value unreachable here) — the
// SURFACE supplies `save` at call time. No draft mirror (the server row is the durable store; a
// crash-mirror would duplicate synced truth — the appearance-form precedent).
//
// The PURE wire↔form mapping half (the two seams + the prefill guard + the form shape + the entity
// prefix) lives in the sibling `lib/room-overrides-form-model` — kept out of this hook module so it stays
// DOM-free and node-testable (this file imports `#forms`, which drags browser TSX into the dom-less
// typecheck:graph). Surfaces/components import the mappers from that model directly.

import { createAutosaveEntityForm } from "#forms";
import type { RoomOverridesFormValues } from "../lib/room-overrides-form-model";
import { EMPTY_ROOM_OVERRIDES_FORM } from "../lib/room-overrides-form-model";

export const useRoomOverridesForm = createAutosaveEntityForm<RoomOverridesFormValues>({
  defaultValues: EMPTY_ROOM_OVERRIDES_FORM,
});
