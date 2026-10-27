import { AppShell } from "@orb/client/features/app-shell";
import type { ConfigGroupId } from "@orb/client/state";
import { openConfigTo } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The actual shell opens a registered settings group through its production navigation action. */
export function ConfigHeadingShellStory({ group }: { readonly group: ConfigGroupId }): ReactElement {
  useState(() => {
    openConfigTo(group);
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}
