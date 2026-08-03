// The section-registry Provider (client-architecture-lockdown.md §7) — split from the context+hook file so
// a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules). The
// Provider is the createRegistryContext mint's Provider, bound to the section registry.

import { sectionRegistryContext } from "./section-registry-context.ts";

export const SectionRegistryProvider = sectionRegistryContext.Provider;
