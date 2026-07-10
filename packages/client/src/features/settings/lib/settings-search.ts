// SETTINGS_SEARCH_ENTRIES — the whole settings index (categories · subcategories · individual settings)
// flattened into one fuzzy-searchable list, split out of settings-nav.ts (UI-Arch §2.1 component-size gate).
// Built once at module load from the registry; the shell's cmdk search matches over label + keywords and,
// on a hit, JUMPS to that pane + subcategory anchor (settings-shell-surface.tsx). The registry (settings-
// nav.ts) stays the ONE home for the geography; this is a pure derivation of it.

import { SETTINGS_CATEGORIES, SETTINGS_CATEGORY_IDS } from "./settings-nav";

/** One flattened, fuzzy-searchable entry over the whole index. `subId: null` = a category-level hit
 *  (switch pane, no scroll); a non-null `subId` jumps to that subcategory's anchor. `keywords` carries
 *  every human-readable token (the cmdk `value` is the opaque id, so search matches only via keywords). */
export interface SettingsSearchEntry {
  readonly id: string;
  readonly label: string;
  readonly categoryId: (typeof SETTINGS_CATEGORY_IDS)[number];
  readonly categoryLabel: string;
  readonly subId: string | null;
  readonly keywords: readonly string[];
}

function buildSettingsSearchEntries(): readonly SettingsSearchEntry[] {
  const entries: SettingsSearchEntry[] = [];
  for (const categoryId of SETTINGS_CATEGORY_IDS) {
    const category = SETTINGS_CATEGORIES[categoryId];
    entries.push({
      id: categoryId,
      label: category.label,
      categoryId,
      categoryLabel: category.label,
      subId: null,
      keywords: [category.label, category.description],
    });
    for (const sub of category.subcategories ?? []) {
      entries.push({
        id: `${categoryId}::${sub.id}`,
        label: sub.label,
        categoryId,
        categoryLabel: category.label,
        subId: sub.id,
        keywords: [sub.label, ...(sub.keywords ?? []), category.label],
      });
      for (const setting of sub.settings ?? []) {
        entries.push({
          id: `${categoryId}::${sub.id}::${setting.id}`,
          label: setting.label,
          categoryId,
          categoryLabel: category.label,
          subId: sub.id,
          keywords: [setting.label, ...(setting.keywords ?? []), sub.label, category.label],
        });
      }
    }
  }
  return entries;
}

/** The whole index flattened for fuzzy search-to-anchor (built once at module load). */
export const SETTINGS_SEARCH_ENTRIES: readonly SettingsSearchEntry[] = buildSettingsSearchEntries();
