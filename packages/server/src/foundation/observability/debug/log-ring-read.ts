// How to READ one serialized line out of `logger.ts`'s pino ring — the parse and the severity, in one home.
// Extracted from `routes.ts` when the bug-report capture (#1095) became a second reader of the same ring: two
// copies of the severity read is exactly the doubling that produced the bug documented in `recordLevel` below,
// and a second copy could reintroduce it in the half nobody was looking at.

const LOG_LEVEL_VALUES: Record<string, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

/** pino's numeric level for "error" — the floor `/api/_debug/errors` and the bug-report capture both use. */
export const ERROR_LEVEL = 50;

/** A level NAME's numeric severity; an unknown or absent name is 0 (i.e. never filtered out by a `>=` floor). */
export function levelValue(name: string | undefined): number {
  return name === undefined ? 0 : (LOG_LEVEL_VALUES[name] ?? 0);
}

/**
 * The numeric severity of ONE ring line — and the fix for a total, silent blindness in both readers of it.
 *
 * `logger.ts` configures `formatters: { level: (label) => ({ level: label }) }` so every serialized line
 * carries `"level":"error"`, the STRING LABEL, not pino's numeric 50. Both filters used to do
 * `Number(record["level"] ?? 0)`, and `Number("error")` is **NaN** — every comparison against NaN is false.
 * The consequences ran in opposite directions and only one of them was visible:
 *   • the error collector (`NaN >= 50` → false) returned `[]` for EVERY input. `/api/_debug/errors` was
 *     structurally incapable of ever reporting an error, which is how a live turn produced an ERROR-level
 *     `provider.error` line, an HTTP 500, and a blank panel (docs/design/streaming-shape-churn.md §7.5).
 *   • the log collector (`NaN < minLevel` → false) excluded NOTHING, so `?level=` silently returned every line
 *     and read as a working filter.
 * The ring WRITE was never the problem — pino's multistream fed it correctly the whole time.
 *
 * Reads BOTH spellings on purpose: the label is what our formatter emits, and the number is what pino emits
 * by default — so this stays correct if the formatter is ever removed, rather than swapping which half of
 * the bug is live.
 */
export function ringLineLevel(record: Record<string, unknown>): number {
  const raw = record["level"];
  if (typeof raw === "number") {
    return raw;
  }
  return typeof raw === "string" ? levelValue(raw) : 0;
}

/** Parse ONE serialized ring line. `null` ⇒ skip it (a non-JSON or non-object line). */
export function parseLogRingLine(line: string): Record<string, unknown> | null {
  // @orb-waive caught-failure-ownership(catch): null is consumed by every caller as "skip this
  // ring line". Ends if a caller stops filtering out the null.
  try {
    const value: unknown = JSON.parse(line);
    return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** The wall-clock a ring line was written at — pino's `time` (epoch ms), `0` when the line carries none (which
 *  sorts it before every window and is therefore filtered OUT of a windowed read rather than smuggled in). */
export function ringLineTime(record: Record<string, unknown>): number {
  const raw = record["time"];
  return typeof raw === "number" ? raw : 0;
}
