// The chrome-registry Provider — split from the context+hook file so a JSX module never mixes a hook
// export with a component export (useComponentExportOnlyModules).

import type { ReactElement, ReactNode } from "react";
import type { ChromeRegistry } from "./chrome-registry-context";
import { ChromeRegistryContext } from "./chrome-registry-context";

export function ChromeRegistryProvider({
  value,
  children,
}: {
  readonly value: ChromeRegistry;
  readonly children: ReactNode;
}): ReactElement {
  return <ChromeRegistryContext.Provider value={value}>{children}</ChromeRegistryContext.Provider>;
}
