// The ONE live autosave status affordance (north-star §7 / D66 A4): "Saved / Saving… / Save failed —
// Retry", rendered where an editor's Save button used to be. Fed by createAutosaveEntityForm's exposed
// `saveState` + `retrySave` — never a per-surface hand-roll. The character editor is the first consumer;
// presets + the settings panes adopt it next. Compose-only: @orb/ui primitives, no raw intrinsics.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AutosaveSaveState } from "./create-autosave-entity-form";

export interface AutosaveStatusProps {
  readonly state: AutosaveSaveState;
  /** Re-run the pending save — wire to the factory's `retrySave`. */
  readonly onRetry: () => void;
}

/** The shared live-save readout. On `error` the retry is a real affordance (a ghost button), never text. */
export function AutosaveStatus({ state, onRetry }: AutosaveStatusProps): ReactElement {
  if (state === "error") {
    return (
      <Row gap="field" align="center" data-slot="autosave-status">
        <Text size="micro" tone="muted">
          Save failed —
        </Text>
        <Button type="button" intent="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </Row>
    );
  }
  return (
    <Text size="micro" tone="muted" data-slot="autosave-status">
      {state === "saving" ? "Saving…" : "Saved"}
    </Text>
  );
}
