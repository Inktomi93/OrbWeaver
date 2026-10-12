// Story wrappers for the textarea CT (CT mounts from a non-test module). Mirrors the combobox seal's
// fixture file.
import { Textarea } from "@orb/ui/textarea";
import type { ReactElement } from "react";
import { useState } from "react";

/**
 * Renders the SECOND argument Base UI hands `Field.Control.onValueChange` — the eventDetails object
 * carrying `reason` / `cancel()` / `allowPropagation()`. A seal that re-spells the handler as
 * `(value: string) => void` drops it, and the readout stays "none" forever.
 */
export function ValueChangeDetailsStory(): ReactElement {
  const [seen, setSeen] = useState("no-change-yet");
  return (
    <div>
      <Textarea
        aria-label="Bio"
        onValueChange={(value, details): void => {
          const hasCancel = typeof details.cancel === "function";
          setSeen(`${value}|${details.reason}|${hasCancel ? "cancellable" : "no-cancel"}`);
        }}
      />
      <output data-testid="details-readout">{seen}</output>
    </div>
  );
}
