// CharacterLibraryWelcome — the CONTENT teaching hero for the "nothing selected" state. Serves both
// "library has rows, none selected" and "library is empty" identically — the create/import action is
// always present, so an empty library is never a dead end.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { LIST_OFF_SCREEN_HINT, useSectionListMode } from "#state";
import { CharacterCreateButton } from "./character-create-actions.tsx";

/** The instruction, true whatever the panes are doing — it names the LIST, never a SIDE (the N-10 rule: the
 *  list pane is a docked column, a slide-over or collapsed, and on a phone the panes stack). */
const PICK_SOMEONE = "Pick someone from the list, or make someone new.";

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
 *  The hero keeps its own primary in BOTH arms (`CharacterCreateButton`), so neither arm is a dead end and
 *  no second door is minted for the collapsed one (the two-doors refusal the databank sweep recorded). */
export function CharacterLibraryWelcome(): ReactElement {
  const listMode = useSectionListMode("characters");
  return (
    <EmptyState
      action={<CharacterCreateButton />}
      className="h-full justify-center"
      description={listMode === "collapsed" ? `${PICK_SOMEONE}${LIST_OFF_SCREEN_HINT}` : PICK_SOMEONE}
      icon={<Icon icon={Users} size="lg" />}
      title="Choose a character"
    />
  );
}
