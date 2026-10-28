import { AppShell } from "@orb/client/features/app-shell";
import type { ConfigGroupId } from "@orb/client/state";
import { openConfigTo } from "@orb/client/state";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";
import { useState } from "react";

/** The actual shell opens a collection through its production navigation action. */
export function FilterRecoveryShellStory({ group }: { readonly group?: ConfigGroupId }): ReactElement {
  useState(() => {
    if (group !== undefined) {
      openConfigTo(group);
    }
    return true;
  });
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}
