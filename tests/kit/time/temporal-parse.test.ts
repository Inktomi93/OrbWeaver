// The Temporal-backed parse reads the ISO forms it documents, rejects the loose forms the replaced parser took, and resolves
// a wall-clock reading that a DST transition skips or repeats as documented.
// @subject packages/kit/src/time/index.ts
import { isoToMs, wallClockToMs } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";

const NOON_UTC = Date.UTC(2026, 6, 3, 12);

test.for([
  { label: "an instant with a Z designator", value: "2026-07-03T12:00:00Z" },
  { label: "an instant with an offset", value: "2026-07-03T14:00:00+02:00" },
  { label: "a date-time with a zone annotation", value: "2026-07-03T08:00:00[America/New_York]" },
  { label: "a naive date-time, read as UTC", value: "2026-07-03T12:00:00" },
])("$label reads as its instant", ({ value }) => {
  expect(isoToMs(value)).toBe(NOON_UTC);
});

test.for([
  { label: "reduced precision, year only", value: "2026" },
  { label: "reduced precision, year and month", value: "2026-07" },
  { label: "an ISO week date", value: "2026-W27-5" },
  { label: "an ISO ordinal date", value: "2026-185" },
  { label: "an end-of-day reading", value: "2026-07-03T24:00:00" },
  { label: "an end-of-day reading with a designator", value: "2026-07-03T24:00:00Z" },
  { label: "a space separator", value: "2026-07-03 12:00:00" },
  { label: "an impossible date", value: "2026-02-30T12:00:00" },
])("$label reads null", ({ value }) => {
  expect(isoToMs(value)).toBeNull();
});

const NEW_YORK = "America/New_York";

test("a wall-clock reading the spring-forward gap skips shifts forward", () => {
  // 02:30 on 2026-03-08 does not exist in New York; the clock jumps from 02:00 EST to 03:00 EDT.
  expect(wallClockToMs({ year: 2026, month: 3, day: 8, hour: 2, minute: 30, second: 0 }, NEW_YORK)).toBe(Date.UTC(2026, 2, 8, 7, 30));
});

test("a wall-clock reading the fall-back repeats takes the earlier offset", () => {
  // 01:30 on 2026-11-01 happens twice in New York, first in EDT (UTC-4) and again in EST (UTC-5).
  expect(wallClockToMs({ year: 2026, month: 11, day: 1, hour: 1, minute: 30, second: 0 }, NEW_YORK)).toBe(Date.UTC(2026, 10, 1, 5, 30));
});

test("a reading outside a transition resolves at the zone's offset of that day", () => {
  expect(wallClockToMs({ year: 2026, month: 7, day: 3, hour: 8, minute: 0, second: 0 }, NEW_YORK)).toBe(NOON_UTC);
  expect(wallClockToMs({ year: 2026, month: 1, day: 3, hour: 7, minute: 0, second: 0 }, NEW_YORK)).toBe(Date.UTC(2026, 0, 3, 12));
});
