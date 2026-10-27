import { AppShell } from "@orb/client/features/app-shell";
import { selectRefinerySession } from "@orb/client/state";
import type { RefinerySessionId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The production shell opens a session through the same selection action as its session list. */
export function RefineryCompositionShellStory({ sessionId }: { readonly sessionId: RefinerySessionId }): ReactElement {
  useState(() => {
    selectRefinerySession(sessionId);
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}
