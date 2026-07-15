// The Presets CONTENT teaching state (UI-Arch §4.2 Presets row "CONTENT — none selected: teaching state";
// §4.3 rule 1 no-dead-ends — the empty state teaches + offers the next step). Rendered when no preset is
// open. A containment CONSUMER (§2.1) — no outer container of its own.

import { EmptyState } from "@orb/ui/empty-state";
import { Icon, SlidersHorizontal } from "@orb/ui/icons";
import type { ReactElement } from "react";

/** The teaching welcome shown in Presets CONTENT when nothing is selected. */
export function PresetLibraryWelcome(): ReactElement {
  return (
    <EmptyState
      icon={<Icon icon={SlidersHorizontal} size="lg" />}
      title="Tune how the model generates"
      description="Pick a preset on the left to edit its sampling, reasoning, output, and prompt structure — or create a new one. A preset shapes generation; it doesn't pick the model (that's Connections)."
    />
  );
}
