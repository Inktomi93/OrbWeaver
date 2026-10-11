// Host-owned copy for plugin command chrome. A display name is not an identity: two installed plugins may
// choose the same name, while the admitted slug remains the human-readable disambiguator on every host surface.

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

export function pluginCommandAttributedActionLabel(shownName: string, group: string, label: string): string {
  return `${shownName} · ${group} · ${pluginCommandActionLabel(label)}`;
}
