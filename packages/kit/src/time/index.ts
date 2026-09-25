// THE canonical time representation across the stack: a UTC instant as integer epoch MILLISECONDS.
// Every stored timestamp (`*_at`, `*Date`, gen timing) is epoch-ms; the client renders it in the
// viewer's timezone via `Intl.DateTimeFormat`. All provider + import boundaries normalize to
// epoch-ms HERE — a zone-less reading resolves as UTC — so no seconds-vs-ms or local-vs-UTC drift can
// leak downstream. Providers mix units: OpenRouter `created` and the Agent SDK rate-limit
// `resetsAt` are epoch SECONDS; our own timestamps are ms; imported corpora are a zoo of formats.
//
// The zone/calendar math is the PLATFORM `Temporal` API (node ≥26 ships it enabled by default; the
// browser arm is chromium ≥144 — probe-verified in the CT chromium 149 before this port landed). It
// replaced luxon here 2026-08-21; the port is pinned by a differential corpus (63 of 70 inputs
// byte-identical, every DST/calendar edge among them) whose deliberate deltas are stated on the two
// parsers below. luxon SURVIVES in `macro/registry.ts` alone, where `{{datetimeformat::FORMAT}}`
// exposes luxon's format-token vocabulary to users as a documented contract — that is a user-data
// spec, not an implementation detail, and Temporal has no token formatter to preserve it with.

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
 *  `resetsAt`, OpenRouter `created`). Passes through undefined so it composes with optional fields.
 *
 *  A NEGATIVE reading is undefined too (#1359): every caller is a provider SDK field contractually
 *  documented as a forward epoch, so a pre-1970 instant is a corrupt payload rather than a date, and
 *  {@link epochToMs} right next door already refuses `<= 0`. The two parsers now agree on the sign. `0`
 *  still passes — it is a real (if degenerate) epoch and no caller reads it as a sentinel. */
export function secondsToMs(seconds: number | null | undefined): number | undefined {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return;
  }
  return Math.round(seconds * MS_PER_SECOND);
}

/** An `[IANA/Zone]`-annotated or offset/`Z`-designated string names an EXACT instant — the string's own
 *  zone decides it, never the caller's. `null` when it carries neither (the zone-less arm below). */
function exactInstantMs(value: string): number | null {
  // @orb-waive caught-failure-ownership(catch): documented — no [IANA/Zone] annotation falls
  // through to the designator arm below. Ends if the fallthrough is removed.
  try {
    return Temporal.ZonedDateTime.from(value).epochMilliseconds;
  } catch {
    // No `[IANA/Zone]` annotation — fall through to the designator arm.
  }
  // @orb-waive caught-failure-ownership(catch): documented in the function's JSDoc — null
  // when the value carries neither zone form, consumed by isoToMs's ?? naiveIsoMs fallback. Ends if
  // isoToMs stops handling the null.
  try {
    return Temporal.Instant.from(value).epochMilliseconds;
  } catch {
    return null;
  }
}

/** A zone-less ISO reading resolved as UTC. `overflow:"reject"` so an impossible date (`2026-02-30`)
 *  is `null` rather than silently CONSTRAINED to the month's last day — Temporal's default. */
function naiveIsoMs(value: string): number | null {
  // @orb-waive caught-failure-ownership(catch): documented — null on an invalid/impossible
  // reading, consumed by isoToMs (this function's sole caller) as the terminal fallback arm. Ends if
  // isoToMs stops handling the null.
  try {
    return Temporal.PlainDateTime.from(value, { overflow: "reject" }).toZonedDateTime("UTC").epochMilliseconds;
  } catch {
    return null;
  }
}

/** Parse an ISO-8601 string → epoch ms. A naive (no-offset) ISO string is read as UTC, NOT the host's
 *  local zone — that determinism is the whole point. null if invalid.
 *
 *  The parsed set is what `Temporal` parses: a calendar date, a date-time, either with an offset/`Z`
 *  designator or an `[IANA/Zone]` annotation or neither. The luxon parser this replaced ALSO accepted
 *  five forms that now read `null` — reduced precision (`2026`, `2026-07`), ISO week (`2026-W27-5`),
 *  ISO ordinal (`2026-185`) and end-of-day (`…T24:00:00`). Deliberate and fail-closed: the sole
 *  consumer (`server/kit/serde/chat` parseStDate) feeds it ST timestamps containing `T`, which are
 *  plain date-times, and every one of the five is pinned in the suite so a re-widening is a decision.
 *  A SPACE separator (`2026-07-03 12:00:00`) stays rejected — Temporal accepts it as an extension,
 *  luxon did not, and this function's contract is ISO. */
