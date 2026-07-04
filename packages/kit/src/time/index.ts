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

// ─── The DISPLAY half (the client edge) ────────────────────────────────────────────────────────────
// Localization happens exactly ONCE, at the display edge, through this factory (UI-Gates §11.5 —
// the timezone pipeline): the wire stays epoch-ms UTC; the viewer's locale/timezone applies here and
// nowhere else. `now` is INJECTED (client-determinism — relative-time is snapshot-testable); this
// module is the raw-`Intl`/ambient-clock exemption zone (no-raw-intl-time / no-raw-clock), so the
// ambient defaults below are the sanctioned single site of both.

/** Injectable formatter config — production omits everything (browser locale/tz, real clock);
 *  tests pin all three for deterministic output across ICU builds. */
export interface TimeLibConfig {
  readonly now?: () => number;
  readonly locale?: string;
  readonly timeZone?: string;
}

export interface TimeLib {
  /** `14:07` — the message-row timestamp form. */
  readonly formatTime: (epochMs: number) => string;
  /** `Jul 3, 2026` — list/detail date form. */
  readonly formatDate: (epochMs: number) => string;
  /** `Jul 3, 2026, 14:07` — audit/detail form. */
  readonly formatDateTime: (epochMs: number) => string;
  /** `3m ago` / `in 2h`; past ~7 days falls back to `formatDate` (relative loses meaning). */
  readonly formatRelative: (epochMs: number) => string;
}

const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Days before a relative time ("9 days ago") reads worse than the date — the fallback horizon. */
const RELATIVE_HORIZON_DAYS = 7;
const RELATIVE_HORIZON_MS = RELATIVE_HORIZON_DAYS * MS_PER_DAY;

export function createTimeLib(config: TimeLibConfig = {}): TimeLib {
  const now = config.now ?? ((): number => Date.now());
  const locale = config.locale;
  const tz = config.timeZone === undefined ? {} : { timeZone: config.timeZone };

  // Intl formatter construction is expensive; each is built once per TimeLib (closure-memoized).
  const time = new Intl.DateTimeFormat(locale, { ...tz, hour: "2-digit", minute: "2-digit" });
  const date = new Intl.DateTimeFormat(locale, {
    ...tz,
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  const dateTime = new Intl.DateTimeFormat(locale, {
    ...tz,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
  const relative = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });

  const formatDate = (epochMs: number): string => date.format(epochMs);

  return {
    formatTime: (epochMs): string => time.format(epochMs),
    formatDate,
    formatDateTime: (epochMs): string => dateTime.format(epochMs),
    formatRelative: (epochMs): string => {
      const deltaMs = epochMs - now();
      const magnitude = Math.abs(deltaMs);
      if (magnitude >= RELATIVE_HORIZON_MS) {
        return formatDate(epochMs);
      }
      if (magnitude >= MS_PER_DAY) {
        return relative.format(Math.trunc(deltaMs / MS_PER_DAY), "day");
      }
      if (magnitude >= MS_PER_HOUR) {
        return relative.format(Math.trunc(deltaMs / MS_PER_HOUR), "hour");
      }
      if (magnitude >= MS_PER_MINUTE) {
        return relative.format(Math.trunc(deltaMs / MS_PER_MINUTE), "minute");
      }
      return relative.format(Math.trunc(deltaMs / MS_PER_SECOND), "second");
    },
  };
}
