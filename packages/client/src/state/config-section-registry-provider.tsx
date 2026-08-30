// The config-SECTION-registry Provider (SET-SEAMS §5.2) — split from the context+hook file so a JSX
// module never mixes a hook export with a component export (useComponentExportOnlyModules). The Provider
// is the createRegistryContext mint's Provider, bound to the config-section registry.

import { configSectionRegistryContext } from "./config-section-registry-context.ts";

export const ConfigSectionRegistryProvider = configSectionRegistryContext.Provider;
