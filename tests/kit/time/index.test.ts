import { createTimeLib, epochToMs, humanizeDuration, isoToMs, msToWallClock, secondsToMs, wallClockToMs } from "@orb/kit/time";
import { expect, test } from "../../support/fixtures.ts";

const SEC = 1000;
const MIN = 60 * SEC;
const HR = 60 * MIN;
const DAY = 24 * HR;

// parity-plus P6 (§12, D6): {{idle_duration}}'s human-text form — the two largest non-zero units, singular/plural,
// "" for a sub-second / non-finite span (no elapsed time to report). Locale-independent (prompt text, not display).
test("humanizeDuration renders the two largest non-zero units, singular/plural correct", () => {
  expect(humanizeDuration(8 * MIN)).toBe("8 minutes");
  expect(humanizeDuration(MIN)).toBe("1 minute");
  expect(humanizeDuration(HR + 5 * MIN)).toBe("1 hour 5 minutes");
  expect(humanizeDuration(2 * DAY + 3 * HR)).toBe("2 days 3 hours");
  expect(humanizeDuration(45 * SEC)).toBe("45 seconds");
  // A zero middle unit is skipped — the two largest NON-zero units (days + minutes here, hours absent).
  expect(humanizeDuration(DAY + 5 * MIN)).toBe("1 day 5 minutes");
});

test('humanizeDuration returns "" for a sub-second / non-finite span (no elapsed time)', () => {
  expect(humanizeDuration(0)).toBe("");
  expect(humanizeDuration(500)).toBe("");
  expect(humanizeDuration(-5)).toBe("");
  expect(humanizeDuration(Number.NaN)).toBe("");
});

test("epochToMs leaves a millisecond epoch (≥ 1e12) untouched", () => {
  expect(epochToMs(1_700_000_000_000)).toBe(1_700_000_000_000);
});

test("epochToMs scales a seconds epoch (< 1e12) up to ms", () => {
  expect(epochToMs(1_700_000_000)).toBe(1_700_000_000_000);
});

test("epochToMs rounds and rejects non-finite / non-positive values", () => {
  expect(epochToMs(1.4)).toBe(1400); // seconds path: 1.4 * 1000
  expect(epochToMs(0)).toBeNull();
  expect(epochToMs(-5)).toBeNull();
  expect(epochToMs(Number.NaN)).toBeNull();
  expect(epochToMs(Number.POSITIVE_INFINITY)).toBeNull();
});

test("secondsToMs scales known-seconds and passes nullish through as undefined", () => {
  expect(secondsToMs(5)).toBe(5000);
  expect(secondsToMs(1.5)).toBe(1500);
  expect(secondsToMs(null)).toBeUndefined();
  expect(secondsToMs(undefined)).toBeUndefined();
  expect(secondsToMs(Number.NaN)).toBeUndefined();
});

// #1359: every caller is a provider SDK field documented as a forward epoch (Agent SDK `resetsAt`,
// OpenRouter `created`). A negative reading is a pre-1970 instant none of them can honestly mean, and
// `epochToMs` right next door already refuses `<= 0` — the two parsers now agree on the sign.
test("secondsToMs refuses a NEGATIVE epoch, matching epochToMs's own sign floor", () => {
  expect(secondsToMs(-1)).toBeUndefined();
  expect(secondsToMs(-1_700_000_000)).toBeUndefined();
  // 0 still passes: it is a real (if degenerate) epoch and no caller reads it as a sentinel.
  expect(secondsToMs(0)).toBe(0);
});

test("isoToMs reads a Z-suffixed instant as UTC", () => {
  expect(isoToMs("1970-01-01T00:00:00Z")).toBe(0);
  expect(isoToMs("2001-09-09T01:46:40Z")).toBe(1_000_000_000_000);
});

test("isoToMs reads a naive (no-offset) ISO string as UTC, not local", () => {
  // The determinism guarantee: no host-tz drift.
  expect(isoToMs("1970-01-01T00:00:00")).toBe(0);
});

test("isoToMs returns null for an unparseable string", () => {
  expect(isoToMs("not-a-date")).toBeNull();
});

// ── The Temporal port's parse surface (2026-08-21, luxon → platform `Temporal`) ───────────────────
// Every pin below was measured against the luxon implementation it replaced (a 70-input differential
// corpus, 63 byte-identical). These are the ones worth freezing: the arms that MUST keep working, and
// the five forms that deliberately narrowed to null.

