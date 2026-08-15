// The character-SELECTION store: which character the Characters section has selected (CONTENT renders its
// detail card, else the welcome state) + which card-content FACET the CONTENT drill-in + CONTEXT Field
// inspector show (CONTENT and CONTEXT are sibling shell regions with no shared React ancestor, so the facet
// selection lives here, not local useState). A secondary-drill `createDrillSelectionStore` (UI-Arch §4.2;
// not persisted — a hard reload landing back on the welcome state is fine).

import type { CharacterId } from "@orb/kit/ids";
import { withViewTransition } from "#lib";
import { createDrillSelectionStore } from "./create-drill-selection-store.ts";
import type { SectionSelection } from "./section-registry.ts";

// The facet id is a card-content-local string (not a `@orb/kit/ids` entity id).
const characterSelection = createDrillSelectionStore<CharacterId, string>("character-selection", { secondary: true });

// The selection is now a PANE SWAP too (Arm A — the LIST slot flips picker ⇄ her
// chats), which is a section-internal structural transition: it rides the hand-rolled View Transition seam,
// the ONE legal wrapper (the router's VT cannot fire on a reducer change at a constant URL). The state→lib
// import is the landed pattern (`active-chat-store.ts`); the drill FACTORY stays untouched, so every other
// section keeps today's behavior. `prefers-reduced-motion` removes the transition inside the wrapper.

// THE FOCUS OWNER OF A SELECTION (the P1 focus race). One selection mounts TWO
// focus-managing surfaces at once: the LIST projection (the pane that just swapped) and the CONTENT editor
// (`useFocusOnMount`). Which one wins must be a DECISION, not effect-order roulette — so the INTENT that
// wrote the selection carries it: a pick made FROM THE LIST PICKER lands focus in the projection (the pane
// the user just transformed); every other entry (deep link, agent-nav, a fresh create) leaves it with the
// editor, which keeps today's behavior. Deliberately NOT reactive state: it is read ONCE inside each
// surface's mount effect, and re-reading it must never re-render anything.
let pickerSelection: CharacterId | null = null;

function writeSelection(characterId: CharacterId, fromPicker: boolean): void {
  pickerSelection = fromPicker ? characterId : null;
  withViewTransition(() => characterSelection.select(characterId));
}

/** Select a character (a create, a deep link, an agent nav) — CONTENT swaps to its detail card and the LIST
 *  pane becomes her chats; a stale facet is cleared. Focus stays the CONTENT editor's (see above). */
export const selectCharacter = (characterId: CharacterId): void => writeSelection(characterId, false);
/** Select a character FROM THE LIST PICKER (a library-row/face click) — the same write, plus the focus
 *  decision the pane swap needs: the projection that replaces the picker takes focus. */
export const selectCharacterFromPicker = (characterId: CharacterId): void => writeSelection(characterId, true);
/** Does the LIST projection own focus for this character's mount? True only for a picker-originated
 *  selection — the projection shell focuses itself, and the CONTENT editor stands its own mount-focus down. */
export const listProjectionOwnsFocus = (characterId: CharacterId): boolean => pickerSelection === characterId;
/** Clear the selection (back to the Characters welcome state + the library picker). Clears the facet too —
 *  and the picker focus-intent with it, so a later deep link to the SAME character can't inherit it. */
export const clearCharacterSelection = (): void => {
  pickerSelection = null;
  withViewTransition(() => characterSelection.clear());
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
 *  view-transition + picker-focus reset a clear from inside the section does, or the two doors out of a
 *  character would behave differently. */
export const characterSectionSelection: SectionSelection = { ...characterSelection.selection, clear: clearCharacterSelection };
