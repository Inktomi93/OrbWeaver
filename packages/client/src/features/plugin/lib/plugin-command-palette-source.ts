// pluginCommandPaletteSource — the DYNAMIC command-palette source that fans the caller's registered plugin
// commands into first-class palette rows. ONE first-party contributor
// for the whole platform: the per-plugin, per-command fan happens INSIDE `useRows` off `plugin.listCommands`,
// so the palette-source registry never grows when a person installs something (the one-assembly law, G8).
//
// WHY THIS AND NOT MORE `/plugin` PAINT. U5 gave every plugin command ONE reachable shape — `/plugin <slug>
// <cmd>` — discoverable only if you already know the plugin and command names. U8's mandate is that each
// command is its OWN searchable row (name + plugin label + describe), so the command palette — the ST-extension
// UX backbone — surfaces them like any house action. This is a SURFACING layer, not a new execution path: a
// picked row runs through the SAME `usePluginCommandRunner` the `/plugin` dispatch and the wand menu already
// share, so the three surfaces cannot drift (one resolve, one invoke, one outcome).
//
// NO PER-ROW MOUNT. A `SlashCommandContribution` mounts an invisible fiber per command so a hook-using runner
// gets its own fiber; plugin commands need none of that — they share ONE runner hook (`usePluginCommandRunner`,
// a single hook at the source's fiber), so the rows are plain data with a bound `run` closure. That is exactly
// what `CommandPaletteSource` is for (a runtime-fanned set behind one resolver), and why it is a distinct
// mechanism from the static slash registry rather than that one wearing more paint.

import { Blocks } from "@orb/ui/icons";
import type { CommandPaletteSource, PaletteCommandRow, SlashCommandContext } from "#lib";
import { usePluginCommands, useRunPluginCommand } from "../hooks/use-plugin-commands.ts";

/** The heading the plugin command rows render under in the palette. */
const HEADING = "Plugin commands";

/** The caller's registered plugin commands as palette rows — one per command, plugin-labelled. A HOOK: it
 *  reads the caller's own commands and binds each to the shared runner, both in the source's own fiber (the
 *  palette renders this source as its own component, so these hooks never run in a loop at the palette). An
 *  empty return renders no group — a caller with no granted-and-enabled plugin commands is byte-identical to a
 *  build without the source. */
function usePluginPaletteRows(context: SlashCommandContext): readonly PaletteCommandRow[] {
  const commands = usePluginCommands();
  const runCommand = useRunPluginCommand(context.chatId);
  return commands.map((command) => ({
    // The wire-owned `(pluginId, name)` pair is the row's identity — unique across the caller's installs even
    // when two plugins register a same-named command (the slug is the disambiguator a person types, but the id
    // is the plugin's row, which the name alone does not pin).
    id: `plugin-command:${command.pluginId}:${command.name}`,
    label: command.name,
    describe: command.describe,
    badge: command.pluginName,
    // The `/plugin` spelling is a real search term — a person who knows the dispatch grammar finds the row by it.
    keywords: [command.pluginName, command.slug, `/plugin ${command.slug} ${command.name}`],
    // #791 — the shared collect-or-run: a command that DECLARES typed args opens the args-collection modal, else
    // it dispatches directly (the U8 shape, unchanged). One home so the palette and the wand menu cannot drift.
    run: (): void => runCommand(command),
  }));
}

export const pluginCommandPaletteSource: CommandPaletteSource = {
  id: "plugin-commands",
  heading: HEADING,
  icon: Blocks,
  useRows: usePluginPaletteRows,
};
