// CharacterLibraryWelcome — the CONTENT teaching hero for the "nothing selected" state. Serves both
// "library has rows, none selected" and "library is empty" identically — a way to get a character is always
// reachable, so an empty library is never a dead end.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { LIST_OFF_SCREEN_HINT, useSectionListMode } from "#state";
import { CharacterCreateButton } from "./character-create-actions.tsx";

/** The instruction, true whatever the panes are doing — it names the LIST, never a SIDE (the N-10 rule: the
 *  list pane is a docked column, a slide-over or collapsed, and on a phone the panes stack). */
const PICK_SOMEONE = "Pick someone from the list, or make someone new.";

/** …and the same instruction for the reader who can SEE the list, pointing at the door that is on screen
 *  (#520). It names the band's primary by its visible label, verbatim — WCAG 2.5.3, a voice-control user
 *  says what is written. */
const PICK_SOMEONE_OR_NEW = "Pick someone from the list, or make someone new with New at the top of it.";

/** The Characters CONTENT teaching hero (§5) — shown when no character is selected.
 *
 *  #446 — NAMING THE LIST STILL PRESUPPOSES ONE IS ON SCREEN, which is the half the side-agnostic rewrite
 *  did not fix (Presets F-28, carried across the sweep): the shell auto-collapses this section's docked
 *  default in the narrow-desktop band, focus mode hides both panes, and a reader can collapse it by hand —
 *  three states where "Pick someone from the list" points at nothing. So the footnote is CONDITIONALLY
 *  RENDERED off the shell's own resolved mode (`useSectionListMode`), never printed as an unconditional
 *  "if": a reader with the list on screen meets the instruction and nothing else.
 *
 *  `!== "collapsed"`, never `=== "docked"`: an `overlay` list is on screen — floating over this pane — so
 *  telling that reader to bring the list back would be a lie one regime over.
 *
 *  #520 — THE PRIMARY RIDES THE SAME CONDITION NOW, AND THE #446 RULING SURVIVES: ITS INPUT CHANGED. That
 *  ruling was "the hero keeps its own primary in BOTH arms, so neither arm is a dead end and no second door
 *  is minted for the collapsed one", and every word of it holds — what changed is the observation
 *  (side-eye se-verify-1, `duplicate-action-door`) that in the DOCKED arm the hero's New was never the
 *  section's only door: the LIST band's New sits ~200px away on the same screen, so the plane carried two.
 *  The collapsed arm took the band off screen with the list, and there the hero's New IS the only door —
 *  which is exactly the dead end #446 refused to ship. One condition, therefore, satisfies both: never two
 *  doors on screen at once, never a pane you cannot act from. The docked arm's copy points AT the surviving
 *  door instead of duplicating it. */
export function CharacterLibraryWelcome(): ReactElement {
  const listMode = useSectionListMode("characters");
  const listOffScreen = listMode === "collapsed";
  return (
    <EmptyState
      className="h-full justify-center"
      description={listOffScreen ? `${PICK_SOMEONE}${LIST_OFF_SCREEN_HINT}` : PICK_SOMEONE_OR_NEW}
      icon={<Icon icon={Users} size="lg" />}
      title="Choose a character"
      {...(listOffScreen ? { action: <CharacterCreateButton /> } : {})}
    />
  );
}
