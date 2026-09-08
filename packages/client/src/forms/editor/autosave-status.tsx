// The ONE live autosave status affordance (north-star §7 / D66 A4): "Saved / Saving… / Draft / Not saved / Save
// failed — Retry", rendered where an editor's Save button used to be.
//
// THE `caption` PROP IS GONE (#104 item 2, owner-ruled 2026-08-16). D78 §6 gave `saved` an optional
// reassurance line, and in practice every one of its 15 call sites passed the same string — "Synced across
// your devices." — which is a SaaS promise a self-hosted single-user box does not make. With the line
// killed the prop had zero production consumers, so it went with it rather than staying as a dead
// affordance. "Saved" is the whole true statement; a future arm that needs a second clause should state
// what it actually knows, not re-open a general slot. Fed by createAutosaveEntityForm's exposed
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
import type { AutosaveSaveState } from "../create-autosave-entity-form-model.ts";

export interface AutosaveStatusProps {
  /** `draft` is the caller-known pre-persistence arm: no row exists yet, so `saved` would be a lie. */
  readonly state: AutosaveSaveState | "draft";
  /** Re-run the pending save — wire to the factory's `retrySave`. */
  readonly onRetry: () => void;
}

/** The shared live-save readout. On `error` the retry is a real affordance (a ghost button), never text. */
export function AutosaveStatus({ state, onRetry }: AutosaveStatusProps): ReactElement {
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
  if (state === "unreadable") {
    // THE ONE ARM WITH NO VERB (#1716). The stored row cannot be read, so the server refuses every write
    // derived from it and the driver never attempts one — a Retry here is the affordance that lies, which
    // is exactly why this is a fifth state and not `error`. POLITE, like `blocked` and unlike `error`: it
    // is a standing property of the row, true before the reader touched anything, and the surface's own
    // `StoredConfigUnreadableNotice` carries the REASON and the repair doors. This line is the STATE.
    return (
      <Text aria-live="polite" className="text-destructive" data-slot="autosave-status" role="status" voice="gloss">
        Can't save — this couldn't be read
      </Text>
    );
  }
  if (state === "blocked") {
    // A HELD write, not a failed one (side-eye PROSE-LIMIT P2): the driver gates on `form.state.isValid`, so
    // while a field is refusing its value nothing is attempted — and this line used to keep reading "Saved"
    // over it, which is the only status in the set that is actively false. It stays POLITE, unlike `error`:
    // the interrupting announcement belongs to the field's own error/alert (the REASON); this is the STATE,
    // and it is what a screen-reader user hears when they leave the field expecting an autosave. No retry —
    // retrying an invalid form does nothing; the fix is in the field.
    return (
      <Row align="center" data-slot="autosave-status" gap="field" role="status" aria-live="polite">
        <Text className="text-destructive" voice="gloss">
          Not saved
        </Text>
        <Text voice="gloss">Fix the highlighted field to save.</Text>
      </Row>
    );
  }
  if (state === "draft") {
    return (
      <Text data-slot="autosave-status" voice="gloss" role="status" aria-live="polite">
        Draft — edit to create
      </Text>
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
