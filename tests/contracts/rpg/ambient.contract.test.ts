// @orb/contracts/rpg/ambient — ambient with the engine's storage shape, born nullable (§2.7). Pins: the
// clock bounds, weather's closed-enum + free-label shape, the ONE TIME_OF_DAY→hour WRITE mapping, and the
// EXPLICIT phase boundaries (`TIME_OF_DAY_RANGES`) the label derivation reads back through.

import {
  RPG_WEATHER_TYPES,
  rpgClockTimeSchema,
  rpgWeatherSchema,
  rpgWeatherText,
  TIME_OF_DAY,
  TIME_OF_DAY_HOURS,
  TIME_OF_DAY_RANGES,
  timeOfDayAtHour,
} from "@orb/contracts/rpg";
import { WEATHER_TYPES } from "@orb/kit/weather";
import { expect, test } from "../../support/fixtures.ts";

test("clock enforces day≥1, hour 0-23, minute 0-59", () => {
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 0, minute: 0 }).success).toBe(true);
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 23, minute: 59 }).success).toBe(true);
  expect(rpgClockTimeSchema.safeParse({ day: 0, hour: 1, minute: 1 }).success).toBe(false);
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 24, minute: 0 }).success).toBe(false);
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 1, minute: 60 }).success).toBe(false);
});

test("weather.type is the CLOSED eight-state vocabulary — an off-vocab string is unrepresentable", () => {
  expect(rpgWeatherSchema.safeParse({ type: "rain" }).success).toBe(true);
  expect(rpgWeatherSchema.safeParse({ type: "storm", temperatureC: 8, wind: "gale" }).success).toBe(true);
  expect(rpgWeatherSchema.safeParse({ temperatureC: 8 }).success).toBe(false);
  // The exact class the enum exists to kill: free strings a render-side resolver used to bin (or silently drop).
  for (const off of ["overcast", "a light drizzle turning to sleet", "nightfall", ""]) {
    expect(rpgWeatherSchema.safeParse({ type: off }).success).toBe(false);
  }
  expect([...RPG_WEATHER_TYPES]).toEqual(["clear", "cloudy", "rain", "storm", "snow", "fog", "wind", "ash"]);
});

test("the weather axis has ONE home — the contract name IS the kit tuple (ui derives from the same object)", () => {
  // `@orb/ui` may not import contracts (D54), so the axis lives in kit and BOTH sides derive. Identity, not
  // deep-equality: a second `as const` spelling that happened to match today would pass `toEqual` and rot.
  expect(RPG_WEATHER_TYPES).toBe(WEATHER_TYPES);
});

test("weather.label is the free flavor text, capped, and TOTAL after parse (defaults to empty)", () => {
  expect(rpgWeatherSchema.parse({ type: "snow", label: "torrential sleet" }).label).toBe("torrential sleet");
  // Total by default: the plane merge recurses, so an absent label must PARSE to "" rather than stay absent
  // and let a previous sky's phrasing survive under a new type.
  expect(rpgWeatherSchema.parse({ type: "snow" }).label).toBe("");
  expect(rpgWeatherSchema.safeParse({ type: "snow", label: "x".repeat(41) }).success).toBe(false);
  expect(rpgWeatherSchema.safeParse({ type: "snow", label: "x".repeat(40) }).success).toBe(true);
});

test("an already-canonical weather parses BYTE-STABLE (no lift, no rewrite — the type is the wire truth)", () => {
  for (const type of RPG_WEATHER_TYPES) {
    expect(rpgWeatherSchema.parse({ type, label: "" })).toEqual({ type, label: "" });
  }
  expect(rpgWeatherSchema.parse({ type: "rain", label: "a thin grey drizzle", description: "on the shutters" })).toEqual({
    type: "rain",
    label: "a thin grey drizzle",
    description: "on the shutters",
  });
});

