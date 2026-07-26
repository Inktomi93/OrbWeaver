// @orb/contracts/rpg/ambient — ambient (location · date · time-of-day · weather) as DATA with the
// full-engine's STORAGE shape, born nullable (rpg-design/05 §2.7). Lite WRITES these; full's time/weather
// ENGINE later writes the SAME fields — no column re-type at graft. `clock` is the engine's `{day,hour,
// minute}` struct (nullable, born null — a born "day 1 · morning" is a phantom fact one banner-render from
// steering wrong, the §8 nullable-honesty argument); lite writes it through a LABEL vocabulary
// (`TIME_OF_DAY` → a representative hour via `TIME_OF_DAY_HOURS`, the ONE mapping home) and the banner
// derives the label back from the hour via the same home. `weather` has `type` required, everything else
// optional — lite writes `{type:"rain"}`; full's engine fills the optional fields on the SAME shape.

import { z } from "zod";

const HOUR_MAX = 23;
const MINUTE_MAX = 59;

/** The engine clock — `{day ≥ 1, hour 0-23, minute 0-59}`. Nullable at the storage layer; when present,
 *  fully populated. Lite sets it via the `TIME_OF_DAY` label; full's engine sets it directly. */
export const rpgClockTimeSchema = z.object({
  day: z.number().int().min(1),
  hour: z.number().int().min(0).max(HOUR_MAX),
  minute: z.number().int().min(0).max(MINUTE_MAX),
});
export type RpgClockTime = z.infer<typeof rpgClockTimeSchema>;

/** Weather — `type` required, everything else optional. Lite writes `{type}`; full's engine fills the rest. */
export const rpgWeatherSchema = z.object({
  type: z.string().min(1),
  temperatureC: z.number().optional(),
  description: z.string().optional(),
  wind: z.string().optional(),
  visibility: z.string().optional(),
});
export type RpgWeather = z.infer<typeof rpgWeatherSchema>;

/** The label vocabulary lite steers ambient time through (§2.7). `update_scene.timeOfDay` picks one; the
 *  banner derives the label back from the stored hour. */
export const TIME_OF_DAY = ["dawn", "morning", "afternoon", "evening", "night", "midnight"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

/** The ONE label→representative-hour mapping (§2.7) — used both to WRITE the clock from a `timeOfDay` label
 *  and (inverted, nearest-hour) to DERIVE the label back for the banner. An internal vocabulary constant
 *  (§4.11 #6 argued no-knob). */
export const TIME_OF_DAY_HOURS: Readonly<Record<TimeOfDay, number>> = {
  dawn: 6,
  morning: 9,
  afternoon: 14,
  evening: 18,
  night: 21,
  midnight: 0,
};