export function isoToMs(value: string): number | null {
  if (value.includes(" ")) {
    return null;
  }
  return exactInstantMs(value) ?? naiveIsoMs(value);
}

// ─── WALL-CLOCK instants (a foreign corpus's zone-less local timestamps) ───────────────────────────
// The paragraph above is about NAIVE ISO and numeric epochs, where "read it as UTC" is the honest
// determinism call. It is NOT true of every foreign format: SillyTavern writes its two human date forms
// off `Date.getHours()`/`getFullYear()` on the machine ST ran on (`RossAscends-mods.js`
// `humanizedDateTime`) and reads the meridiem form back with a NAIVE (local) moment
// (`utils.js parseTimestamp` → `"YYYY-MM-DDTHH:mm:00"`, no `Z`). Those strings are a LOCAL WALL CLOCK
// with no zone recorded, so reading them as UTC silently shifts every imported timestamp by the writer's
// UTC offset — measured 6h/7h across a 1,097-file ST corpus (America/Denver, both DST arms).
// The recovery is to name the zone EXPLICITLY at the boundary that knows it, never to read an ambient
// one down in a parser: hence a required `zone` argument here plus {@link hostTimeZone} as the single
// sanctioned resolver for "the box this corpus came off".

/** The IANA zone name of the host process — the ONE sanctioned ambient-zone read (this module is the
 *  `no-raw-intl-time` exemption zone). For a foreign corpus whose wall-clock timestamps carry no zone,
 *  the importing box's zone is the only honest guess and is exactly what the writing app used when the
 *  corpus is imported where it was produced. Falls back to `"UTC"` on an ICU build that reports none. */
export function hostTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

/** ISO-8601's end-of-day reading: `24:00:00` names the NEXT day's midnight, and ONLY with a zero
 *  minute/second (any other 24h reading is invalid). Temporal rejects the spelling outright, so the
 *  normalization below keeps it parsing exactly as it did. */
const END_OF_DAY_HOUR = 24;

/** A zone-less wall-clock reading (1-based `month`) resolved in `zone` → epoch ms; null when the parts
 *  or the zone name are invalid. DST-aware per instant (a corpus spanning a transition gets each arm's
 *  real offset, which a single fixed offset cannot express) — a spring-forward GAP reading shifts
 *  forward and a fall-back AMBIGUOUS one takes the earlier offset, both pinned in the suite.
 *
 *  `zone` must be an IANA name or a numeric `±HH:MM` offset; the luxon parser this replaced also took
 *  the non-IANA `UTC+2` spelling, which now reads null (no producer emits it — every live caller passes
 *  {@link hostTimeZone} or the serde's `"UTC"` default). Non-integer / non-finite parts read null too,
 *  which is what this contract always PROMISED — luxon THREW on them. */
export function wallClockToMs(
  parts: { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number; readonly second: number },
  zone: string,
): number | null {
  if (!Object.values(parts).every((part) => Number.isInteger(part))) {
    return null;
  }
  const endOfDay = parts.hour === END_OF_DAY_HOUR && parts.minute === 0 && parts.second === 0;
  // @orb-waive caught-failure-ownership(catch): documented in the JSDoc — null when the
  // parts or zone name are invalid, part of this function's stated contract. Ends if a caller stops
  // treating the null return as "invalid input".
  try {
    // `overflow:"reject"` — an impossible reading (month 13, 30 February) is null, never CONSTRAINED to
    // a nearby valid one, which is Temporal's default and would silently land a wrong instant.
    const plain = Temporal.PlainDateTime.from(endOfDay ? { ...parts, hour: 0 } : parts, { overflow: "reject" });
    return (endOfDay ? plain.add({ days: 1 }) : plain).toZonedDateTime(zone).epochMilliseconds;
  } catch {
    return null;
  }
}

/** Format an epoch-ms instant as its wall-clock reading in `zone` (1-based `month`) — the inverse of
 *  {@link wallClockToMs}, so an interchange that emits a zone-less local timestamp emits the SAME clock
 *  its reader will resolve. Null when the instant or the zone name is invalid. */