test("isoToMs lets the string's OWN designator decide the instant, not the caller", () => {
  expect(isoToMs("2026-07-03T12:00:00+05:00")).toBe(1_783_062_000_000); // 07:00Z
  expect(isoToMs("2026-07-03T12:00:00-06:30")).toBe(1_783_103_400_000); // 18:30Z
  // An `[IANA/Zone]` annotation is honored the same way — a naive-looking string that carries a zone
  // is NOT a UTC reading (luxon read the annotation too; a Temporal `PlainDateTime` alone would not).
  expect(isoToMs("2026-07-03T12:00:00[America/Denver]")).toBe(1_783_101_600_000); // 18:00Z, MDT
  expect(isoToMs("2026-07-03T12:00:00-06:00[America/Denver]")).toBe(1_783_101_600_000);
});

test("isoToMs reads a date-only and a second-less ISO string as UTC midnight / that minute", () => {
  expect(isoToMs("2026-07-03")).toBe(1_783_036_800_000);
  expect(isoToMs("2026-07-03T12:00")).toBe(1_783_080_000_000);
  expect(isoToMs("2026-07-03T12:00:00.250Z")).toBe(1_783_080_000_250);
});

test("isoToMs rejects an impossible calendar date rather than constraining it into range", () => {
  // Temporal's DEFAULT is `overflow:"constrain"` — 30 February would silently become the 28th. The
  // parser pins `reject`, so an impossible date stays null exactly as it was.
  expect(isoToMs("2026-02-30T00:00:00")).toBeNull();
  expect(isoToMs("2026-13-01T00:00:00")).toBeNull();
});

test("isoToMs narrows to the ISO forms Temporal parses — the five luxon extras read null", () => {
  // DELIBERATE and fail-closed (the port's stated deltas). The sole consumer feeds it ST timestamps
  // containing `T`, which are plain date-times; re-widening any of these is a decision, not a fix.
  expect(isoToMs("2026")).toBeNull(); // reduced precision: year
  expect(isoToMs("2026-07")).toBeNull(); // reduced precision: year-month
  expect(isoToMs("2026-W27-5")).toBeNull(); // ISO week date
  expect(isoToMs("2026-185")).toBeNull(); // ISO ordinal date
  expect(isoToMs("2026-07-03T24:00:00Z")).toBeNull(); // end-of-day designator
  // A space separator is not ISO. Temporal accepts it as an extension; this contract does not.
  expect(isoToMs("2026-07-03 12:00:00")).toBeNull();
});

// ── wallClockToMs — the zone-resolving half (the ST-import fidelity path) ─────────────────────────

test("wallClockToMs resolves a zone-less reading at the zone's REAL offset for that instant", () => {
  const noon = { year: 2020, month: 6, day: 24, hour: 12, minute: 0, second: 0 };
  expect(wallClockToMs(noon, "America/Denver")).toBe(1_593_021_600_000); // 18:00Z — MDT, -06:00
  expect(wallClockToMs({ ...noon, month: 1 }, "America/Denver")).toBe(1_579_892_400_000); // 19:00Z — MST, -07:00
  // A half-hour DST zone: the offset a single fixed number cannot express.
  expect(wallClockToMs({ year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 }, "Australia/Lord_Howe")).toBe(1_767_186_000_000);
});

