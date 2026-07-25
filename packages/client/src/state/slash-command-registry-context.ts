// The SLASH-COMMAND registry as a React CONTEXT (client-architecture-lockdown.md §6c/§7) — the
// context/hook/provider trio is the `createRegistryContext` mint (G26). Assembled ONCE at the door
// (main.tsx, G8) and read by BOTH command surfaces — the chat composer's `/command` dispatch and the
// command palette — so a contributed command is discoverable and invocable from one declaration.
//
// Both consumers read the raw `SlashCommandRegistryContext` (null-tolerant `useContext`), NOT the mint's
// throwing `useRegistry`: a build with no Provider (or a CT that mounts none) has ZERO commands, which is
// the correct answer — the composer sends byte-identically and the palette shows only its native groups.

import type { ContributorRegistry, SlashCommandContribution } from "#lib";
import { createRegistryContext } from "#lib";

export type SlashCommandRegistry = ContributorRegistry<SlashCommandContribution>;

export const slashCommandRegistryContext = createRegistryContext<SlashCommandRegistry>("slash-command registry");
export const SlashCommandRegistryContext = slashCommandRegistryContext.Context;
