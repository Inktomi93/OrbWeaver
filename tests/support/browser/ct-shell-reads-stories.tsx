import { AppShell } from "@orb/client/features/app-shell";
import type { ReactElement } from "react";
import { CtClientProviders } from "./ct-data-providers.tsx";
import { CtUserBus } from "./ct-user-bus.tsx";

/** The production AppShell under the CT client providers, with no story-owned data. */
export function ShellAmbientStory(): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}

/** The production AppShell with the socket and the user bus the app root wires beside it, so a server event reaches the rows it changes. */
export function ShellBusStory(): ReactElement {
  return (
    <CtClientProviders>
      <CtUserBus>
        <AppShell />
      </CtUserBus>
    </CtClientProviders>
  );
}
