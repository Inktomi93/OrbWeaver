// The Presets CONTENT teaching state (UI-Arch §4.2 Presets row "CONTENT — none selected: teaching state";
// §4.3 rule 1 no-dead-ends — the empty state teaches + offers the next step). Rendered when no preset is
// open. A containment CONSUMER (§2.1) — no outer container of its own.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, SlidersHorizontal } from "@orb/ui/icons";
import type { ReactElement } from "react";

/** The teaching welcome shown in Presets CONTENT when nothing is selected.
 *
 *  NO GEOGRAPHY IN THE COPY (side-eye F-12): "on the left" is false at every narrow width — the Presets
 *  list is a SHEET on mobile (`presetsSection.rail.mobile`), so at 430px the instruction pointed at a pane
 *  that is not on screen. The copy names the LIST, which is true wherever the list happens to be. */
export function PresetLibraryWelcome(): ReactElement {
  return (
    <EmptyState
      icon={<Icon icon={SlidersHorizontal} size="lg" />}
      title="Tune how the model generates"
      description="Pick a preset from the list to edit its sampling, reasoning, output, and prompt structure — or create a new one. A preset shapes generation; it doesn't pick the model (that's Connections)."
    />
  );
}