export function msToWallClock(
  ms: number,
  zone: string,
): { readonly year: number; readonly month: number; readonly day: number; readonly hour: number; readonly minute: number; readonly second: number } | null {
  if (!Number.isFinite(ms)) {
    return null;
  }
  // @orb-waive caught-failure-ownership(catch): documented in the JSDoc — null when the
  // instant or zone name is invalid, part of this function's stated contract. Ends if a caller stops
  // treating the null return as "invalid input".
  try {
    // Truncate toward zero before the instant: `Temporal` takes integer ms only, and truncation is
    // exactly what `Date`/luxon did with a sub-ms fraction, so a fractional input lands the same clock.
    const zoned = Temporal.Instant.fromEpochMilliseconds(Math.trunc(ms)).toZonedDateTimeISO(zone);
    return { year: zoned.year, month: zoned.month, day: zoned.day, hour: zoned.hour, minute: zoned.minute, second: zoned.second };
  } catch {
    return null;
  }
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
  /** `July 2026` — calendar-month scope form. */
  readonly formatMonthYear: (epochMs: number) => string;
  /** `Jul 3, 2026, 14:07` — audit/detail form. */
  readonly formatDateTime: (epochMs: number) => string;
  /** `3m ago` / `in 2h`; past ~7 days falls back to `formatDate` (relative loses meaning). */
  readonly formatRelative: (epochMs: number) => string;
  /** `2h` / `1d` / `3w` — the LIST-ROW stamp form: the same instant with the tense words dropped, so a
   *  dense row spends ~2-3 characters on recency instead of ~7. Use
   *  it where the stamp is a COLUMN the eye scans; a sentence ("edited 5m ago") keeps `formatRelative`. */
  readonly formatRelativeCompact: (epochMs: number) => string;
  /** `just now` / `5m ago` / `2h ago` / `3w ago` — the SENTENCE relative-ago phrase: the compact stamp's
   *  unit ladder (no absolute-date horizon, unlike `formatRelative`) with the past tense a prose line
   *  needs. Sub-minute AND any future instant (clock skew, an imported timestamp) read `just now`, so a
   *  sentence embedding it NEVER emits the bare `now ago` that `${formatRelativeCompact} ago` produces.
   *  Use it where the phrase lives inside a sentence ("You left off 5m ago in …") whose whole job is
   *  elapsed-since; a column stamp keeps `formatRelativeCompact`. */
  readonly formatRelativeAgo: (epochMs: number) => string;
  /** Current epoch-ms from the SAME injected clock the formatters use — the sanctioned "now" read (a
   *  feature computing an elapsed-since a stored timestamp reads it here, never ambient `Date.now()`). */
  readonly now: () => number;
}

const MS_PER_MINUTE = 60 * MS_PER_SECOND;
const MS_PER_HOUR = 60 * MS_PER_MINUTE;
const MS_PER_DAY = 24 * MS_PER_HOUR;
/** Days before a relative time ("9 days ago") reads worse than the date — the fallback horizon. */
const RELATIVE_HORIZON_DAYS = 7;
const RELATIVE_HORIZON_MS = RELATIVE_HORIZON_DAYS * MS_PER_DAY;
const DAYS_PER_WEEK = 7;
/** A week in ms. EXPORTED because "within the last week" is a span a display surface asks about directly
 *  (the Characters landing's week's-additions foot line, #864) and the alternative is every caller
 *  re-spelling `7 * 24 * 60 * 60 * 1000` — the unit ladder has exactly one home, and this is it. */
export const MS_PER_WEEK = DAYS_PER_WEEK * MS_PER_DAY;
/** Weeks before a compact stamp switches to years — 52w is where "how many weeks?" stops being readable. */
const COMPACT_WEEK_HORIZON = 52;
const MS_PER_YEAR = COMPACT_WEEK_HORIZON * MS_PER_WEEK;

/** The compact stamp ladder, coarsest first: the first unit the elapsed span fills wins. */
const COMPACT_UNITS: readonly (readonly [ms: number, suffix: string])[] = [
  [MS_PER_YEAR, "y"],
  [MS_PER_WEEK, "w"],
  [MS_PER_DAY, "d"],
  [MS_PER_HOUR, "h"],
  [MS_PER_MINUTE, "m"],
];

/** `2h`/`1d`/`3w` for an elapsed span. Deliberately NOT `Intl.RelativeTimeFormat`: every Intl style still
 *  carries the tense ("2h ago" / "vor 2 Std."), and the whole point of the stamp form is that the tense is
 *  implied by the column. Sub-minute (and any FUTURE instant — clock skew, an imported timestamp) reads
 *  `now`: a list stamp has no future tense. */
function compactStamp(elapsedMs: number): string {
  for (const [unitMs, suffix] of COMPACT_UNITS) {
    if (elapsedMs >= unitMs) {
      return `${Math.trunc(elapsedMs / unitMs)}${suffix}`;
    }
  }
  return "now";
}

