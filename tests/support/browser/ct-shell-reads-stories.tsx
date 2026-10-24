import { AppShell } from "@orb/client/features/app-shell";
import type { ReactElement } from "react";
import { CtClientProviders } from "./ct-data-providers.tsx";

/** The production AppShell under the CT client providers, with no story-owned data. */
export function ShellAmbientStory(): ReactElement {
  return (
    <CtClientProviders>
      <AppShell />
    </CtClientProviders>
  );
}
