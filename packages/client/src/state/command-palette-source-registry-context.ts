// The DYNAMIC command-palette SOURCE registry as a React CONTEXT (client-architecture-lockdown.md §6c/§7;
//  U8, §4.5) — the context/hook/provider trio is the `createRegistryContext` mint (G26).
// Assembled ONCE at the door (main.tsx, G8) with the first-party sources, read by the command palette so a
// feature's runtime-derived rows (a plugin's registered commands) become first-class palette rows without the
// palette importing that feature.
//
// The palette reads the raw `CommandPaletteSourceRegistryContext` (null-tolerant `useContext`), NOT the
// throwing `useRegistry`: a build with no Provider (or a CT that mounts none) has ZERO sources, which is the
// correct answer — the palette shows only its native groups, byte-identical to a build without the seam.

import type { CommandPaletteSource, ContributorRegistry } from "#lib";
import { createRegistryContext } from "#lib";

export type CommandPaletteSourceRegistry = ContributorRegistry<CommandPaletteSource>;

export const commandPaletteSourceRegistryContext = createRegistryContext<CommandPaletteSourceRegistry>("command-palette-source registry");
export const CommandPaletteSourceRegistryContext = commandPaletteSourceRegistryContext.Context;
