// The settings-SECTION-registry Provider (SET-SEAMS §5.2) — split from the context+hook file so a JSX
// module never mixes a hook export with a component export (useComponentExportOnlyModules). The Provider
// is the createRegistryContext mint's Provider, bound to the settings-section registry.

import { settingsSectionRegistryContext } from "./settings-section-registry-context";

export const SettingsSectionRegistryProvider = settingsSectionRegistryContext.Provider;
