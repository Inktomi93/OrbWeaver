// Pure view-model helpers for the Analytics (stats domain) surfaces — number/duration formatting and
// the chart-family adapters (raw stats rows → @orb/ui BarListItem / HistogramBucket). Split out here,
// free of React and tRPC, so the non-trivial shaping (duration buckets, hour-of-day aggregation,
// weekday labelling) is unit-testable without a mounted surface. Params are inline structural shapes
// (the FacetChips precedent) so the lib never re-spells a stats contract type.
//
// THE NULLABLE FAMILY IS THE HONESTY SEAM (side-eye rail-analytics 2026-08-19). `null` off a stats verb
// means UNRECORDED, never zero (server `substrate/rates.ts`), and every formatter here that can receive
// one renders the em dash — the shape `formatMs` has always had, extended to counts, costs and rates.
// @orb/ui takes PRE-FORMATTED strings by design ("no Intl/number logic in ui"), so the provenance
// decision cannot live in `StatFigure`; it lives in the data and dies here, one layer below the tile.
// A `?? 0` on the way into one of these is the exact defect the seam exists to stop.

import type { TokenProvenance } from "@orb/contracts/chat";
import { combineTokenProvenance } from "@orb/contracts/chat";
import type { CharacterId, PersonaId } from "@orb/kit/ids";
import type { TimeLib } from "@orb/kit/time";
import type { BarListItem } from "@orb/ui/bar-list";
import type { HeatmapMatrix } from "@orb/ui/heatmap";
import type { HistogramBucket } from "@orb/ui/histogram";

/** Sun..Sat, index 0 = Sunday — matches the server's `dayOfWeek` / heatmap row ordering.
 *
 */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** The leaderboard sort axes — ids MIRROR the server `LEADERBOARD_SORTS` tuple
 * (domain/stats/contract/params), the wire enum `leaderboard.sort` validates against; labels are the
 * client-facing names. One home for both the LIST surface's toggle and the header's shared-cache count key. */
export const ANALYTICS_SORT_OPTIONS = [
  { id: "assistantTurns", label: "Replies" },
  { id: "totalGenTimeMs", label: "Time" },
  { id: "swipes", label: "Swipes" },
  { id: "lastActivityAt", label: "Recent" },
] as const;

/** The default leaderboard sort — the count header shares this cache key with the list surface's initial
 * query, so the band count never triggers an extra fetch. (The sort-id UNION is derived locally at each
 * consumer via `(typeof ANALYTICS_SORT_OPTIONS)[number]["id"]` — a non-exported alias, per no-inline-types:
 * an exported type alias belongs in a contract home, but this list-only vocabulary has no cross-boundary
 * consumer.) */
export const ANALYTICS_DEFAULT_SORT = "assistantTurns" as const;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const SECONDS_PER_MINUTE = 60;
const MINUTES_PER_HOUR = 60;
const THOUSAND = 1000;
const MILLION = 1_000_000;
const PERCENT = 100;
const SECONDS_PRECISION = 1;
const COMPACT_PRECISION = 1;
const HOURS_PER_DAY = 24;
/** How many trailing id characters a duplicate-name disambiguator shows. */
const SHORT_REF_LEN = 4;
/** `YYYY` is the first four characters of a `YYYY-MM-DD` calendar day. */
const YEAR_KEY_LENGTH = 4;
const EM_DASH = "—";

/** Shared legend for absent accounting and estimates; missing totals are not measured zeros. */
export const UNRECORDED_NOTE =
  "A dash means unavailable or not applicable. ~ marks estimates. Token totals omit missing usage. Mixing available subscription-notional and API prices makes the cost subtotal unavailable.";

/** Imported transcript activity can be rebuilt; missing provider telemetry cannot. */
export const IMPORTED_ACTIVITY_NOTE =
  "Imported transcripts can appear in Explore before Insights has a rollup. Recompute includes retained chat activity, but imports may not contain tokens, generation time or provider cost; missing telemetry is not zero.";

export const REASONING_LABEL = "Reasoning (of replies + swipes)";
export const THROUGHPUT_LABEL = "Speed (tokens per second)";

