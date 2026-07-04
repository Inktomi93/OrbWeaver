import { createTimeLib, epochToMs, isoToMs, secondsToMs, utcFormatToMs } from "@orb/kit/time";
import { expect, test } from "../../support/fixtures";

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

test("a format token is read as UTC", () => {
  expect(utcFormatToMs("1970-01-01", "yyyy-MM-dd")).toBe(0);
  expect(utcFormatToMs("nope", "yyyy-MM-dd")).toBeNull();
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
  expect(lib.formatTime(NOW_MS)).toBe("12:00 PM");
  expect(lib.formatDateTime(NOW_MS)).toBe("Jul 3, 2026, 12:00 PM");
});

test("display: relative picks the largest sensible unit, both directions", () => {
  expect(lib.formatRelative(NOW_MS - 3 * MINUTE_MS)).toBe("3m ago");
  expect(lib.formatRelative(NOW_MS + 2 * HOUR_MS)).toBe("in 2h");
  expect(lib.formatRelative(NOW_MS - 2 * DAY_MS)).toBe("2d ago");
  expect(lib.formatRelative(NOW_MS - 30_000)).toBe("30s ago");
});

test("display: past the ~7-day horizon relative falls back to the absolute date", () => {
  const nineDaysAgo = NOW_MS - 9 * DAY_MS;
  expect(lib.formatRelative(nineDaysAgo)).toBe(lib.formatDate(nineDaysAgo));
});
