// buildSettingsSearchEntries — the whole settings index (categories · subcategories · individual settings)
// flattened into one fuzzy-searchable list. Derives from the SettingsPaneRegistry (client-architecture-
// lockdown.md §8) — never a parallel SETTINGS_CATEGORY_IDS-keyed map (G2). The host's cmdk search matches
// over label + keywords and, on a hit, jumps to that pane + subcategory anchor (settings-shell-surface.tsx).

import type { SettingsPaneRegistry } from "#state";

/** One flattened, fuzzy-searchable entry over the whole index. `subId: null` = a category-level hit
 *  (switch pane, no scroll); a non-null `subId` jumps to that subcategory's anchor. `keywords` carries
 *  every human-readable token (the cmdk `value` is the opaque id, so search matches only via keywords). */
export interface SettingsSearchEntry {
  readonly id: string;
  readonly label: string;
  readonly categoryId: string;
  readonly categoryLabel: string;
  readonly subId: string | null;
  readonly keywords: readonly string[];
}

/** Build the whole search index from the registry's definitions (`when`-visible entries only). */
export function buildSettingsSearchEntries(registry: SettingsPaneRegistry, isVisible: (categoryId: string) => boolean): readonly SettingsSearchEntry[] {
  const entries: SettingsSearchEntry[] = [];
  for (const pane of registry.list()) {
    if (!isVisible(pane.id)) {
      continue;
    }
    entries.push({
      id: pane.id,
      label: pane.label,
      categoryId: pane.id,
      categoryLabel: pane.label,
      subId: null,
      keywords: [pane.label, pane.description],
    });
    for (const sub of pane.subcategories ?? []) {
      entries.push({
        id: `${pane.id}::${sub.id}`,
        label: sub.label,
        categoryId: pane.id,
        categoryLabel: pane.label,
        subId: sub.id,
        keywords: [sub.label, ...(sub.keywords ?? []), pane.label],
      });
      for (const setting of sub.settings ?? []) {
        entries.push({
          id: `${pane.id}::${sub.id}::${setting.id}`,
          label: setting.label,
          categoryId: pane.id,
          categoryLabel: pane.label,
          subId: sub.id,
          keywords: [setting.label, ...(setting.keywords ?? []), sub.label, pane.label],
        });
      }
    }
  }
  return entries;
}
