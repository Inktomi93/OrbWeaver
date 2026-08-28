// The command-palette-source-registry Provider (client-architecture-lockdown.md §7) — split from the context
// file so a JSX module never mixes a hook export with a component export (useComponentExportOnlyModules).

import { commandPaletteSourceRegistryContext } from "./command-palette-source-registry-context.ts";

export const CommandPaletteSourceRegistryProvider = commandPaletteSourceRegistryContext.Provider;
