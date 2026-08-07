// @orb/contracts/rpg/ambient — ambient (location · date · time-of-day · weather) as DATA with the
// full-engine's STORAGE shape, born nullable (rpg-design/05 §2.7). Lite WRITES these; full's time/weather
// ENGINE later writes the SAME fields — no column re-type at graft. `clock` is the engine's `{day,hour,
// minute}` struct (nullable, born null — a born "day 1 · morning" is a phantom fact one banner-render from
// steering wrong, the §8 nullable-honesty argument); lite writes it through a LABEL vocabulary
// (`TIME_OF_DAY` → a representative hour via `TIME_OF_DAY_HOURS`, the ONE mapping home) and the banner
// derives the label back from the hour by RANGE MEMBERSHIP (`TIME_OF_DAY_RANGES` — the boundary truth) via
// `timeOfDayAtHour`, the ONE derivation home. `weather` has `type` required, everything else
// optional — lite writes `{type:"rain"}`; full's engine fills the optional fields on the SAME shape.

import { WEATHER_TYPES } from "@orb/kit/weather";
import { z } from "zod";

const HOUR_MAX = 23;
const MINUTE_MAX = 59;

/** The engine clock — `{day ≥ 1, hour 0-23 | null, minute 0-59 | null}`. The PLANE is nullable (null = the
 *  story has stated no when at all, the born state); within a present plane the TIME is separately nullable,
 *  and that is a distinction the surfaces need rather than a hedge.
 *
 *  WHY THE TIME IS NULLABLE INSIDE A PRESENT CLOCK (2026-08-07). `day` is a CALENDAR COUNTER and
 *  `hour`/`minute` are a TIME OF DAY: two facts a story moves independently ("three days later" says nothing
 *  about the hour). They shared one all-or-nothing nullability, so the only way to unset the time was to null
 *  the whole plane — which took `day N` with it, and `day N` has no other host-side door to restore (the
 *  Scene tab's Date field writes `calendarDate`, and `update_scene.day` is the MODEL's door). The panel's
 *  "Clear time" did exactly that, and the next time-pick then resurrected the clock at a FABRICATED day 1 —
 *  a phantom fact of exactly the class this plane's born-null posture exists to refuse.
 *
 *  `{day: 4, hour: null}` renders as the arm that already existed and is already designed: the Waystone's
 *  `clock === null` treatment (the header passes it `null` when there is no time), the band's `day 4` with no
 *  time segment, the reminder's `day 4` line. No new rendered state was invented for it.
 *
 *  Lite sets the time via the `TIME_OF_DAY` label; full's engine sets it directly. Reading the label back is
 *  {@link clockTimeOfDay} — the ONE guard, so no consumer re-decides what "this clock has no time" means. */
export const rpgClockTimeSchema = z.object({
  day: z.number().int().min(1),
  hour: z.number().int().min(0).max(HOUR_MAX).nullable(),
  minute: z.number().int().min(0).max(MINUTE_MAX).nullable(),
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

/** The ONE label→representative-hour WRITE mapping (§2.7) — the hour a `timeOfDay` label PUTS ON THE CLOCK.
 *  An internal vocabulary constant (§4.11 #6 argued no-knob). It is also the RENDER input in narrated mode: a
 *  lite game's clock only ever holds one of these representative hours, and the Waystone's continuous sky
 *  interpolates from exactly that number. Reading the label BACK is `timeOfDayAtHour` (range membership) —
 *  never an inversion of this table; a unit test pins every representative hour inside its own range so the
 *  write and the read can never disagree. */
export const TIME_OF_DAY_HOURS: Readonly<Record<TimeOfDay, number>> = {
  dawn: 6,
  morning: 9,
  afternoon: 14,
  evening: 18,
  night: 21,
  midnight: 0,
};

/** The ONE boundary truth: each phase's START hour, running until the next phase's start (wrap-aware —
 *  `midnight` spans 23h→5h across the day line). Owner-tunable: these are the hours the DAY actually turns
 *  over, not an artifact of where two representative hours happen to average out. (They used to be exactly
 *  that artifact — inverting `TIME_OF_DAY_HOURS` by nearest hour put dawn's border at 7.5h and reached it
 *  back to 3am, so a 4am hand sat in dawn's color under a pitch-dark sky.)
 *
 *  Coupled to the Waystone's palette: the sky's golden windows (~5-7h and ~17-19h, `waystone-treatment`)
 *  must fall INSIDE `dawn` and `evening` respectively — the boundaries and the light are one design, and the
 *  dial's band arcs are drawn from exactly these numbers (mirrored in `WAYSTONE_PHASE_SPANS`, since `@orb/ui`
 *  may not import contracts, D54; pinned by a test that imports both). */
export const TIME_OF_DAY_RANGES: Readonly<Record<TimeOfDay, number>> = {
  dawn: 5,
  morning: 8,
  afternoon: 12,
  evening: 17,
  night: 20,
  midnight: 23,
};

const HOURS_IN_DAY = 24;

/** The label whose range CONTAINS this hour — the ONE derivation home (the banner, the reminder line, the
 *  delta's `time → night` transition and the scene tab's Time field all read through it, so no two surfaces
 *  can name the same clock differently). Wrap-aware by construction: the phase in force is the one with the
 *  LATEST start at or before the hour; before the day's first start, the last-starting phase is still running
 *  from yesterday. Order-independent — it reads the ranges, never the tuple's order. */
/** The label a CLOCK reads as, or `null` when it carries a day but no time — the ONE guard every surface
 *  calls instead of testing `clock.hour !== null` itself (the band, the reminder line, the delta's time
 *  transition, the Scene tab's Time field and the macro/CEL scene view all ask this one question). A `null`
 *  answer means "the story has not said what time it is", which every caller renders as absence, never as a
 *  substituted midnight. */
export function clockTimeOfDay(clock: RpgClockTime | null): TimeOfDay | null {
  if (clock === null || clock.hour === null) {
    return null;
  }
  return timeOfDayAtHour(clock.hour);
}

export function timeOfDayAtHour(hour: number): TimeOfDay {
  const h = ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
  let current: TimeOfDay | null = null;
  let currentStart = Number.NEGATIVE_INFINITY;
  let wrapping: TimeOfDay = TIME_OF_DAY[0];
  let wrappingStart = Number.NEGATIVE_INFINITY;
  for (const label of TIME_OF_DAY) {
    const start = TIME_OF_DAY_RANGES[label];
    if (start > wrappingStart) {
      wrappingStart = start;
      wrapping = label;
    }
    if (start <= h && start > currentStart) {
      currentStart = start;
      current = label;
    }
  }
  return current ?? wrapping;
}
