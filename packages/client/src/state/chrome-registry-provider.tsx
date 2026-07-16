// The chrome-registry Provider (shell-chrome-unification.md §A/§D) — split from the context+hook file so a
// JSX module never mixes a hook export with a component export (useComponentExportOnlyModules). The
// Provider is the createRegistryContext mint's Provider, bound to the chrome registry.

import { chromeRegistryContext } from "./chrome-registry-context";

export const ChromeRegistryProvider = chromeRegistryContext.Provider;
