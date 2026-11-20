// Host-owned copy for plugin command chrome. A display name is not an identity: two installed plugins may
// choose the same name, while the admitted slug remains the human-readable disambiguator on every host surface.

import type { PluginCommandView } from "@orb/contracts/plugin";
import type { PluginId } from "@orb/kit/ids";

/** A guest-chosen identifier read as words: `inkSketch`, `ink_sketch` and `ink-sketch` all read "Ink sketch". */
export function humanizeId(id: string): string {
  const words = id
    .replace(/([a-z0-9])([A-Z])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
    .trim()
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function pluginCommandAttribution(pluginName: string, slug: string): string {
  return `${pluginName} (${slug})`;
}

export function pluginCommandActionLabel(label: string): string {
  return `Run ${label}`;
}

/** The composer's plugin command menu trigger. */
export const PLUGIN_ACTIONS_NAME = "Plugin actions";

/** A placed command's menu item: who it comes from, its group, and the label shown at that placement. */
export function placedItemLabel(item: { readonly shownName: string; readonly label: string; readonly command: Pick<PluginCommandView, "group"> }): string {
  return `${item.shownName} · ${item.command.group ?? "Commands"} · ${item.label}`;
}

/** The argument dialog's body before a command is chosen. */
export const PLUGIN_NO_COMMAND_SELECTED_TEXT = "No command selected.";

/** The heading the plugin command rows render under in the palette. */
export const PLUGIN_COMMANDS_HEADING = "Plugin commands";

/** The argument dialog's title. */
export const PLUGIN_COMMAND_ARGS_TITLE = "Run command";

/** The composer menu's undo of the last draft replacement. */
export function pluginUndoName(replacement: string): string {
  return `Undo ${replacement}`;
}

/** The display names two or more installs share: the only names that need their slug to be told apart. */
export function sharedPluginNames(plugins: readonly { readonly pluginId: PluginId; readonly pluginName: string }[]): ReadonlySet<string> {
  const idsByName = new Map<string, Set<PluginId>>();
  for (const { pluginId, pluginName } of plugins) {
    idsByName.set(pluginName, (idsByName.get(pluginName) ?? new Set<PluginId>()).add(pluginId));
  }
  return new Set([...idsByName].filter(([, ids]) => ids.size > 1).map(([name]) => name));
}

/** What a surface calls a plugin: its display name, plus the slug only when another install shares that name. */
export function pluginCommandShownName(pluginName: string, slug: string, shared: ReadonlySet<string>): string {
  return shared.has(pluginName) ? pluginCommandAttribution(pluginName, slug) : pluginName;
}
