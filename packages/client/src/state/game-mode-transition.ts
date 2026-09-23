// THE GAME-MODE TRANSITION SEAM (#862 + #863) — the ONE home for what a USER-INITIATED game-mode start or
// stop says and reveals, plus the ONE home for the nouns both doors wear.
//
// WHY IT LIVES IN `#state` AND NOT IN EITHER FEATURE: the two doors are in DIFFERENT features — the ⋯ menu
// is chat's (`chat-options-menu.tsx`), the Game-tab door is rpg's (`rpg-game-door.tsx`) — and a client
// feature may never import another (`client-features-no-cross`). One concept with two doors and two
// vocabularies is exactly the defect side-eye filed (#863 P2: "one concept, four names"), so the words and
// the after-effects are shared state, not copied literals.
//
// USER-INITIATED ONLY (as amended 2026-08-30). ARRIVING at a game room
// still gets ZERO ceremony — the pane swaps like any chat switch. A start/stop the user just PERFORMED is
// not arrival, it is an event, and it is owed feedback: ONE `role="status"` announcement, and — on START —
// the panel opening onto the game's own Status tab so the action reveals its own result. NO ANIMATION, in
// either case: the §4.1 mechanism ("no takeover animation, a game is content") is untouched; only its
// INPUT changed, from "every game appearance" to "arrival".

import { revealContextPanel } from "./shell-store.ts";
import { announceStatus } from "./status-announcement-store.ts";

/** The context tab a start lands on — the game's own state centerpiece (`rpg.status`, rpg's registered tab
 *  id). Deterministic from BOTH doors: the landing used to be whatever tab happened to be selected, whose
 *  worst case was an empty host-console schema form (#863 P1). */
const GAME_STATUS_TAB_ID = "rpg.status";

/** The ⋯ menu's toggle labels — ONE noun for the feature, everywhere (`game mode`). */
export const GAME_MODE_ON_LABEL = "Turn on game mode";
export const GAME_MODE_OFF_LABEL = "Turn off game mode";

/** The reassurance that used to live ONLY in a native `title` — invisible on touch, dwell-gated on a
 *  pointer, and never the accessible name (#863 P1). It is copy at the moment of the decision now: the ⋯
 *  item's own second line, and the off-door's body. */
export const GAME_MODE_KEPT_LINE = "Your sheets, scene and quests are kept.";

/** The off-door's kicker + button, in the same noun. */
export const GAME_MODE_OFF_KICKER = "Game mode off";
export const GAME_MODE_RESUME_LABEL = "Turn game mode back on";

/** The two announcements. Each states WHAT changed and WHERE the result is — the two things a user who was
 *  looking at the composer (the far side of the app from the panel) cannot see. */
export const GAME_MODE_ON_ANNOUNCEMENT = "Game mode on — the Game panel is open";
export const GAME_MODE_OFF_ANNOUNCEMENT = "Game mode off — your sheets, scene and quests are kept";

/** A user-initiated START committed: announce it, and reveal its result (open the context panel on the
 *  game's Status tab). Called from a mutation's success arm — never from a chat switch, a resume, or a
 *  remote update, which are ARRIVAL and keep §4.1's silence. */
export function onGameModeStarted(): void {
  revealContextPanel(GAME_STATUS_TAB_ID);
  announceStatus(GAME_MODE_ON_ANNOUNCEMENT);
}

/** A user-initiated STOP committed: announce it, with the kept-state reassurance. Nothing is revealed —
 *  the surface the user was looking at is what changed. */
export function onGameModeStopped(): void {
  announceStatus(GAME_MODE_OFF_ANNOUNCEMENT);
}
