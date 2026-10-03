// Canonical save status: failures are body-scale alerts; incomplete and pristine drafts are distinct.
import { Button } from "@orb/ui/button";
import { AlertTriangle, Icon } from "@orb/ui/icons";
import { Row } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import type { AutosaveSaveState } from "../create-autosave-entity-form-model.ts";

export interface AutosaveStatusProps {
  /** `draft` is the caller-known pre-persistence arm: no row exists yet, so `saved` would be a lie. */
  readonly state: AutosaveSaveState | "draft" | "restored";
  /** Re-run the pending save — wire to the factory's `retrySave`. */
  readonly onRetry: () => void;
  /** A structured refusal cannot succeed unchanged; omit Retry without changing the factory lifecycle. */
  readonly retryable?: boolean;
}

/** The shared live-save readout. On `error` the retry is a real affordance (a ghost button), never text. */
export function AutosaveStatus({ state, onRetry, retryable = true }: AutosaveStatusProps): ReactElement {
  if (state === "restored") {
    return (
      <Row gap="field" align="center" data-slot="autosave-status" role="status" aria-live="polite">
        <Text voice="gloss">Restored draft — not saved</Text>
        <Button type="button" intent="ghost" size="sm" onClick={onRetry}>
          Resume saving
        </Button>
      </Row>
    );
  }
  if (state === "error") {
    // A failed WRITE is urgent — assertive so a screen reader interrupts and announces it (role="alert"
    // = an implicit aria-live="assertive" live region; the retry stays a real focusable affordance).
    return (
      <Row gap="field" align="center" data-slot="autosave-status" role="alert">
        <Icon icon={AlertTriangle} size="sm" className="text-destructive" />
        <Text voice="reading" className="text-destructive">
          {retryable ? "Save failed —" : "Save failed"}
        </Text>
        {retryable ? (
          <Button type="button" intent="ghost" size="sm" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
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
        <Text voice="gloss">Review this form before saving.</Text>
      </Row>
    );
  }
  if (state === "draft") {
    return (
      <Text data-slot="autosave-status" voice="gloss" role="status" aria-live="polite">
        Not saved yet
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
