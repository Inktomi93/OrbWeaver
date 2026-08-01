// The character-SELECTION store: which character the Characters section has selected (CONTENT renders its
// detail card, else the welcome state) + which card-content FACET the CONTENT drill-in + CONTEXT Field
// inspector show (CONTENT and CONTEXT are sibling shell regions with no shared React ancestor, so the facet
// selection lives here, not local useState). A secondary-drill `createDrillSelectionStore` (UI-Arch §4.2;
// not persisted — a hard reload landing back on the welcome state is fine).

import type { CharacterId } from "@orb/kit/ids";
import { withViewTransition } from "#lib";
import { createDrillSelectionStore } from "./create-drill-selection-store";

// The facet id is a card-content-local string (not a `@orb/kit/ids` entity id).
const characterSelection = createDrillSelectionStore<CharacterId, string>("character-selection", { secondary: true });

// The selection is now a PANE SWAP too (list-pane-projection Arm A — the LIST slot flips picker ⇄ her
// chats), which is a section-internal structural transition: it rides the hand-rolled View Transition seam,
// the ONE legal wrapper (the router's VT cannot fire on a reducer change at a constant URL). The state→lib
// import is the landed pattern (`active-chat-store.ts`); the drill FACTORY stays untouched, so every other
// section keeps today's behavior. `prefers-reduced-motion` removes the transition inside the wrapper.

/** Select a character (a library-row click) — CONTENT swaps to its detail card and the LIST pane becomes
 *  her chats; a stale facet is cleared. */
export const selectCharacter = (characterId: CharacterId): void => withViewTransition(() => characterSelection.select(characterId));
/** Clear the selection (back to the Characters welcome state + the library picker). Clears the facet too. */
export const clearCharacterSelection = (): void => withViewTransition(() => characterSelection.clear());
/** Drill into a card-content facet — reveals the CONTENT drill-in + CONTEXT Field inspector. */
export const selectCharacterFacet = characterSelection.selectSecondary;
/** Clear the facet selection — CONTENT returns to the facet list, CONTEXT Field shows its EmptyState. */
export const clearCharacterFacet = characterSelection.clearSecondary;
/** Reactive: the currently-selected character id (`null` = none). A primitive selector (no fresh object). */
export const useSelectedCharacterId = characterSelection.usePrimaryId;
/** Reactive: the currently-drilled facet id (`null` = the facet list is showing). A primitive selector. */
export const useSelectedCharacterFacetId = characterSelection.useSecondaryId;
