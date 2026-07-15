// The settings-pane registry Provider (client-architecture-lockdown.md §8) — split from the context+hook
// file so a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules).

import type { ReactElement, ReactNode } from "react";
import type { SettingsPaneRegistry } from "./settings-pane-registry-context";
import { SettingsPaneRegistryContext } from "./settings-pane-registry-context";

export function SettingsPaneRegistryProvider({
  value,
  children,
}: {
  readonly value: SettingsPaneRegistry;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <SettingsPaneRegistryContext.Provider value={value}>
      {children}
    </SettingsPaneRegistryContext.Provider>
  );
}
