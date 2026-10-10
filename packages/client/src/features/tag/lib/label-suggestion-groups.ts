// Pure grouping of pending tag suggestions for the label inbox: internal seed tags dropped, near-duplicate
// names merged into one group.

import type { TagSuggestionView } from "@orb/contracts/tag";

/** Tags the default-card seeder stamps on its own card; suggesting them back to the reader is noise. */
export const INTERNAL_SEED_TAG_NAMES: ReadonlySet<string> = new Set(["assistant", "default", "utility"]);

export interface SuggestionGroup {
  /** Normalized name shared by every row in the group. */
  readonly key: string;
  /** The name shown for the group: the most frequent spelling. */
  readonly name: string;
  readonly rows: readonly TagSuggestionView[];
}

/** Case, spacing and punctuation never make a different label: "Slice of Life" and "slice-of-life" are one. */
export function normalizeTagName(name: string): string {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

export function groupSuggestions(suggestions: readonly TagSuggestionView[]): readonly SuggestionGroup[] {
  const byKey = new Map<string, TagSuggestionView[]>();
  for (const suggestion of suggestions) {
    const key = normalizeTagName(suggestion.name);
    if (key === "" || INTERNAL_SEED_TAG_NAMES.has(key)) {
      continue;
    }
    const rows = byKey.get(key);
    if (rows === undefined) {
      byKey.set(key, [suggestion]);
    } else {
      rows.push(suggestion);
    }
  }
  return [...byKey.entries()]
    .map(([key, rows]): SuggestionGroup => ({ key, name: mostFrequentName(rows), rows }))
    .toSorted((a, b) => b.rows.length - a.rows.length || a.name.localeCompare(b.name));
}

function mostFrequentName(rows: readonly TagSuggestionView[]): string {
  const counts = new Map<string, number>();
  for (const row of rows) {
    counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
  }
  let best = rows[0]?.name ?? "";
  let bestCount = 0;
  for (const [name, count] of counts) {
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }
  return best;
}
