// Host-owned copy for plugin command chrome. A display name is not an identity: two installed plugins may
// choose the same name, while the admitted slug remains the human-readable disambiguator on every host surface.

export function pluginCommandAttribution(pluginName: string, slug: string): string {
  return `${pluginName} (${slug})`;
}

export function pluginCommandActionLabel(label: string): string {
  return `Run ${label}`;
}

export function pluginCommandAttributedActionLabel(pluginName: string, slug: string, group: string, label: string): string {
  return `${pluginCommandAttribution(pluginName, slug)} · ${group} · ${pluginCommandActionLabel(label)}`;
}
