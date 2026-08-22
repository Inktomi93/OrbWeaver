// The Presets CONTENT teaching state (UI-Arch §4.2 Presets row "CONTENT — none selected: teaching state";
// §4.3 rule 1 no-dead-ends — the empty state teaches + offers the next step). Rendered when no preset is
// open. A containment CONSUMER (§2.1) — no outer container of its own.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, SlidersHorizontal } from "@orb/ui/icons";
import type { ReactElement } from "react";
import { LIST_OFF_SCREEN_HINT, useSectionListMode } from "#state";

/** What this pane teaches whatever the panes are doing — the instruction, and the boundary with Connections
 *  a preset is most often confused across. The footnote appended beside it while the list is off screen is
 *  `LIST_OFF_SCREEN_HINT` — ONE spelling for all four section welcomes, homed beside the signal (#446). */
const TEACHING =
  "Pick a preset to edit its sampling, reasoning, output and prompt structure, or create a new one. A preset shapes generation; it doesn't pick the model (that's Connections).";

/** The teaching welcome shown in Presets CONTENT when nothing is selected.
 *
 *  NO GEOGRAPHY IN THE COPY (side-eye F-12, 2026-08-02): "on the left" is false at every narrow width —
 *  the Presets list is a SHEET on mobile (`presetsSection.rail.mobile`), so at 430px the instruction
 *  pointed at a pane that is not on screen.
 *
 *  AND NOT "FROM THE LIST" EITHER (side-eye F-28, 2026-08-03): naming the list still presupposes there IS
 *  one on screen, and below the 64rem band both panes auto-collapse — so the 960px and 418px reads
 *  instructed the user to pick from something they could not see, with no hint that it is one toggle away.
 *  The copy now names the AFFORDANCE that produces the list ("Show list panel" — the shell topbar's own
 *  string, verbatim, so a WCAG 2.5.3 voice-control user says exactly what is written), which is true in
 *  BOTH regimes: the list is either already open or one named control away.
 *
 *  #99 item 5 — THE HINT IS A FOOTNOTE NOW, NOT A STEP. Both rulings above stand and the affordance name
 *  stays verbatim; what was wrong is that the clause sat INSIDE the instruction ("Pick a preset … — use
 *  Show list panel … — or create a new one"), so at a 1280 desktop the pane told the reader to open a list
 *  that was open, 400px to its left. A reader with the list on screen should meet the instruction and
 *  nothing else. It moves to its own trailing sentence, explicitly conditional, where the narrow-regime
 *  reader still finds it and the desktop reader can skip it — which is all F-28 ever needed it to do.
 *
 *  #434 — AND NOW IT ONLY RENDERS WHILE THE LIST IS ACTUALLY OFF SCREEN. This file used to record why the
 *  fully honest version was not done ("`listMode` lives in app-shell's `use-shell-layout`, and
 *  `client-features-no-cross` bars preset from reaching it — that is a shell-signal re-home"). The re-home
 *  landed: `useSectionListMode` (`#state`) publishes the SAME resolved mode the shell's own topbar toggle
 *  reads, through the ONE `resolvePanelMode` algebra, which is the only sanctioned way for a feature to ask
 *  (a recomposition from `usePanelOverride` + the viewport reads is the M10 hand-copied-mirror bug). So the
 *  conditional sentence becomes a CONDITIONALLY RENDERED one: a reader with the list on screen meets the
 *  instruction and nothing else, and a reader without it is told a fact rather than handed an "if".
 *
 *  `!== "collapsed"`, never `=== "docked"`: an `overlay` list is on screen — floating over this pane — so
 *  telling that reader to bring the list back would be the same lie one regime over. */
export function PresetLibraryWelcome(): ReactElement {
  const listMode = useSectionListMode("presets");
  return (
    <EmptyState
      description={listMode === "collapsed" ? `${TEACHING}${LIST_OFF_SCREEN_HINT}` : TEACHING}
      icon={<Icon icon={SlidersHorizontal} size="lg" />}
      title="Tune how the model generates"
      titleStep="focal"
    />
  );
}
