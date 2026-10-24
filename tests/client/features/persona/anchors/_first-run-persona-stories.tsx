import { FirstRunPersonaDialog } from "@orb/client/features/persona";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

/** The production first-run gate under the client providers, as `/` mounts it beside the shell. */
export function FirstRunPersonaDialogStory(): ReactElement {
  return (
    <CtClientProviders>
      <FirstRunPersonaDialog />
    </CtClientProviders>
  );
}
