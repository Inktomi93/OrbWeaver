// The chrome-registry Provider (shell-chrome-unification.md §A/§D) — split from the context+hook file
// so a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules).

import type { ReactElement, ReactNode } from "react";
import type { ChromeRegistry } from "./chrome-registry-context";
import { ChromeRegistryContext } from "./chrome-registry-context";

export function ChromeRegistryProvider({ value, children }: { readonly value: ChromeRegistry; readonly children: ReactNode }): ReactElement {
  return <ChromeRegistryContext value={value}>{children}</ChromeRegistryContext>;
}
