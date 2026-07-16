// The corpus chart-adoption view-models — pure mappers from discovery's count-shaped read rows into the
// @orb/ui charts family's item shapes, plus the semantic-map genre palette. Kept here (not inline in the
// surfaces) so the count→bar and genre→swatch logic is unit-testable without mounting ECharts or an SVG.
// The charts family was the audit's #1 style ding: count-data must render as bars, not text ListRow/Badge.

import type { BarListItem } from "@orb/ui/bar-list";
import type { ScatterPoint, ScatterSeries } from "@orb/ui/scatter";

/** Map any labelled-count rows into pre-ranked BarList items (array order IS the rank — callers pre-sort). */
export function toBarItems<T>(rows: readonly T[], label: (row: T) => string, value: (row: T) => number): BarListItem[] {
  return rows.map((row, index) => ({
    // The label is human-facing and may repeat across rows; the index keeps the React/ECharts key unique.
    id: `${index}-${label(row)}`,
    label: label(row),
    value: value(row),
  }));
}

// ── semantic-map genre grouping ───────────────────────────────────────────────
// The N top genres get their own colored series; the rest (+ null/empty) fall into this one.
const OTHER_GENRE_LABEL = "Other";
// Cap named genre series to the `@orb/ui` chart ramp (5 stops) so <Scatter>'s per-series color never wraps.
const MAX_GENRE_SERIES = 5;

/** A card's map point — the caller's row shaped for `<Scatter>` (id echoed back on click). */
interface MapPoint extends ScatterPoint {
  readonly genre: string | null;
}

/** Group projected map points into `<Scatter>` series by genre — the top genres by frequency each get a
 *  named series (colored by ui's chart ramp in this order), the rest collapse into one "Other" series.
 *  Deterministic: ties break on first-seen order, so the same corpus always groups identically. Genres
 *  with no members after the cap contribute nothing; an all-"Other" corpus yields a single series. */
export function toGenreSeries(points: readonly MapPoint[]): ScatterSeries[] {
  const counts = new Map<string, { count: number; firstSeen: number }>();
  let seen = 0;
  for (const point of points) {
    const genre = point.genre;
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

  const topGenres = [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count || a[1].firstSeen - b[1].firstSeen)
    .slice(0, MAX_GENRE_SERIES)
    .map(([genre]) => genre);
  const topSet = new Set(topGenres);

  const bucket = new Map<string, ScatterPoint[]>(topGenres.map((genre) => [genre, []]));
  const other: ScatterPoint[] = [];
  for (const point of points) {
    const plain: ScatterPoint = { id: point.id, label: point.label, x: point.x, y: point.y };
    const target = point.genre !== null && point.genre !== "" && topSet.has(point.genre) ? bucket.get(point.genre) : other;
    (target ?? other).push(plain);
  }

  const series: ScatterSeries[] = topGenres.map((genre) => ({ name: genre, points: bucket.get(genre) ?? [] }));
  if (other.length > 0) {
    series.push({ name: OTHER_GENRE_LABEL, points: other });
  }
  return series;
}
