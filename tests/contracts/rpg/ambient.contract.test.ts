// @orb/contracts/rpg/ambient — ambient with the engine's storage shape, born nullable (§2.7). Pins: the
// clock bounds, weather's closed-enum + free-label shape, and the ONE TIME_OF_DAY→hour mapping.

import { RPG_WEATHER_TYPES, rpgClockTimeSchema, rpgWeatherSchema, rpgWeatherText, TIME_OF_DAY, TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import { WEATHER_TYPES } from "@orb/kit/weather";
import { expect, test } from "../../support/fixtures";

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