/** A duration (ms) as compact human text using the two largest non-zero units: `8 minutes`, `1 hour 5 minutes`,
 *  `2 days 3 hours`, `45 seconds`. The `{{idle_duration}}` macro's time-since-last-activity form (parity-plus
 *  §12, D6). Returns "" for a non-positive / non-finite span (no elapsed time to report). Locale-independent by
 *  design — this is prompt text the MODEL reads, not a viewer-facing render (so no `Intl`, no per-locale drift). */
export function humanizeDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < MS_PER_SECOND) {
    return "";
  }
  const units: readonly (readonly [ms: number, singular: string])[] = [
    [MS_PER_DAY, "day"],
    [MS_PER_HOUR, "hour"],
    [MS_PER_MINUTE, "minute"],
    [MS_PER_SECOND, "second"],
  ];
  const parts: string[] = [];
  let remaining = Math.trunc(ms);
  for (const [unitMs, singular] of units) {
    const n = Math.trunc(remaining / unitMs);
    if (n > 0) {
      parts.push(`${n} ${singular}${n === 1 ? "" : "s"}`);
      remaining -= n * unitMs;
    }
    if (parts.length === 2) {
      break; // the two largest non-zero units — the reminder wants "1 hour 5 minutes", not the second tail
    }
  }
  return parts.join(" ");
}

// The relative-time ladder, largest unit first. A unit is chosen once the span reaches it; a sub-second span reads
// in seconds.
const SECOND_STEP = ["second", MS_PER_SECOND] as const;
const RELATIVE_UNITS = [["day", MS_PER_DAY], ["hour", MS_PER_HOUR], ["minute", MS_PER_MINUTE], SECOND_STEP] as const satisfies readonly (readonly [
  Intl.RelativeTimeFormatUnit,
  number,
])[];

// A deadline read seconds after it was set keeps its full length. The grace is a hundredth of the unit being floored:
// a whole unit of grace would read every span one unit long.
const FUTURE_GRACE_FRACTION = 100;

/** A span as a count of one ladder unit, in the unit the raw span reaches. A future span is a deadline, so it floors
 *  and never reads longer than it is, after a grace of a hundredth of that unit. A past span rounds. Either way a count
 *  that reaches the next unit up reads as that unit, so no label says "24 hours" or "60 minutes". */
function relativeSpan(deltaMs: number): { readonly count: number; readonly unit: Intl.RelativeTimeFormatUnit } {
  const future = deltaMs > 0;
  const magnitude = Math.abs(deltaMs);
  const step = RELATIVE_UNITS.find(([, sizeMs]) => magnitude >= sizeMs) ?? SECOND_STEP;
  const index = RELATIVE_UNITS.indexOf(step);
  const [unit, unitMs] = step;
  const count = future ? Math.floor((magnitude + unitMs / FUTURE_GRACE_FRACTION) / unitMs) : Math.round(magnitude / unitMs);
  const larger = RELATIVE_UNITS[index - 1];
  if (larger !== undefined && count * unitMs >= larger[1]) {
    return { count: Math.sign(deltaMs) * Math.round((count * unitMs) / larger[1]), unit: larger[0] };
  }
  return { count: Math.sign(deltaMs) * count, unit };
}

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
  const monthYear = new Intl.DateTimeFormat(locale, {
    ...tz,
    year: "numeric",
    month: "long",
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
    now,
    formatTime: (epochMs): string => time.format(epochMs),
    formatDate,
    formatMonthYear: (epochMs): string => monthYear.format(epochMs),
    formatDateTime: (epochMs): string => dateTime.format(epochMs),
    formatRelative: (epochMs): string => {
      const deltaMs = epochMs - now();
      const magnitude = Math.abs(deltaMs);
      if (magnitude >= RELATIVE_HORIZON_MS) {
        return formatDate(epochMs);
      }
      const { count, unit } = relativeSpan(deltaMs);
      return relative.format(count, unit);
    },
    formatRelativeCompact: (epochMs): string => compactStamp(now() - epochMs),
    formatRelativeAgo: (epochMs): string => {
      const elapsedMs = now() - epochMs;
      // Sub-minute and future both fall here (elapsed < a minute), so the phrase reads "just now" instead
      // of composing the compact stamp's edge word "now" into "now ago".
      return elapsedMs < MS_PER_MINUTE ? "just now" : `${compactStamp(elapsedMs)} ago`;
    },
  };
}