test("wallClockToMs shifts a spring-forward GAP reading forward and takes the EARLIER fall-back arm", () => {
  // 2026-03-08 02:30 America/Denver does not exist — the clock jumps 02:00 → 03:00. The reading
  // resolves at the offset AFTER the transition (03:30 MDT = 09:30Z), which is what luxon did.
  const gap = wallClockToMs({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, "America/Denver");
  expect(gap).toBe(1_772_962_200_000);
  expect(gap).toBe(wallClockToMs({ year: 2026, month: 3, day: 8, hour: 3, minute: 30, second: 0 }, "-06:00"));

  // 2026-11-01 01:30 America/Denver happens TWICE. The earlier (still-MDT, -06:00) arm wins.
  const ambiguous = wallClockToMs({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, "America/Denver");
  expect(ambiguous).toBe(1_793_518_200_000); // 07:30Z
  expect(ambiguous).toBe(wallClockToMs({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, "-06:00"));
  expect(ambiguous).not.toBe(wallClockToMs({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, "-07:00"));
});

test("wallClockToMs keeps ISO end-of-day (24:00:00) reading as the next day's midnight", () => {
  // The one overflow luxon accepted, and only with a zero minute/second. Reachable from the ST
  // filename pattern's `(\d{1,2})h` capture, so the normalization is load-bearing, not decorative.
  expect(wallClockToMs({ year: 2026, month: 12, day: 31, hour: 24, minute: 0, second: 0 }, "UTC")).toBe(1_798_761_600_000); // 2027-01-01T00:00Z
  expect(wallClockToMs({ year: 2026, month: 1, day: 1, hour: 24, minute: 30, second: 0 }, "UTC")).toBeNull();
  expect(wallClockToMs({ year: 2026, month: 1, day: 1, hour: 24, minute: 0, second: 30 }, "UTC")).toBeNull();
});

test("wallClockToMs returns null for impossible parts, non-integer parts and an unknown zone", () => {
  const jan1 = { year: 2026, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  expect(wallClockToMs({ ...jan1, month: 2, day: 29 }, "UTC")).toBeNull(); // 2026 is not a leap year
  expect(wallClockToMs({ ...jan1, year: 2024, month: 2, day: 29 }, "UTC")).toBe(1_709_164_800_000); // 2024 is
  expect(wallClockToMs({ ...jan1, month: 13 }, "UTC")).toBeNull();
  expect(wallClockToMs({ ...jan1, day: 32 }, "UTC")).toBeNull();
  expect(wallClockToMs({ ...jan1, minute: 60 }, "UTC")).toBeNull();
  // luxon THREW on these two; the documented contract was always "null when the parts are invalid".
  expect(wallClockToMs({ ...jan1, year: Number.NaN }, "UTC")).toBeNull();
  expect(wallClockToMs({ ...jan1, day: 1.5 }, "UTC")).toBeNull();
  expect(wallClockToMs(jan1, "Not/AZone")).toBeNull();
  expect(wallClockToMs(jan1, "")).toBeNull();
});

// ── msToWallClock — the exact inverse (an interchange emitting a zone-less local timestamp) ───────

test("msToWallClock is the inverse of wallClockToMs across a DST transition", () => {
  for (const parts of [
    { year: 2020, month: 6, day: 24, hour: 12, minute: 0, second: 0 },
    { year: 2020, month: 1, day: 24, hour: 12, minute: 0, second: 0 },
    { year: 2026, month: 3, day: 8, hour: 3, minute: 30, second: 0 }, // just past the gap
    { year: 2026, month: 11, day: 1, hour: 3, minute: 30, second: 0 }, // past the fall-back repeat
  ]) {
    const ms = wallClockToMs(parts, "America/Denver");
    expect(ms).not.toBeNull();
    expect(msToWallClock(ms ?? 0, "America/Denver")).toStrictEqual(parts);
  }
});

test("msToWallClock truncates a sub-ms fraction toward zero and rejects a non-finite instant", () => {
  const epoch = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 };
  expect(msToWallClock(1.5, "UTC")).toStrictEqual(epoch);
  expect(msToWallClock(-1.5, "UTC")).toStrictEqual({ year: 1969, month: 12, day: 31, hour: 23, minute: 59, second: 59 });
  expect(msToWallClock(Number.NaN, "UTC")).toBeNull();
  expect(msToWallClock(Number.POSITIVE_INFINITY, "UTC")).toBeNull();
  expect(msToWallClock(0, "Not/AZone")).toBeNull();
});

test("msToWallClock spans the full representable instant range and stops at its edge", () => {
  const maxMs = 8.64e15;
  expect(msToWallClock(maxMs, "UTC")).toStrictEqual({ year: 275_760, month: 9, day: 13, hour: 0, minute: 0, second: 0 });
  expect(msToWallClock(-maxMs, "UTC")).toStrictEqual({ year: -271_821, month: 4, day: 20, hour: 0, minute: 0, second: 0 });
  expect(msToWallClock(maxMs + 1, "UTC")).toBeNull();
});

// ── The DISPLAY half — deterministic under pinned locale/timeZone/now (the injectable config
// exists precisely so this never depends on the host ICU/zone/clock) ─────────────────────────────

// 2026-07-03T12:00:00Z (= Date.UTC(2026, 6, 3, 12) — precomputed literal; no Date call in tests).
const NOW_MS = 1_783_080_000_000;
const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const lib = createTimeLib({ now: () => NOW_MS, locale: "en-US", timeZone: "UTC" });

test("display: absolute forms under en-US/UTC", () => {
  expect(lib.formatDate(NOW_MS)).toBe("Jul 3, 2026");
  expect(lib.formatMonthYear(NOW_MS)).toBe("July 2026");
  expect(lib.formatTime(NOW_MS)).toBe("12:00 PM");
  expect(lib.formatDateTime(NOW_MS)).toBe("Jul 3, 2026, 12:00 PM");
});

test("display: relative picks the largest sensible unit, both directions", () => {
  expect(lib.formatRelative(NOW_MS - 3 * MINUTE_MS)).toBe("3m ago");
  expect(lib.formatRelative(NOW_MS + 2 * HOUR_MS)).toBe("in 2h");
  expect(lib.formatRelative(NOW_MS - 2 * DAY_MS)).toBe("2d ago");
  expect(lib.formatRelative(NOW_MS - 30_000)).toBe("30s ago");
});

// A deadline read seconds after it was set: a 7-day expiry must not read as six days, nor a 2h one as one.
test("display: relative rounds to the nearest whole unit, so a fresh deadline reads its full length", () => {
  expect(lib.formatRelative(NOW_MS + 7 * DAY_MS - 5000)).toBe("in 7d");
  expect(lib.formatRelative(NOW_MS + 2 * HOUR_MS - 5000)).toBe("in 2h");
  expect(lib.formatRelative(NOW_MS - 90 * MINUTE_MS - MINUTE_MS)).toBe("2h ago");
  // Control: under half a unit past a whole one stays on it.
  expect(lib.formatRelative(NOW_MS + 2 * DAY_MS + 3 * HOUR_MS)).toBe("in 2d");
});

// The LIST-ROW stamp form (list-pane-projection side-eye P1-2): same instant, tense dropped, so a 307px
// pane spends 2-3 characters on recency. The unit ladder must never skip a step (a 25h span is "1d", not
// "25h") and must stay honest at the edges — sub-minute and future both read "now".
test("display: the compact stamp picks the coarsest filled unit", () => {
  expect(lib.formatRelativeCompact(NOW_MS - 2 * HOUR_MS)).toBe("2h");
  expect(lib.formatRelativeCompact(NOW_MS - 25 * HOUR_MS)).toBe("1d");
  expect(lib.formatRelativeCompact(NOW_MS - 3 * MINUTE_MS)).toBe("3m");
  expect(lib.formatRelativeCompact(NOW_MS - 21 * DAY_MS)).toBe("3w");
  // Past the 7-day relative horizon the compact form keeps counting — the stamp column never becomes a date.
  expect(lib.formatRelativeCompact(NOW_MS - 9 * DAY_MS)).toBe("1w");
  expect(lib.formatRelativeCompact(NOW_MS - 400 * DAY_MS)).toBe("1y");
});

test('display: the compact stamp reads "now" for a sub-minute span and for a FUTURE instant', () => {
  expect(lib.formatRelativeCompact(NOW_MS - 30_000)).toBe("now");
  expect(lib.formatRelativeCompact(NOW_MS)).toBe("now");
  // Clock skew / an imported timestamp: a list stamp has no future tense, so it does not invent one.
  expect(lib.formatRelativeCompact(NOW_MS + 2 * HOUR_MS)).toBe("now");
});

// The SENTENCE relative-ago form (stickler 2026-08-16 F1): the compact stamp's horizon-less unit ladder
// with the past tense a prose line needs, and — the whole reason it exists — "just now" at the sub-minute
// and future edges, so a sentence embedding it never emits the bare "now ago" that "<stamp> ago" produced.
test('display: the sentence-ago form reads "just now" at the sub-minute/future edge, "<stamp> ago" otherwise', () => {
  expect(lib.formatRelativeAgo(NOW_MS - 30_000)).toBe("just now");
  expect(lib.formatRelativeAgo(NOW_MS)).toBe("just now");
  // Clock skew / an imported timestamp reads present, never a future tense — and never "now ago".
  expect(lib.formatRelativeAgo(NOW_MS + 2 * HOUR_MS)).toBe("just now");
  expect(lib.formatRelativeAgo(NOW_MS - 3 * MINUTE_MS)).toBe("3m ago");
  expect(lib.formatRelativeAgo(NOW_MS - 2 * HOUR_MS)).toBe("2h ago");
  // No horizon (unlike formatRelative): a two-year-old chat still counts up rather than becoming a date.
  expect(lib.formatRelativeAgo(NOW_MS - 9 * DAY_MS)).toBe("1w ago");
  expect(lib.formatRelativeAgo(NOW_MS - 400 * DAY_MS)).toBe("1y ago");
});

test("display: past the ~7-day horizon relative falls back to the absolute date", () => {
  const nineDaysAgo = NOW_MS - 9 * DAY_MS;
  expect(lib.formatRelative(nineDaysAgo)).toBe(lib.formatDate(nineDaysAgo));
});
