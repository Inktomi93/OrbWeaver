import { epochToMs, isoToMs, secondsToMs, utcFormatToMs } from "@orb/kit/time";
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
