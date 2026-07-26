// @orb/contracts/rpg/ambient — ambient with the engine's storage shape, born nullable (§2.7). Pins: the
// clock bounds, weather's type-required/rest-optional shape, and the ONE TIME_OF_DAY→hour mapping.

import { rpgClockTimeSchema, rpgWeatherSchema, TIME_OF_DAY, TIME_OF_DAY_HOURS } from "@orb/contracts/rpg";
import { expect, test } from "../../support/fixtures";

test("clock enforces day≥1, hour 0-23, minute 0-59", () => {
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 0, minute: 0 }).success).toBe(true);
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 23, minute: 59 }).success).toBe(true);
  expect(rpgClockTimeSchema.safeParse({ day: 0, hour: 1, minute: 1 }).success).toBe(false);
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 24, minute: 0 }).success).toBe(false);
  expect(rpgClockTimeSchema.safeParse({ day: 1, hour: 1, minute: 60 }).success).toBe(false);
});

test("weather requires only type; the engine's optional fields ride the same shape", () => {
  expect(rpgWeatherSchema.safeParse({ type: "rain" }).success).toBe(true);
  expect(rpgWeatherSchema.safeParse({ type: "storm", temperatureC: 8, wind: "gale" }).success).toBe(true);
  expect(rpgWeatherSchema.safeParse({ temperatureC: 8 }).success).toBe(false);
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
