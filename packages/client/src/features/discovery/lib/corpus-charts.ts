// The corpus chart-adoption view-models — pure mappers from discovery's count-shaped read rows into the
// @orb/ui charts family's item shapes, plus the semantic-map genre palette. Kept here (not inline in the
// surfaces) so the count→bar and genre→swatch logic is unit-testable without mounting ECharts or an SVG.
// The charts family was the audit's #1 style ding: count-data must render as bars, not text ListRow/Badge.

import type { BarListItem } from "@orb/ui/bar-list";

/** Map any labelled-count rows into pre-ranked BarList items (array order IS the rank — callers pre-sort). */
export function toBarItems<T>(
  rows: readonly T[],
  label: (row: T) => string,
  value: (row: T) => number,
): BarListItem[] {
  return rows.map((row, index) => ({
    // The label is human-facing and may repeat across rows; the index keeps the React/ECharts key unique.
    id: `${index}-${label(row)}`,
    label: label(row),
    value: value(row),
  }));
}

// ── semantic-map genre palette ────────────────────────────────────────────────
/** The token `fill` refs the map colors genres with — set on the SVG `fill` ATTRIBUTE (a token reference,
 *  never a className/style: features may not className raw SVG, so `fill="var(--color-*)"` is the one
 *  belt-clean channel). The N most-common genres claim a fill in frequency order; the rest (+ null) go muted. */
export const GENRE_FILLS = [
  "var(--color-primary)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-destructive)",
] as const;
export const GENRE_FILL_MUTED = "var(--color-muted-foreground)";

/** One legend entry — a genre value paired with the token fill its points render in. */
interface GenreSwatch {
  readonly genre: string;
  readonly fill: string;
}

/** The map's genre coloring — a stable legend (top genres by frequency) + a resolver for any point's fill.
 *  Deterministic: ties break on first-seen order, so the same corpus always paints identically. */
export interface GenrePalette {
  readonly legend: readonly GenreSwatch[];
  readonly fillFor: (genre: string | null) => string;
}

export function assignGenreColors(genres: readonly (string | null)[]): GenrePalette {
  const counts = new Map<string, { count: number; firstSeen: number }>();
  let seen = 0;
  for (const genre of genres) {
    if (genre === null || genre === "") {
      continue;
    }
    const prior = counts.get(genre);
    if (prior === undefined) {
      counts.set(genre, { count: 1, firstSeen: seen });
      seen += 1;
    } else {
      prior.count += 1;
    }
  }

  const ranked = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].firstSeen - b[1].firstSeen)
    .slice(0, GENRE_FILLS.length);

  const byGenre = new Map<string, string>(
    ranked.map(([genre], index) => [genre, GENRE_FILLS[index] ?? GENRE_FILL_MUTED]),
  );

  return {
    legend: ranked.map(([genre], index) => ({
      genre,
      fill: GENRE_FILLS[index] ?? GENRE_FILL_MUTED,
    })),
    fillFor: (genre): string =>
      genre === null ? GENRE_FILL_MUTED : (byGenre.get(genre) ?? GENRE_FILL_MUTED),
  };
}
