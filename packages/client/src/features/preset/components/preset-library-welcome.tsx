// The Presets CONTENT teaching state (UI-Arch §4.2 Presets row "CONTENT — none selected: teaching state";
// §4.3 rule 1 no-dead-ends — the empty state teaches + offers the next step). Rendered when no preset is
// open. A containment CONSUMER (§2.1) — no outer container of its own.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, SlidersHorizontal } from "@orb/ui/icons";
import type { ReactElement } from "react";

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
 *  BOTH regimes: the list is either already open or one named control away. */
export function PresetLibraryWelcome(): ReactElement {
  return (
    <EmptyState
      icon={<Icon icon={SlidersHorizontal} size="lg" />}
      title="Tune how the model generates"
      description="Pick a preset to edit its sampling, reasoning, output, and prompt structure — use Show list panel in the top bar if the list isn't open, or create a new one. A preset shapes generation; it doesn't pick the model (that's Connections)."
    />
  );
}
