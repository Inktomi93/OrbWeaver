// The settings-pane-registry Provider (client-architecture-lockdown.md §8) — split from the context+hook
// file so a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules).
// The Provider is the createRegistryContext mint's Provider, bound to the settings-pane registry.

import { settingsPaneRegistryContext } from "./settings-pane-registry-context.ts";

export const SettingsPaneRegistryProvider = settingsPaneRegistryContext.Provider;
