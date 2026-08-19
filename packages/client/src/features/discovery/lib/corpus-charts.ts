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

// ── cluster-label disambiguation ──────────────────────────────────────────────
/** One labelled cluster's inputs: the label k-means produced, and the facets that describe it. File-local
 *  (the exported surface is the function) — a caller passes the shape structurally, as `MapPoint`'s callers do. */
interface LabelledCluster {
  readonly label: string;
  /** Ordered most-distinguishing-first — the first one unique to this cluster wins. */
  readonly facets: readonly string[];
}

/**
 * Make repeated cluster labels tell their clusters apart (side-eye corpus re-pass B6).
 *
 * The archetype labeller names a cluster from its dominant facets, so on a homogeneous library SEVEN of ten
 * bars came back "melancholic slice-of-life" — three bars, three cluster cards and three announcements that
 * a reader (and a screen reader, three times in a row) cannot tell apart, over data that genuinely differs.
 *
 * A repeated label takes the first facet NO other cluster sharing that label carries — the real difference,
 * in the labeller's own vocabulary. When the facets are identical too there is no distinguishing content to
 * borrow, so the ordinal is the honest last resort: it says "these are different groups and we have nothing
 * better to call them", which is true, rather than implying they are the same one. Unique labels are
 * returned untouched — nothing is decorated that was never ambiguous.
 *
 * Pure and order-preserving: index i of the result names cluster i.
 */
export function disambiguateLabels(clusters: readonly LabelledCluster[]): string[] {
  const byLabel = new Map<string, number[]>();
  clusters.forEach((cluster, index) => {
    byLabel.set(cluster.label, [...(byLabel.get(cluster.label) ?? []), index]);
  });

  return clusters.map((cluster, index) => {
    const peers = byLabel.get(cluster.label) ?? [index];
    if (peers.length === 1) {
      return cluster.label;
    }
    const others = new Set(peers.filter((peer) => peer !== index).flatMap((peer) => clusters[peer]?.facets ?? []));
    const distinguishing = cluster.facets.find((facet) => facet !== "" && !others.has(facet));
    if (distinguishing !== undefined) {
      return `${cluster.label} · ${distinguishing}`;
    }
    return `${cluster.label} (${peers.indexOf(index) + 1} of ${peers.length})`;
  });
}

// ── semantic-map genre grouping ───────────────────────────────────────────────
// The N top genres get their own colored series; the rest (+ null/empty) fall into this one.
const OTHER_GENRE_LABEL = "Other";
/**
 * Named genre series, capped so the TOTAL series count (named + "Other") fits the `@orb/ui` chart ramp.
 *
 * FOUR, NOT FIVE (side-eye corpus re-pass B5). The cap was the ramp length itself, which is right only if
 * "Other" is free — it is not: it is a series like any other, so a five-genre corpus produced SIX series and
 * `buildScatterOption`'s `palette[index % length]` wrapped "Other" back onto the top genre's exact colour.
 * Nobody could see it while the plot had no key; the moment the legend below names each colour, two rows
 * would have carried the same swatch and the key would have been the lie. The plot loses its fifth named
 * genre to the pool, which is the honest trade — a colour that means two things is worse than a pool.
 */
const MAX_GENRE_SERIES = 4;

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