/** The latency figures, named in plain words; they sit under Details on both stats surfaces. */
export const LATENCY_LABELS = {
  avgGen: "Average reply time",
  p50Gen: "Median reply time",
  p90Gen: "Slowest 10% of replies",
  avgTtft: "Average wait for the first word",
  p50Ttft: "Median wait for the first word",
  p90Ttft: "Slowest 10% of waits",
} as const;

const ACCOUNTING_ORIGINS = { measured: "Recorded", estimated: "Estimated", unrecorded: "Not recorded" } satisfies Record<TokenProvenance, string>;

/** Accounting labels name token/time provenance, not the origin of a dollar amount. */
export function formatAccountingLabel(label: string, value: number | null, provenance?: TokenProvenance): string {
  const origin = value === null ? "unrecorded" : (provenance ?? "measured");
  return `${label} · ${ACCOUNTING_ORIGINS[origin]}`;
}

/** Dollar presence cannot distinguish a reported price, configured estimate or subscription notional. */
export function formatCostLabel(value: number | null): string {
  return value === null ? "Cost · Unavailable" : "Cost";
}

/** A human duration: `340ms` · `1.2s` · `3m 20s` · `2h 5m`. Rounding at a unit boundary CARRIES into the
 *  next unit — a value that rounds to 60s reads `1m 0s`, not `60.0s`; 60s-of-remainder reads `Nm+1 0s`, not
 *  `Nm 60s`; 60m-of-remainder reads `Nh+1 0m`. Each tier rounds to its own precision first, then promotes
 *  when the rounded component reaches the next unit, so no out-of-range component is ever printed. */
export function formatDurationMs(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < MS_PER_MINUTE) {
    const seconds = Number((ms / MS_PER_SECOND).toFixed(SECONDS_PRECISION));
    // A value like 59_999 rounds to 60.0s — fall through to the m/s tier so it reads `1m 0s`.
    if (seconds < SECONDS_PER_MINUTE) {
      return `${seconds.toFixed(SECONDS_PRECISION)}s`;
    }
  }
  if (ms < MS_PER_HOUR) {
    // Round to whole seconds ONCE, then split — a remainder rounding to 60s carries a whole minute.
    const totalSeconds = Math.round(ms / MS_PER_SECOND);
    const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
    const seconds = totalSeconds % SECONDS_PER_MINUTE;
    // A remainder rounding to 60m (e.g. 3_599_999) carries a whole hour — fall through to the h/m tier.
    if (minutes < MINUTES_PER_HOUR) {
      return `${minutes}m ${seconds}s`;
    }
  }
  // Round to whole minutes ONCE, then split — a remainder rounding to 60m carries a whole hour.
  const totalMinutes = Math.round(ms / MS_PER_MINUTE);
  const hours = Math.floor(totalMinutes / MINUTES_PER_HOUR);
  const minutes = totalMinutes % MINUTES_PER_HOUR;
  return `${hours}h ${minutes}m`;
}

/** A nullable millisecond figure — `—` when the metric has no samples yet. */
export function formatMs(ms: number | null): string {
  return ms === null ? EM_DASH : formatDurationMs(ms);
}

/** A compact count with its noun, singular at exactly one: `1 reply` · `842 replies` · `1.2k replies`. */
export function formatCompactNoun(n: number, one: string, many: string): string {
  return `${formatCompact(n)} ${n === 1 ? one : many}`;
}

/** Compact count: `842` · `1.2k` · `3.4M` (trailing `.0` trimmed). */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < THOUSAND) {
    return String(Math.round(n));
  }
  if (abs < MILLION) {
    return trimZero((n / THOUSAND).toFixed(COMPACT_PRECISION), "k");
  }
  return trimZero((n / MILLION).toFixed(COMPACT_PRECISION), "M");
}

function trimZero(fixed: string, suffix: string): string {
  return `${fixed.endsWith(".0") ? fixed.slice(0, -2) : fixed}${suffix}`;
}

/** A ratio with one decimal: `1.4` · `0` (trailing `.0` trimmed). */
export function formatDecimal(n: number): string {
  return trimZero(n.toFixed(COMPACT_PRECISION), "");
}

