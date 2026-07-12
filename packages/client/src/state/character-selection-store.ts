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
  /** The card-content FACET the CONTENT drill-in + the CONTEXT Field inspector show (character-editor
   *  redesign) — `null` = the facet list is showing (nothing drilled). A facet id (not branded — facet ids
   *  are card-field-local strings from the static registry, not a `@orb/kit/ids` entity id; mirrors
   *  preset-selection-store's `selectedSectionId`). CONTENT (the surface) + CONTEXT (the Field inspector)
   *  are sibling shell regions with no shared React ancestor, so the selection lives HERE, not in local
   *  `useState`. */
  readonly selectedFacetId: string | null;
}

const useCharacterSelectionStore = createGatedStore<CharacterSelectionState>(
  "character-selection",
  (): CharacterSelectionState => ({ selectedCharacterId: null, selectedFacetId: null }),
);

/** Select a character (a library-row click) — the route swaps CONTENT to that character's detail card.
 *  Clears the facet selection so a stale facet never carries across characters. */
export function selectCharacter(id: CharacterId): void {
  useCharacterSelectionStore.setState(
    { selectedCharacterId: id, selectedFacetId: null },
    false,
    "character-selection/select",
  );
}

/** Clear the selection (back to the Characters welcome state). Clears the facet too. */
export function clearCharacterSelection(): void {
  useCharacterSelectionStore.setState(
    { selectedCharacterId: null, selectedFacetId: null },
    false,
    "character-selection/clear",
  );
}

/** Drill into a card-content facet — a facet-row click reveals the CONTENT drill-in + the CONTEXT Field
 *  inspector (character-editor redesign; mirrors `selectPresetSection`). */
export function selectCharacterFacet(id: string): void {
  useCharacterSelectionStore.setState(
    { selectedFacetId: id },
    false,
    "character-selection/select-facet",
  );
}

/** Clear the facet selection — CONTENT returns to the facet list, CONTEXT Field shows its EmptyState (also
 *  fired by the drill-in's ← Back). */
export function clearCharacterFacet(): void {
  useCharacterSelectionStore.setState(
    { selectedFacetId: null },
    false,
    "character-selection/clear-facet",
  );
}

/** Reactive: the currently-selected character id (`null` = none). A primitive selector (no fresh object). */
export function useSelectedCharacterId(): CharacterId | null {
  return useCharacterSelectionStore((s) => s.selectedCharacterId);
}

/** Reactive: the currently-drilled facet id (`null` = the facet list is showing). A primitive selector. */
export function useSelectedCharacterFacetId(): string | null {
  return useCharacterSelectionStore((s) => s.selectedFacetId);
}
