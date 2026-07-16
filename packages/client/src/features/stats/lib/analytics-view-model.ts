// Pure view-model helpers for the Analytics (stats domain) surfaces — number/duration formatting and
// the chart-family adapters (raw stats rows → @orb/ui BarListItem / HistogramBucket). Split out here,
// free of React and tRPC, so the non-trivial shaping (duration buckets, hour-of-day aggregation,
// weekday labelling) is unit-testable without a mounted surface. Params are inline structural shapes
// (the FacetChips precedent) so the lib never re-spells a stats contract type.

import type { BarListItem } from "@orb/ui/bar-list";
import type { HistogramBucket } from "@orb/ui/histogram";

/** Sun..Sat, index 0 = Sunday — matches the server's `dayOfWeek` / heatmap row ordering. */
export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MS_PER_SECOND = 1000;
const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const THOUSAND = 1000;
const MILLION = 1_000_000;
const PERCENT = 100;
const SECONDS_PRECISION = 1;
const COMPACT_PRECISION = 1;
const USD_PRECISION = 2;
const HOURS_PER_DAY = 24;
/** Length of the `YYYY-` prefix dropped to leave `MM-DD`. */
const YEAR_PREFIX_LEN = 5;
const EM_DASH = "—";

/** A human duration: `340ms` · `1.2s` · `3m 20s` · `2h 5m`. */
export function formatDurationMs(ms: number): string {
  if (ms < MS_PER_SECOND) {
    return `${Math.round(ms)}ms`;
  }
  if (ms < MS_PER_MINUTE) {
    return `${(ms / MS_PER_SECOND).toFixed(SECONDS_PRECISION)}s`;
  }
  if (ms < MS_PER_HOUR) {
    const minutes = Math.floor(ms / MS_PER_MINUTE);
    const seconds = Math.round((ms % MS_PER_MINUTE) / MS_PER_SECOND);
    return `${minutes}m ${seconds}s`;
  }
  const hours = Math.floor(ms / MS_PER_HOUR);
  const minutes = Math.round((ms % MS_PER_HOUR) / MS_PER_MINUTE);
  return `${hours}h ${minutes}m`;
}

/** A nullable millisecond figure — `—` when the metric has no samples yet. */
export function formatMs(ms: number | null): string {
  return ms === null ? EM_DASH : formatDurationMs(ms);
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

/** A USD figure to cents: `$1.23`. */
export function formatUsd(n: number): string {
  return `$${n.toFixed(USD_PRECISION)}`;
}

/** A 0..1 rate as a whole percent: `0.45` → `45%`. */
export function formatPercent(rate: number): string {
  return `${Math.round(rate * PERCENT)}%`;
}

/** A signed integer delta for a momentum bar-end label: `+5` · `-3` · `0`. */
export function formatSignedDelta(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Rising / falling momentum rows → ranked bars (magnitude of the swing; the label carries the sign). */
export function momentumBarItems(rows: readonly { readonly characterId: string; readonly name: string; readonly delta: number }[]): BarListItem[] {
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

/** The 7×24 heatmap matrix collapsed to a 24-bucket hour-of-day distribution (summed across weekdays). */
export function hourHistogramBuckets(matrix: readonly (readonly number[])[]): HistogramBucket[] {
  return Array.from({ length: HOURS_PER_DAY }, (_unused, hour) => ({
    label: String(hour).padStart(2, "0"),
    count: matrix.reduce((sum, row) => sum + (row[hour] ?? 0), 0),
  }));
}

/** `2026-07-13` → `07-13` for a compact daily-axis label. */
export function formatDayLabel(day: string): string {
  return day.length > YEAR_PREFIX_LEN ? day.slice(YEAR_PREFIX_LEN) : day;
}

/** Daily points → an assistant-turn histogram in date order. */
export function dailyTurnBuckets(points: readonly { readonly day: string; readonly assistantTurns: number }[]): HistogramBucket[] {
  return points.map((point) => ({
    label: formatDayLabel(point.day),
    count: point.assistantTurns,
  }));
}

/** Daily points → an output-token histogram in date order. */
export function dailyTokenBuckets(points: readonly { readonly day: string; readonly tokensOut: number }[]): HistogramBucket[] {
  return points.map((point) => ({
    label: formatDayLabel(point.day),
    count: point.tokensOut,
  }));
}

/** Per-model rows → ranked generation-count bars. */
export function byModelBarItems(rows: readonly { readonly model: string; readonly generations: number }[]): BarListItem[] {
  return rows.map((row) => ({ id: row.model, label: row.model, value: row.generations }));
}

/** Persona-usage rows → ranked message-count bars. */
export function personaBarItems(
  rows: readonly {
    readonly personaId: string;
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
