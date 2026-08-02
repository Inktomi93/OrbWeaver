// The ONE live autosave status affordance (north-star §7 / D66 A4): "Saved / Saving… / Save failed —
// Retry", rendered where an editor's Save button used to be. Fed by createAutosaveEntityForm's exposed
// `saveState` + `retrySave` — never a per-surface hand-roll. The character editor is the first consumer;
// presets + the settings panes adopt it next.
// Compose-only: @orb/ui primitives, no raw intrinsics.
//
// EVERY LINE HERE IS THE `gloss` VOICE (side-eye F-21, 2026-08-03). It used to spell `size="micro"
// tone="muted"` by hand, and `size="micro"` carries `tracking-micro` — the 0.08em micro-CAPS tracking —
// so the header's "Saved" rendered at the gloss colour and the gloss step but 0.84px LOOSER than every
// other gloss beside it. One tuple off by one axis, on the one word the header shows constantly. The
// `voice` axis is the closed grammar that exists so a status line cannot be assembled by taste.

import { Button } from "@orb/ui/button";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AutosaveSaveState } from "./create-autosave-entity-form";

export interface AutosaveStatusProps {
  readonly state: AutosaveSaveState;
  /** Re-run the pending save — wire to the factory's `retrySave`. */
  readonly onRetry: () => void;
  /**
   * A reassurance line rendered ONLY in the `saved` state (D78 §6): the settings panes' "Synced across
   * your devices." / system-pane explainer moves HERE, replacing a sibling `Text`. Rendered inside the
   * status structurally so "Save failed — Retry · <caption>" is unrepresentable.
   */
  readonly caption?: string;
}

/** The shared live-save readout. On `error` the retry is a real affordance (a ghost button), never text. */
export function AutosaveStatus({ state, onRetry, caption }: AutosaveStatusProps): ReactElement {
  if (state === "error") {
    // A failed WRITE is urgent — assertive so a screen reader interrupts and announces it (role="alert"
    // = an implicit aria-live="assertive" live region; the retry stays a real focusable affordance).
    return (
      <Row gap="field" align="center" data-slot="autosave-status" role="alert">
        <Text voice="gloss">Save failed —</Text>
        <Button type="button" intent="ghost" size="sm" onClick={onRetry}>
          Retry
        </Button>
      </Row>
    );
  }
  if (state === "saved" && caption !== undefined) {
    return (
      <Row gap="field" align="center" data-slot="autosave-status" role="status" aria-live="polite">
        <Text voice="gloss">Saved</Text>
        <Text voice="gloss">{caption}</Text>
      </Row>
    );
  }
  // Saving…/Saved: polite so the transition is announced without interrupting (role="status" carries an
  // implicit aria-live="polite"; both are set so the intent reads plainly at the call site).
  return (
    <Text data-slot="autosave-status" voice="gloss" role="status" aria-live="polite">
      {state === "saving" ? "Saving…" : "Saved"}
    </Text>
  );
}
