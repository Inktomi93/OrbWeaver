// Host-owned copy for plugin command chrome. A display name is not an identity: two installed plugins may
// choose the same name, while the admitted slug remains the human-readable disambiguator on every host surface.

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

export function pluginCommandAttributedActionLabel(pluginName: string, slug: string, group: string, label: string): string {
  return `${pluginCommandAttribution(pluginName, slug)} · ${group} · ${pluginCommandActionLabel(label)}`;
}