/** A nullable count — `—` when the metric was never recorded (an ST-imported or agent-sdk rollup carries
 *  no token accounting at all, and a `0 tok` there asserts a measurement that never happened). */
export function formatCount(n: number | null, provenance?: TokenProvenance): string {
  if (n === null || provenance === "unrecorded") {
    return EM_DASH;
  }
  return `${provenance === "estimated" ? "~" : ""}${formatCompact(n)}`;
}

/** A token count WITH its unit, or a bare `—` — the trailing-meta form the dense rows use. The unit rides
 *  inside so an unrecorded row reads `—` and not the nonsense `— tok`. */
export function formatTokens(n: number | null, provenance: TokenProvenance): string {
  if (n === null || provenance === "unrecorded") {
    return EM_DASH;
  }
  return `${provenance === "estimated" ? "~" : ""}${formatCompact(n)} tok`;
}

/** A 0..1 rate as a whole percent: `0.45` → `45%`; `—` when the rate has no measurement behind it, and
 *  `<1%` for a real-but-tiny rate that would otherwise round to the `0%` that reads as "never". */
export function formatPercent(rate: number | null, provenance?: TokenProvenance): string {
  if (rate === null || provenance === "unrecorded") {
    return EM_DASH;
  }
  const whole = Math.round(rate * PERCENT);
  const value = whole === 0 && rate > 0 ? "<1%" : `${whole}%`;
  return provenance === "estimated" ? `~${value}` : value;
}

/** Throughput's own provenance. It divides output tokens by recorded generation time, so with no recorded
 *  time there is no measurement: the server's `0` there is a division guard. */
export function throughputProvenance(totalGenTimeMs: number, tokensOutProvenance: TokenProvenance): TokenProvenance {
  return totalGenTimeMs > 0 ? tokensOutProvenance : "unrecorded";
}

/** Token-derived throughput with the same provenance spelling as the total it divides. */
export function formatThroughput(rate: number | null, provenance: TokenProvenance): string {
  if (rate === null || provenance === "unrecorded") {
    return EM_DASH;
  }
  return `${provenance === "estimated" ? "~" : ""}${rate.toFixed(1)} t/s`;
}

/** Dominant origin for a series whose chart uses one shared value formatter. */
export function seriesTokenProvenance(points: readonly { readonly tokensOutProvenance: TokenProvenance }[]): TokenProvenance {
  return points.reduce<TokenProvenance>((combined, point) => combineTokenProvenance(combined, point.tokensOutProvenance), "unrecorded");
}