test("rpgWeatherText is the ONE display rule: the label when the model wrote one, else the canonical type", () => {
  expect(rpgWeatherText(rpgWeatherSchema.parse({ type: "snow", label: "torrential sleet" }))).toBe("torrential sleet");
  expect(rpgWeatherText(rpgWeatherSchema.parse({ type: "snow" }))).toBe("snow");
  // A whitespace-only label is not a label (it would render as a blank weather segment).
  expect(rpgWeatherText(rpgWeatherSchema.parse({ type: "fog", label: "   " }))).toBe("fog");
});

test("TIME_OF_DAY maps every label to a representative hour (the ONE mapping home)", () => {
  expect(TIME_OF_DAY).toEqual(["dawn", "morning", "afternoon", "evening", "night", "midnight"]);
  for (const label of TIME_OF_DAY) {
    const hour = TIME_OF_DAY_HOURS[label];
    expect(hour).toBeGreaterThanOrEqual(0);
    expect(hour).toBeLessThanOrEqual(23);
  }
  expect(TIME_OF_DAY_HOURS.midnight).toBe(0);
});

test("THE WRITE CAN NEVER DISAGREE WITH THE LABEL: every representative hour lies inside its own range", () => {
  // The two tables are different jobs — `TIME_OF_DAY_HOURS` is what a `timeOfDay` write PUTS ON the clock,
  // `TIME_OF_DAY_RANGES` is where the day turns over. If a write's hour fell outside its own range, picking
  // "evening" in the panel would render the band as something else. This is the pin that makes that impossible.
  for (const label of TIME_OF_DAY) {
    expect(timeOfDayAtHour(TIME_OF_DAY_HOURS[label]), `writing ${label} must read back as ${label}`).toBe(label);
  }
});

test("TIME_OF_DAY_RANGES are the EXPLICIT boundaries — start hours in 0-23, one per label, all distinct", () => {
  expect(TIME_OF_DAY_RANGES).toEqual({ dawn: 5, morning: 8, afternoon: 12, evening: 17, night: 20, midnight: 23 });
  const starts = TIME_OF_DAY.map((label) => TIME_OF_DAY_RANGES[label]);
  expect(new Set(starts).size).toBe(TIME_OF_DAY.length);
  for (const start of starts) {
    expect(start).toBeGreaterThanOrEqual(0);
    expect(start).toBeLessThanOrEqual(23);
  }
});

test("timeOfDayAtHour is RANGE MEMBERSHIP, wrap-aware — every hour of the day, and the boundaries themselves", () => {
  // The old rule inverted `TIME_OF_DAY_HOURS` by nearest representative hour, so the borders were EMERGENT
  // midpoints: dawn started at 3am (a 4am hand in dawn's color under a pitch-dark sky) and 23h read `night`.
  const expected = [
    ...Array.from({ length: 5 }, () => "midnight"), // 0-4 — midnight runs 23h→5h across the day line
    ...Array.from({ length: 3 }, () => "dawn"), // 5-7
    ...Array.from({ length: 4 }, () => "morning"), // 8-11
    ...Array.from({ length: 5 }, () => "afternoon"), // 12-16
    ...Array.from({ length: 3 }, () => "evening"), // 17-19
    ...Array.from({ length: 3 }, () => "night"), // 20-22
    "midnight", // 23
  ];
  expect(Array.from({ length: 24 }, (_, hour) => timeOfDayAtHour(hour))).toEqual(expected);
  // A boundary hour belongs to the range it OPENS (half-open [start, next)), and fractional hours resolve too.
  for (const label of TIME_OF_DAY) {
    expect(timeOfDayAtHour(TIME_OF_DAY_RANGES[label])).toBe(label);
    expect(timeOfDayAtHour(TIME_OF_DAY_RANGES[label] - 0.01)).not.toBe(label);
  }
  // Out-of-range hours wrap rather than falling through to a default (a full engine may hand over 24h+ ticks).
  expect(timeOfDayAtHour(24)).toBe("midnight");
  expect(timeOfDayAtHour(33.5)).toBe("morning");
  expect(timeOfDayAtHour(-1)).toBe("midnight");
});
