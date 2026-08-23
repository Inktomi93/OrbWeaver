// The corpus chart-adoption view-models — pure mappers from discovery's count-shaped read rows into the
// @orb/ui charts family's item shapes, plus the semantic-map genre palette. Kept here (not inline in the
// surfaces) so the count→bar and genre→swatch logic is unit-testable without mounting ECharts or an SVG.
// The charts family was the audit's #1 style ding: count-data must render as bars, not text ListRow/Badge.
//
// ── THE BARS ARE TEAL ON PURPOSE — RATIFIED (owner ruling 2026-08-23, side-eye se-verify-4 N4) ────────
// N4 reads the corpus bars' `rgb(64,177,183)` as a hue the ember surface does not otherwise contain and
// asks for the accent. The owner has ruled the opposite way and the ruling is recorded here rather than
// left open, because this file is where "count-data renders as bars" lives and the hue is the other half
// of that sentence: the categorical chart ramp (`color.chart-2`, reached by `intent="quiet"`) is
// DELIBERATELY not the surface's accent. Ember bars are exactly what produced the finding they replaced —
// a framebuffer census measured 28.69% accent in the corpus overview's worst 800px viewport against the
// §14 physics-4 cap of 10%, essentially all of it one bar list, because `accent` resolves `color.chart-1`
// which IS `color.primary`. A reference chart painted in the "look here" ink spends the whole surface's
// focal budget on its quietest content. Nothing here is carried by hue either way — the bar-end value and
// the chart's label state the reading for a viewer who sees no colour at all (`@orb/ui`'s
// `charts/bar-list/option.ts` carries the census and the ramp-stop argument). No re-inking.

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

/**
 * The top `limit` rows by `value`, plus how many there were — a chart's HEAD and its denominator, together.
 *
 * WHY THE PAIR IS ONE RETURN VALUE (side-eye populated arm 2026-08-23, [P2-3] / [P1-1]). Two charts on the
 * corpus overview drew their whole series: `topKeywords` painted 50 bars in a 1,616px canvas — 45% of the
 * page, 28.69% accent share against a 10% cap, over values running 6 down to 2, where every bar is 72-100%
 * of its track and no bar is distinguishable from its neighbour — and the economics chart's only guard was
 * whether a route had SPENT anything, which on a local-model library reduced 142 routes to one $0.08 bar.
 * A cap alone would just be a quieter lie: the reader has to be told what was left out, and a truncation
 * whose denominator lives somewhere else drifts from it. So the slice and the total travel together, the
 * same way `headlineFor` returns its sentence beside the figures it has spent
 * (`corpus-analysis-state.ts`).
 *
 * SORTED HERE, not assumed: `toBarItems` treats array order as the rank and does not sort, and a caller
 * that hands it a server order which is not the charted quantity is exactly the rank-vs-display defect
 * [P2-2] names. Ties keep their input order (`toSorted` is stable), so a corpus charts identically twice.
 */
export function topRanked<T>(rows: readonly T[], value: (row: T) => number, limit: number): { readonly rows: readonly T[]; readonly total: number } {
  return { rows: rows.toSorted((a, b) => value(b) - value(a)).slice(0, limit), total: rows.length };
}

/** A capped chart's label — `Top keywords · 12 of 50`, or the bare label when nothing was cut. The
 *  denominator rides the chart's own accessible NAME rather than a sentence beside it, because
 *  `LabeledChartFrame` names both the canvas and its screen-reader table with that one string. */
export function chartLabelWithDenominator(label: string, shown: number, total: number, noun: string): string {
  return shown >= total ? label : `${label} · ${shown.toString()} of ${total.toString()} ${noun}`;
}

/**
 * The drawn series' SPREAD, as a clause for the chart's label — `6–4 uses`, or `4 uses each` when flat.
 *
 * WHY A FLAT CHART HAS TO SAY SO (side-eye se-verify-4 N5, and it is a fork the orchestrator ruled on).
 * The keyword chart's twelve bars ran 6 down to 4, so every bar was 67-100% of its track and none was
 * distinguishable from its neighbour. The report's two arms were "widen the window until the range means
 * something" and "demote to a text list". Neither survives contact: the FULL 50-row series is flatter still
 * (6..2), so widening makes it worse, and demoting reverses this file's own founding ruling ("count-data
 * must render as bars, not text ListRow/Badge"). The third reading is that the chart is not lying at all —
 * the axis is zero-based and the distribution really is flat — it just LOOKS like a broken chart, because
 * nothing says how little ground the bars cover. So the spread rides the label, which is also the chart's
 * accessible name (`LabeledChartFrame`), and a reader learns in one string what the picture cannot show.
 * The ruling survives; what changed is that a chart now states the range it was drawn over.
 *
 * Empty input yields the bare label's own emptiness (`""`) — the caller renders no chart for no rows.
 */
export function chartSpread(values: readonly number[], noun: string): string {
  if (values.length === 0) {
    return "";
  }
  const top = Math.max(...values);
  const bottom = Math.min(...values);
  return top === bottom ? `${top.toString()} ${noun} each` : `${top.toString()}–${bottom.toString()} ${noun}`;
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
