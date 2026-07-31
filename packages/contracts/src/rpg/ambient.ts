// @orb/contracts/rpg/ambient — ambient (location · date · time-of-day · weather) as DATA with the
// full-engine's STORAGE shape, born nullable (rpg-design/05 §2.7). Lite WRITES these; full's time/weather
// ENGINE later writes the SAME fields — no column re-type at graft. `clock` is the engine's `{day,hour,
// minute}` struct (nullable, born null — a born "day 1 · morning" is a phantom fact one banner-render from
// steering wrong, the §8 nullable-honesty argument); lite writes it through a LABEL vocabulary
// (`TIME_OF_DAY` → a representative hour via `TIME_OF_DAY_HOURS`, the ONE mapping home) and the banner
// derives the label back from the hour via the same home. `weather` has `type` required, everything else
// optional — lite writes `{type:"rain"}`; full's engine fills the optional fields on the SAME shape.

import { WEATHER_TYPES } from "@orb/kit/weather";
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

/** The CLOSED weather vocabulary the model writes and the panel's Waystone paints — the axis is homed in
 *  `@orb/kit/weather` (reachable by BOTH this schema and the ui primitive, which may not import contracts,
 *  D54); this is the rpg-facing NAME for the same tuple, never a second spelling. */
export const RPG_WEATHER_TYPES = WEATHER_TYPES;
export type RpgWeatherType = (typeof RPG_WEATHER_TYPES)[number];
export const rpgWeatherTypeSchema = z.enum(RPG_WEATHER_TYPES);

/** The weather label cap — a short flavor phrase ("torrential sleet"), not a sentence of prose. */
const WEATHER_LABEL_MAX = 40;

/** The free flavor label beside the closed `type` — ONE home for the field (the stored shape below and the
 *  `update_scene` write share it, so the cap can never diverge between the wire and the store). */
export const rpgWeatherLabelSchema = z.string().max(WEATHER_LABEL_MAX);

/** Weather — a CLOSED `type` + an optional free `label`, everything else optional (the relationship-kind
 *  `{kind, label}` precedent, §2.1). `type` is the eight-state vocabulary the Waystone renders and the
 *  extraction wire binds at the token level: a free string had to be BINNED onto these eight anyway, and
 *  binning at the render silently degraded everything the table missed. `label` keeps the model's vivid
 *  phrasing as the DISPLAYED datum ("torrential sleet" over `snow`) — the text is the datum, the type is
 *  the visual. Lite writes `{type}` (+`label`); full's engine fills the rest on the SAME shape.
 *
 *  `label` is STORED total (`.default("")`, the `rpgRelationshipSchema.label` precedent) — never optional.
 *  The volatile-plane merge RECURSES into a plain-object patch ([merge-clear]), so a type-only write over a
 *  labelled sky would leave the OLD flavor text stranded on the new weather ("torrential sleet" over
 *  `clear`). A total field means every write carries the answer. */
export const rpgWeatherSchema = z.object({
  type: rpgWeatherTypeSchema,
  label: rpgWeatherLabelSchema.default(""),
  temperatureC: z.number().optional(),
  description: z.string().optional(),
  wind: z.string().optional(),
  visibility: z.string().optional(),
});
export type RpgWeather = z.infer<typeof rpgWeatherSchema>;

/** The DISPLAY text for a weather: the model's free `label` when it wrote one, else the canonical type.
 *  ONE home — the reminder line, the delta transition, the macro/CEL scene view and the panel band all read
 *  through it, so they can never disagree about which of the two strings a human sees. */
export function rpgWeatherText(weather: RpgWeather): string {
  const label = weather.label.trim();
  return label.length > 0 ? label : weather.type;
}

/** The label vocabulary lite steers ambient time through (§2.7). `update_scene.timeOfDay` picks one; the
 *  banner derives the label back from the stored hour. Deliberately does NOT carry `dusk` (owner ruling
 *  2026-07-31): a WRITE vocabulary with both `dusk` and `evening` invites the model to dither between
 *  near-synonyms. Dawn/dusk differentiation is a RENDER concern — the Waystone reads `clock.hour` directly and
 *  glows through the golden windows (`waystone-treatment.ts`), so the visual distinction ships without a
 *  vocabulary member. */
export const TIME_OF_DAY = ["dawn", "morning", "afternoon", "evening", "night", "midnight"] as const;
export type TimeOfDay = (typeof TIME_OF_DAY)[number];

/** The ONE label→representative-hour mapping (§2.7) — used both to WRITE the clock from a `timeOfDay` label
 *  and (inverted, NEAREST-hour, non-wrapping, ties to the earlier label) to DERIVE the label back for the
 *  banner. An internal vocabulary constant (§4.11 #6 argued no-knob). It is also the RENDER input in narrated
 *  mode: a lite game's clock only ever holds one of these representative hours, and the Waystone's continuous
 *  sky interpolates from exactly that number. */
export const TIME_OF_DAY_HOURS: Readonly<Record<TimeOfDay, number>> = {
  dawn: 6,
  morning: 9,
  afternoon: 14,
  evening: 18,
  night: 21,
  midnight: 0,
};
