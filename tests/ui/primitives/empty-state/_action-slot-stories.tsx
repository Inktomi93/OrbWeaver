import { CtIsolation } from "@orb/testkit/browser";
import { EmptyState } from "@orb/ui/empty-state";
import type { ReactElement } from "react";

/** An empty state that either offers a button as its next step or states that it has none. */
export function ActionSlotStory({ offered }: { readonly offered: boolean }): ReactElement {
  return (
    <CtIsolation subject="EmptyState action slot" isolates="The action slot exists only when an action is offered, and holds it">
      <EmptyState action={offered ? <button type="button">Go</button> : null} title="Nothing here" />
    </CtIsolation>
  );
}