/** A signed integer delta for a momentum bar-end label: `+5` · `-3` · `0`. */
export function formatSignedDelta(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Rising / falling momentum rows → ranked bars (magnitude of the swing; the label carries the sign). */
export function momentumBarItems(rows: readonly { readonly characterId: CharacterId; readonly name: string; readonly delta: number }[]): BarListItem[] {
  return rows.map((row) => ({
    id: row.characterId,
    label: row.name,
    value: Math.abs(row.delta),
  }));
}

/** The 7-slot weekday activity vector → labelled bars, Sun..Sat in calendar order. */
export function weekdayBarItems(dayOfWeek: readonly number[]): BarListItem[] {
  return WEEKDAY_LABELS.map((label, index) => ({
    id: label,
    label,
    value: dayOfWeek[index] ?? 0,
  }));
}

/** The server's 7×24 activity matrix → a `<Heatmap>` matrix: weekday rows (Sun..Sat), hour columns
 * (`00`..`23`). Rows come straight from `dayOfWeek` order; cols are the two-digit hour labels. */
export function activityHeatmapMatrix(matrix: readonly (readonly number[])[]): HeatmapMatrix {
  return {
    rows: [...WEEKDAY_LABELS],
    cols: Array.from({ length: HOURS_PER_DAY }, (_unused, hour) => String(hour).padStart(2, "0")),
    values: WEEKDAY_LABELS.map((_label, dayIndex) => Array.from({ length: HOURS_PER_DAY }, (_hour, hour) => matrix[dayIndex]?.[hour] ?? 0)),
  };
}

/** The time seam's two day forms a daily axis label picks between. */
type DayLabelFormat = Pick<TimeLib, "formatDate" | "formatMonthDay">;

/** A viewer-local day as an axis label through the time seam: `Jul 13`, EXCEPT the first bucket of a year,
 *  which keeps its year (`Jan 4, 2027`) — a ~1,100-day axis otherwise wraps `Nov 22 → Jan 24` with no mark
 *  that a year turned over. `day` is the local `YYYY-MM-DD` key and `start` an instant on it; `prevDay` is
 *  the preceding point's key in series order, and its absence (the first bucket) counts as a crossing.
 * @public Test-anchored module surface; focused tests pin this production-local behavior.
 */
export function formatDayLabel(point: { readonly day: string; readonly start: number }, prevDay: string | undefined, format: DayLabelFormat): string {
  const crossesYear = prevDay === undefined || point.day.slice(0, YEAR_KEY_LENGTH) !== prevDay.slice(0, YEAR_KEY_LENGTH);
  return crossesYear ? format.formatDate(point.start) : format.formatMonthDay(point.start);
}

/** Daily points → an assistant-turn histogram in date order. */
export function dailyTurnBuckets(
  points: readonly { readonly day: string; readonly start: number; readonly assistantTurns: number }[],
  format: DayLabelFormat,
): HistogramBucket[] {
  return points.map((point, index) => ({
    label: formatDayLabel(point, points[index - 1]?.day, format),
    count: point.assistantTurns,
  }));
}

/** Daily points with recorded output usage → an output-token histogram in date order. Unrecorded days are
 *  omitted: a zero-height bar would turn missing accounting into a measured zero. */
export function dailyTokenBuckets(
  points: readonly { readonly day: string; readonly start: number; readonly tokensOut: number | null; readonly tokensOutProvenance: TokenProvenance }[],
  format: DayLabelFormat,
): HistogramBucket[] {
  const recorded = points.filter(
    (point): point is { readonly day: string; readonly start: number; readonly tokensOut: number; readonly tokensOutProvenance: TokenProvenance } =>
      point.tokensOut !== null && point.tokensOutProvenance !== "unrecorded",
  );
  return recorded.map((point, index) => ({
    label: formatDayLabel(point, recorded[index - 1]?.day, format),
    count: point.tokensOut,
  }));
}

/** Display names for a leaderboard page, keyed by character id: a name shared by two or more characters
 *  gets a stable short id ref appended (`Tamsin (#k3f9)`), everyone else is untouched. Two identically
 *  named characters were indistinguishable in the row, in its accessible name, and in the crown callout —
 *  so "your top character" and "the falling one" could not be told apart. The ref is the ID's tail rather
 *  than an ordinal because an ordinal changes under every sort. */
export function disambiguatedNames(rows: readonly { readonly characterId: CharacterId; readonly name: string }[]): Record<string, string> {
  const seen: Record<string, number> = {};
  for (const row of rows) {
    seen[row.name] = (seen[row.name] ?? 0) + 1;
  }
  const out: Record<string, string> = {};
  for (const row of rows) {
    out[row.characterId] = (seen[row.name] ?? 0) > 1 ? `${row.name} (#${row.characterId.slice(-SHORT_REF_LEN)})` : row.name;
  }
  return out;
}

/** Per-model rows → ranked generation-count bars. */
export function byModelBarItems(rows: readonly { readonly model: string; readonly generations: number }[]): BarListItem[] {
  return rows.map((row) => ({ id: row.model, label: row.model, value: row.generations }));
}

/** Persona-usage rows → ranked message-count bars. */
export function personaBarItems(
  rows: readonly {
    readonly personaId: PersonaId;
    readonly name: string;
    readonly messageCount: number;
  }[],
): BarListItem[] {
  return rows.map((row) => ({ id: row.personaId, label: row.name, value: row.messageCount }));
}

/** The heatmap peak cell as a `Tue 21:00` label, or `null` when there's no activity. */
export function formatPeak(peak: { readonly dayOfWeek: number; readonly hour: number } | null): string | null {
  if (peak === null) {
    return null;
  }
  return `${WEEKDAY_LABELS[peak.dayOfWeek] ?? "?"} ${String(peak.hour).padStart(2, "0")}:00`;
}
