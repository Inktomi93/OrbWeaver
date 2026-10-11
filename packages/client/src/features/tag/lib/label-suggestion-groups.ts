// Pure grouping of pending tag suggestions for the label inbox: internal seed tags dropped, near-duplicate
// names merged into one group.

import type { TagSuggestionView } from "@orb/contracts/tag";
import { isInternalSeedTagName } from "@orb/contracts/tag";
import { tagMatchKey } from "@orb/kit/tag";

export interface SuggestionGroup {
  /** Normalized name shared by every row in the group. */
  readonly key: string;
  /** The name shown for the group: the most frequent spelling. */
  readonly name: string;
  readonly rows: readonly TagSuggestionView[];
}

export function groupSuggestions(suggestions: readonly TagSuggestionView[]): readonly SuggestionGroup[] {
  const byKey = new Map<string, TagSuggestionView[]>();
  for (const suggestion of suggestions) {
    const key = tagMatchKey(suggestion.name);
    if (key === "" || isInternalSeedTagName(key)) {
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
