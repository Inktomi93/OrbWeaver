// The section-registry Provider (client-architecture-lockdown.md §7) — split from the context+hook file
// so a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules).

import type { ReactElement, ReactNode } from "react";
import type { SectionRegistry } from "./section-registry-context";
import { SectionRegistryContext } from "./section-registry-context";

export function SectionRegistryProvider({
  value,
  children,
}: {
  readonly value: SectionRegistry;
  readonly children: ReactNode;
}): ReactElement {
  return (
    <SectionRegistryContext.Provider value={value}>{children}</SectionRegistryContext.Provider>
  );
}
