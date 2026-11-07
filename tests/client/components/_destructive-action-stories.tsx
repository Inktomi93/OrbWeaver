import { DestructiveAction } from "@orb/client/components";
import { CtIsolation } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";

/** The production control over a verb that refuses its first press, so the confirm has to be the retry. */
export function DestructiveActionRetryStory(): ReactElement {
  const [presses, setPresses] = useState(0);
  const press = (): Promise<void> => {
    setPresses(presses + 1);
    return presses === 0 ? Promise.reject(new Error("the row is locked")) : Promise.resolve();
  };
  return (
    <CtIsolation subject="DestructiveAction" isolates="isolates the confirm from authenticated mutations">
      <DestructiveAction
        confirm={{ confirmLabel: "Erase row", description: "This cannot be undone.", title: "Erase this row?" }}
        onConfirm={press}
        trigger={<Button tone="destructive">Erase</Button>}
      />
      <output aria-label="Press count">{presses}</output>
    </CtIsolation>
  );
}
