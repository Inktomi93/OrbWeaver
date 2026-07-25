// The slash-command-registry Provider (client-architecture-lockdown.md §7) — split from the context file
// so a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules).

import { slashCommandRegistryContext } from "./slash-command-registry-context";

export const SlashCommandRegistryProvider = slashCommandRegistryContext.Provider;
