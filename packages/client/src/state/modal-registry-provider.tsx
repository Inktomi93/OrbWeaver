// The modal-registry Provider (client-architecture-lockdown.md §7) — split from the context+hook file so
// a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules).

import type { ReactElement, ReactNode } from "react";
import type { ModalRegistry } from "./modal-registry-context";
import { ModalRegistryContext } from "./modal-registry-context";

export function ModalRegistryProvider({
  value,
  children,
}: {
  readonly value: ModalRegistry;
  readonly children: ReactNode;
}): ReactElement {
  return <ModalRegistryContext.Provider value={value}>{children}</ModalRegistryContext.Provider>;
}
