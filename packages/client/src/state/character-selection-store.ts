// The character-SELECTION store (ux-flow-revamp J9 · UI-Arch §4.2 rule 1: LIST selection drives CONTENT).
// Holds which character the Characters section has selected — the route reads it to render the detail card
// in CONTENT (else the teaching welcome). Separate from the chat stores by design (J9: "Selection state: a
// `selectedCharacterId` field — NOT in the chat stores"): the Characters section's selection is its own
// per-section concern, remembered independently (§4.2 rule 2), mirroring how message-selection-store keeps
// the chat's bulk mode out of the active-chat store.
//
// `createGatedStore` (not persisted): transient device-local UI selection — a hard reload landing back on
// the section's welcome state is fine (state-law recap, UI-Arch §5). One field, so it stays well under the
// ≤10-field cap; presence of a non-null id IS "a character is selected".

import type { CharacterId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store";

interface CharacterSelectionState {
  /** The character whose detail card the Characters CONTENT shows — `null` = the section's welcome state. */
  readonly selectedCharacterId: CharacterId | null;
}

const useCharacterSelectionStore = createGatedStore<CharacterSelectionState>(
  "character-selection",
  (): CharacterSelectionState => ({ selectedCharacterId: null }),
);

/** Select a character (a library-row click) — the route swaps CONTENT to that character's detail card. */
export function selectCharacter(id: CharacterId): void {
  useCharacterSelectionStore.setState(
    { selectedCharacterId: id },
    false,
    "character-selection/select",
  );
}

/** Clear the selection (back to the Characters welcome state). */
export function clearCharacterSelection(): void {
  useCharacterSelectionStore.setState(
    { selectedCharacterId: null },
    false,
    "character-selection/clear",
  );
}

/** Reactive: the currently-selected character id (`null` = none). A primitive selector (no fresh object). */
export function useSelectedCharacterId(): CharacterId | null {
  return useCharacterSelectionStore((s) => s.selectedCharacterId);
}
