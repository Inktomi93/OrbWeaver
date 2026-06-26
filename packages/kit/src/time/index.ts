import { DateTime } from "luxon";

// THE canonical time representation across the stack: a UTC instant as integer epoch MILLISECONDS.
// Every stored timestamp (`*_at`, `*Date`, gen timing) is epoch-ms; the client renders it in the
// viewer's timezone via `Intl.DateTimeFormat`. All provider + import boundaries normalize to
// epoch-ms HERE — Luxon parses everything as UTC — so no seconds-vs-ms or local-vs-UTC drift can
// leak downstream. Providers mix units: OpenRouter `created` and the Agent SDK rate-limit
// `resetsAt` are epoch SECONDS; our own timestamps are ms; imported corpora are a zoo of formats.

// Values ≥ this are already milliseconds; smaller positive values are epoch seconds. (1e12 ms =
// 2001; no real chat timestamp is before that, and 1e12 s would be year 33658 — unambiguous.)
const MS_THRESHOLD = 1e12;
// Seconds → ms scale factor.
const MS_PER_SECOND = 1000;

/** A numeric epoch that may be in seconds OR ms → ms (heuristic). Use when a provider's unit is
 *  ambiguous/mixed; prefer {@link secondsToMs} when the unit is documented. null for non-finite. */
export function epochToMs(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value >= MS_THRESHOLD ? Math.round(value) : Math.round(value * MS_PER_SECOND);
}

/** A value KNOWN to be epoch seconds → ms. For documented-seconds fields (Agent SDK rate-limit
 *  `resetsAt`, OpenRouter `created`). Passes through undefined so it composes with optional fields. */
export function secondsToMs(seconds: number | null | undefined): number | undefined {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) {
    return;
  }
  return Math.round(seconds * MS_PER_SECOND);
}

/** Parse an ISO-8601 string → epoch ms. A naive (no-offset) ISO string is read as UTC (Luxon's
 *  zone:"utc"), NOT the host's local zone — that determinism is the whole point. null if invalid. */
export function isoToMs(value: string): number | null {
  const dt = DateTime.fromISO(value, { zone: "utc" });
  return dt.isValid ? dt.toMillis() : null;
}

/** Parse a string with an explicit Luxon format token, interpreting it as UTC → epoch ms. */
export function utcFormatToMs(value: string, format: string): number | null {
  const dt = DateTime.fromFormat(value, format, { zone: "utc" });
  return dt.isValid ? dt.toMillis() : null;
}
