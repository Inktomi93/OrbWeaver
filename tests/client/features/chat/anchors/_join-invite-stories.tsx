import { JoinInviteDialog } from "@orb/client/features/chat";
import { CtClientProviders } from "@orb/testkit/browser/ct-data-providers.tsx";
import type { ReactElement } from "react";
import { useState } from "react";

/** The production anchor owns its stages; the caller observes only its actual completion callback. */
export function JoinInviteDialogStory({ token }: { readonly token: string }): ReactElement {
  const [closed, setClosed] = useState(false);
  return (
    <CtClientProviders>
      {closed ? <output aria-label="Join dialog completion">Closed</output> : <JoinInviteDialog token={token} onDone={(): void => setClosed(true)} />}
    </CtClientProviders>
  );
}
