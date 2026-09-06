// The character-SELECTION store: which character the Characters section has selected (CONTENT renders its
// detail card, else the welcome state) + which card-content FACET the CONTENT drill-in + CONTEXT Field
// inspector show (CONTENT and CONTEXT are sibling shell regions with no shared React ancestor, so the facet
// selection lives here, not local useState). A secondary-drill `createDrillSelectionStore` (UI-Arch §4.2;
// not persisted — a hard reload landing back on the welcome state is fine).

import type { CharacterId } from "@orb/kit/ids";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";
import type { SectionSelection } from "./section-registry.ts";
import { withContentSwap } from "./shell-store.ts";

// The facet id is a card-content-local string (not a `@orb/kit/ids` entity id).
const characterSelection = createDrillSelectionStore<CharacterId, string>("character-selection", { secondary: true });

// The selection swaps CONTENT (the welcome state ⇄ her editor), which is a section-internal structural
// transition: it rides the shell's ONE content-swap door (`withContentSwap`), which carries BOTH halves of
// a swap — the hand-rolled View Transition (the router's VT cannot fire on a reducer change at a constant
// URL) and the #1795 float lifetime, since a CONTENT-scoped float is about the card being left and goes
// with it. Calling `withViewTransition` from here directly would take only the first half. The drill
// FACTORY stays untouched, so every other section keeps today's behavior; `prefers-reduced-motion` removes
// the transition inside the wrapper.
//
// THE SELECTION HAS ONE FOCUS CLAIMANT AGAIN (#501). It used to have two — the LIST pane swapped to her
// chats at the same moment the CONTENT editor mounted, so which one took focus had to be a DECISION carried
// by the INTENT (`selectCharacterFromPicker` / `listProjectionOwnsFocus`) rather than effect-order roulette.
// The LIST stays the library now (owner ruling 2026-08-22), so nothing unmounts under the pressed row and
// the editor's own `useFocusOnMount` is the only claimant: the intent seam went with the race.

/** Select a character (a library-row/face click, a create, a deep link, an agent nav) — CONTENT swaps to
 *  her detail card and a stale facet is cleared. */
export const selectCharacter = (characterId: CharacterId): void => {
  withContentSwap(() => characterSelection.select(characterId));
};
/** Clear the selection (back to the Characters welcome state). Clears the facet too. */
export const clearCharacterSelection = (): void => {
  withContentSwap(() => characterSelection.clear());
};
/** Drill into a card-content facet — reveals the CONTENT drill-in + CONTEXT Field inspector. */
export const selectCharacterFacet = characterSelection.selectSecondary;
/** Clear the facet selection — CONTENT returns to the facet list, CONTEXT Field shows its EmptyState. */
export const clearCharacterFacet = characterSelection.clearSecondary;
/** Reactive: the currently-selected character id (`null` = none). A primitive selector (no fresh object). */
export const useSelectedCharacterId = characterSelection.usePrimaryId;
/** Reactive: the currently-drilled facet id (`null` = the facet list is showing). A primitive selector. */
export const useSelectedCharacterFacetId = characterSelection.useSecondaryId;
/** The section-registry SEAM (`SectionSelection`) — what the SHELL reads for the mobile ONE-SHELL rule.
 *  `clear` is THIS module's, not the factory's: clearing from the shell's back affordance must fire the same
 *  view transition a clear from inside the section does, or the two doors out of a character would behave
 *  differently. */
export const characterSectionSelection: SectionSelection = { ...characterSelection.selection, clear: clearCharacterSelection };
