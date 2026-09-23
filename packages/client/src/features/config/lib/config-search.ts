// The Settings search INDEX (#866 S2) — the whole workspace flattened
// into one fuzzy-searchable list, derived from the registries and NEVER a parallel map (G2): for every
// `when`-visible group → its row (label · description); for every contributed section → its row (label ·
// navLabel · keywords · the group label); for every `settings` leaf → its row. Each entry carries the
// `(shelf, groupId, subId, settingId)` address the jump and the typed `@` filters read. DYNAMIC rows (a
// collection's members, the persona names) stay a HOOK per group (`ConfigGroupBase.useSearchRows`) rendered
// in its own fiber by the results list — they are deliberately NOT in this static half.
//
// The FILTER half (`filterConfigEntries`) is pure over a parsed query + the derived modified map, so the
// token semantics are unit-testable without a browser: `@shelf:`/`@in:` narrow by address, `@ext:` narrows
// to the plugins group and searches the slug, `@advanced` FLIPS the advanced axis (advanced rows are hidden
// by default — the D107 progressive-disclosure arm), `@modified` keeps only entries that differ from their
// defaults AT THEIR OWN GRAIN — a leaf answers for its own key, never for its section's (#1099 F16)
// (`use-modified-sections.ts` derives both grains; this file only consumes them).

import type { ConfigGroupDefinition, ConfigGroupId, ConfigGroupRegistry, ConfigModifiedMap, ConfigShelf, ConfigSubcategory } from "#state";

/** One flattened, fuzzy-searchable entry. `subId: null` = a group-level hit (open the group, no scroll);
 *  a non-null `subId` jumps to that section's anchor; a `settingId` additionally names the leaf. */
export interface ConfigSearchEntry {
  readonly id: string;
  readonly kind: "group" | "section" | "setting";
  readonly label: string;
  readonly shelf: ConfigShelf;
  readonly groupId: ConfigGroupId;
  readonly groupLabel: string;
  readonly subId: string | null;
  readonly settingId: string | null;
  /** Hidden by default; surfaced only under `@advanced` (§3.3). */
  readonly advanced: boolean;
  /** Every human-readable token — label + navLabel + keywords + the group label. */
  readonly keywords: readonly string[];
}

function groupEntry(group: ConfigGroupDefinition): ConfigSearchEntry {
  return {
    id: group.id,
    kind: "group",
    label: group.label,
    shelf: group.shelf,
    groupId: group.id,
    groupLabel: group.label,
    subId: null,
    settingId: null,
    advanced: false,
    keywords: [group.label, group.description],
  };
}

function sectionEntries(group: ConfigGroupDefinition, sub: ConfigSubcategory): ConfigSearchEntry[] {
  const section: ConfigSearchEntry = {
    id: `${group.id}::${sub.id}`,
    kind: "section",
    label: sub.label,
    shelf: group.shelf,
    groupId: group.id,
    groupLabel: group.label,
    subId: sub.id,
    settingId: null,
    advanced: false,
    // BOTH names: the hit READS as the full `label` (it lands on that heading), but a reader who typed the
    // abbreviation they saw in the LIST row must find it too — an abbreviation that hides its own section
    // from search would be worse than the truncation it replaced.
    keywords: [sub.label, ...(sub.navLabel === undefined ? [] : [sub.navLabel]), ...(sub.keywords ?? []), group.label],
  };
  const leaves = (sub.settings ?? []).map(
    (setting): ConfigSearchEntry => ({
      id: `${group.id}::${sub.id}::${setting.id}`,
      kind: "setting",
      label: setting.label,
      shelf: group.shelf,
      groupId: group.id,
      groupLabel: group.label,
      subId: sub.id,
      settingId: setting.id,
      advanced: setting.advanced ?? false,
      keywords: [setting.label, ...(setting.keywords ?? []), sub.label, group.label],
    }),
  );
  return [section, ...leaves];
}

/** Build the whole STATIC index from the registry's visible groups (`when` gates nav, search and render
 *  TOGETHER — SET-SEAMS §7.3 — so search sees exactly what the LIST shows, or a hit scrolls to nothing).
 *  `subcategoriesFor` is the ONE nav derivation (`useConfigSubcategories` — the sections contributed at the
 *  group's anchor, §6.8). */
export function buildConfigSearchEntries(
  registry: ConfigGroupRegistry,
  isVisible: (groupId: ConfigGroupId) => boolean,
  subcategoriesFor: (group: ConfigGroupDefinition) => readonly ConfigSubcategory[],
): readonly ConfigSearchEntry[] {
  const entries: ConfigSearchEntry[] = [];
  for (const group of registry.list()) {
    if (!isVisible(group.id)) {
      continue;
    }
    entries.push(groupEntry(group));
    for (const sub of subcategoriesFor(group)) {
      entries.push(...sectionEntries(group, sub));
    }
  }
  return entries;
}

/** The typed-token narrowing the parser feeds (pure — the fuzzy TERM match runs after this). */
export interface ConfigEntryFilter {
  readonly modified: boolean;
  readonly advanced: boolean;
  readonly shelf?: string;
  readonly group?: string;
  readonly ext?: string;
}

/** THE VERDICT IS READ AT THE ENTRY'S OWN GRAIN (#1099 F16). A LEAF answers for ITSELF — the section grain
 *  used to answer for it, so `@modified` returned every sibling of a changed setting and three of five rows
 *  were unmodified. A section answers for its own sub; a group-level hit for any of its sections. Exported
 *  because the results list marks every row it renders with the SAME verdict the filter applies. */
export function isConfigEntryModified(entry: ConfigSearchEntry, modified: ConfigModifiedMap): boolean {
  if (entry.settingId !== null) {
    return modified.settings.has(entry.id);
  }
  const subs = modified.subs.get(entry.groupId);
  if (subs === undefined || subs.size === 0) {
    return false;
  }
  return entry.subId === null ? true : subs.has(entry.subId);
}

/** Apply the `@` filters. `@advanced` FLIPS the axis (hidden by default, only-advanced when asked — the
 *  VS Code `@tag:advanced` posture); an unknown `@shelf:`/`@in:` value matches nothing, which is honest. */
export function filterConfigEntries(
  entries: readonly ConfigSearchEntry[],
  filter: ConfigEntryFilter,
  modified: ConfigModifiedMap,
): readonly ConfigSearchEntry[] {
  return entries.filter((entry) => {
    if (entry.advanced !== filter.advanced) {
      return false;
    }
    if (filter.shelf !== undefined && entry.shelf !== filter.shelf) {
      return false;
    }
    if (filter.group !== undefined && entry.groupId.toLowerCase() !== filter.group.toLowerCase()) {
      return false;
    }
    if (filter.ext !== undefined && entry.groupId !== "plugins") {
      return false;
    }
    if (filter.modified && !isConfigEntryModified(entry, modified)) {
      return false;
    }
    return true;
  });
}
