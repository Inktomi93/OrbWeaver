// The Waystone's TIME × WEATHER matrix — pure data + total resolvers (RV-10). Component-free on purpose: the
// whole visual truth of the stone is a LAYER RECIPE (which sky, where the sun/moon sits, how lit the stars
// are, how many clouds and how fast they run, which particles fall and at what angle, which bands drift,
// whether lightning strikes, how much the weather veils the sky) — data a unit test can walk exhaustively.
//
// THE TWO AXES ARE DIFFERENT KINDS (owner ruling 2026-07-31):
//  • TIME is CONTINUOUS. The stone renders from `clock.hour` DIRECTLY, not from the six `TIME_OF_DAY` labels:
//    the sky interpolates across an hour-keyed stop table, and the sun/moon walks a real arc computed from the
//    hour. Every hour looks subtly different, and the deliberate GOLDEN stops (~5-7h and ~17-19h) make dawn
//    and dusk glow distinctly — which is how dawn/dusk differentiation ships WITHOUT growing the model's write
//    vocabulary (a `dusk` beside `evening` would just invite the model to dither between near-synonyms). The
//    labels stay what the band's TEXT says. In narrated mode a lite clock only ever holds a label's
//    representative hour (`TIME_OF_DAY_HOURS`) — that number is a perfectly good render input.
//  • WEATHER is DISCRETE — a CLOSED vocabulary owning the air layers, and it is now closed AT THE WIRE: the
//    caller hands over an already-canonical `WeatherType` (the model picks one; free phrasing rides the
//    ambient weather's `label`, which the band TEXT shows — text is the datum). `null` ⇒ the clear recipe
//    (§12.2.1 nullable-honesty). No binning lives here anymore — there is nothing left to bin.
//
// `@orb/ui` may not import `@orb/contracts` (the sealed-ui cake, D54), so the ONE thing this module mirrors
// from the contract is the PHASE BOUNDARY table used to light the dial's arcs (`WAYSTONE_PHASE_SPANS` ↔
// `TIME_OF_DAY_RANGES`), pinned edge-for-edge by a unit test that imports both. The weather axis needs no mirror: it is homed in
// `@orb/kit/weather` — reachable by ui AND contracts — and derived by identity below.
//
// Every color is a theme token or a `color-mix()` over tokens — INCLUDING the interpolation, which nests a
// `color-mix` over two token recipes rather than computing RGB in JS (zero raw literals, so any seed theme
// restyles the stone for free, D71, and the browser does the blending in oklab).

import type { WeatherType } from "@orb/kit/weather";
import { WEATHER_TYPES } from "@orb/kit/weather";

/** The dial's label bands — one member per `TIME_OF_DAY` label (the ring is the DISCRETE layer: it shows which
 *  named part of the day we are in, matching the band's text, while the sky reads the exact hour). */
export const WAYSTONE_PHASES = ["dawn", "morning", "afternoon", "evening", "night", "midnight"] as const;
export type WaystonePhase = (typeof WAYSTONE_PHASES)[number];

/** The CLOSED weather vocabulary — the `@orb/kit/weather` axis BY IDENTITY (never a re-spell; the contract's
 *  `RPG_WEATHER_TYPES` is the same tuple object). One recipe per member, `null` = clear. */
export const WAYSTONE_WEATHERS = WEATHER_TYPES;
export type WaystoneWeather = WeatherType;

/** The identity of a weather's air-layer stack (`none` = the unveiled sky IS the treatment, not a fallback) —
 *  one member per weather plus `none`, declared as the axis tuple so the union derives rather than re-spells.
 *  `indoors` is its own identity rather than `none`: the stone is not showing an unveiled sky there, it is
 *  showing that no sky is legible from where the scene stands — and `data-weather` is the rendered read. */
const WAYSTONE_OVERLAY_KINDS = ["none", "clouds", "rain", "storm", "snow", "fog", "wind", "ash", "indoors"] as const;
export type WaystoneOverlayKind = (typeof WAYSTONE_OVERLAY_KINDS)[number];

/** The sky disc's radial-gradient recipe — `cy` puts the light source low (a dawn/dusk glow at the horizon) or
 *  high (a midday/midnight dome). Interpolated per hour; a phase change crossfades between two of these. */
export interface WaystoneSky {
  readonly from: string;
  readonly to: string;
  readonly cy: string;
}

/** The sun or moon at its computed point on the day's arc — the stone's primary "what time is it" read. Both
 *  the position and the tint are hour-continuous (a low body is bigger and warmer; a high one small + pale). */
export interface WaystoneCelestial {
  readonly body: "sun" | "moon";
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly fill: string;
  /** 0 at the horizon → 1 at the arc's peak; drives the glow's strength. */
  readonly altitude: number;
}

/** The drifting cloud deck — present in EVERY weather, its density/speed/tone the weather's coarsest read. */
export interface WaystoneCloudLayer {
  readonly count: number;
  readonly opacity: number;
  readonly drift: "slow" | "mid" | "fast";
  readonly tone: "light" | "dark";
}

/** The falling-particle field. `pitch` is the lattice spacing the fall animation translates by (exactly one
 *  pitch per cycle ⇒ a seamless loop); `slant` angles the streak; `sway` adds the lateral drift snow needs. */
export interface WaystoneParticleLayer {
  readonly kind: "rain" | "snow" | "ash";
  readonly columns: number;
  readonly pitch: number;
  readonly speed: "fast" | "mid" | "slow";
  readonly slant: number;
  readonly length: number;
  readonly sway: boolean;
}

/** Horizontal weather that ENVELOPS the place (drawn in front of the horizon silhouette, not falling on it). */
export interface WaystoneBandLayer {
  readonly kind: "fog" | "wind";
  readonly breathe: boolean;
}

/** The weather's veil over the whole sky — the second half of "storm at noon must not look like clear at noon". */
interface WaystoneWash {
  readonly fill: string;
  readonly opacity: number;
}

/** The WEATHER half of a cell: the air layers. */
export interface WaystoneWeatherRecipe {
  readonly overlay: WaystoneOverlayKind;
  readonly clouds: WaystoneCloudLayer;
  readonly particles: WaystoneParticleLayer | null;
  readonly bands: WaystoneBandLayer | null;
  readonly lightning: boolean;
  readonly wash: WaystoneWash | null;
  /** How much of the sun/moon survives the weather (1 = unveiled, 0.15 = a smudge behind the storm). */
  readonly celestialOpacity: number;
}

/** One resolved cell: the continuous backdrop for this hour + the discrete air layers for this weather. */
export interface WaystoneTreatment extends WaystoneWeatherRecipe {
  readonly sky: WaystoneSky;
  readonly celestial: WaystoneCelestial;
  /** Group opacity of the star field — a transition, so stars fade in through dusk and out through dawn. */
  readonly starOpacity: number;
}

// ─── The interpolation primitive ──────────────────────────────────────────────────────────────────
const HOURS_IN_DAY = 24;
const PCT = 100;
const MIX_PRECISION = 1;

/** Blend two token color recipes in oklab. The browser does the blending — we never resolve a token to RGB in
 *  JS, so the output stays theme-reactive (and a seed theme swap restyles a mid-interpolation sky for free). */
function mixColor(a: string, b: string, t: number): string {
  if (t <= 0) {
    return a;
  }
  if (t >= 1) {
    return b;
  }
  return `color-mix(in oklab, ${a} ${((1 - t) * PCT).toFixed(MIX_PRECISION)}%, ${b})`;
}

/** Find the pair of stops bracketing `hour` on a 24h wrap-around table, plus the 0-1 position between them. */
function bracket<T>(stops: readonly { readonly hour: number; readonly value: T }[], hour: number): { readonly a: T; readonly b: T; readonly t: number } {
  const h = ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
  const last = stops.at(-1) ?? stops[0];
  if (last === undefined || stops[0] === undefined) {
    throw new Error("waystone: empty stop table");
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (a !== undefined && b !== undefined && h >= a.hour && h < b.hour) {
      return { a: a.value, b: b.value, t: (h - a.hour) / (b.hour - a.hour) };
    }
  }
  // Past the final stop: wrap around to the first (the table's midnight end is its midnight start).
  const span = HOURS_IN_DAY - last.hour + stops[0].hour;
  return { a: last.value, b: stops[0].value, t: span === 0 ? 0 : (h - last.hour) / span };
}

// ─── The SKY stop table — the continuous time axis ────────────────────────────────────────────────
// Deliberate GOLDEN windows at ~5-7h and ~17-19h: those stops reach for `--color-primary` (the ember), which
// nothing between 8h and 16h does — that contrast IS the dawn/dusk differentiation, and the test asserts it.
const SKY_STOPS: readonly { readonly hour: number; readonly value: WaystoneSky }[] = [
  { hour: 0, value: { from: "var(--color-sky-night)", to: "color-mix(in oklab, var(--color-sky-night) 82%, black)", cy: "24%" } },
  { hour: 4, value: { from: "color-mix(in oklab, var(--color-sky-night) 88%, var(--color-sky-night-horizon))", to: "var(--color-sky-night)", cy: "30%" } },
  {
    hour: 5.5,
    value: {
      from: "color-mix(in oklab, var(--color-sky-ember) 55%, var(--color-sky-ember-deep))",
      to: "color-mix(in oklab, var(--color-sky-night-horizon) 70%, var(--color-sky-twilight))",
      cy: "82%",
    },
  },
  {
    hour: 7,
    value: {
      from: "color-mix(in oklab, var(--color-sky-ember) 70%, var(--color-sky-day-horizon))",
      to: "color-mix(in oklab, var(--color-sky-day) 60%, var(--color-sky-twilight))",
      cy: "70%",
    },
  },
  { hour: 9, value: { from: "color-mix(in oklab, var(--color-sky-day-horizon) 60%, var(--color-sky-day))", to: "var(--color-sky-day)", cy: "56%" } },
  { hour: 12, value: { from: "var(--color-sky-day-horizon)", to: "var(--color-sky-day)", cy: "28%" } },
  { hour: 15, value: { from: "color-mix(in oklab, var(--color-sky-day-horizon) 80%, var(--color-sky-ember))", to: "var(--color-sky-day)", cy: "40%" } },
  {
    hour: 17,
    value: {
      from: "color-mix(in oklab, var(--color-sky-ember) 80%, var(--color-sky-day-horizon))",
      to: "color-mix(in oklab, var(--color-sky-day) 55%, var(--color-sky-twilight))",
      cy: "76%",
    },
  },
  {
    hour: 18.5,
    value: {
      from: "color-mix(in oklab, var(--color-sky-ember) 62%, var(--color-sky-ember-deep))",
      to: "color-mix(in oklab, var(--color-sky-twilight) 78%, var(--color-sky-night))",
      cy: "86%",
    },
  },
  { hour: 20, value: { from: "color-mix(in oklab, var(--color-sky-twilight) 62%, var(--color-sky-night))", to: "var(--color-sky-night)", cy: "60%" } },
  { hour: 22, value: { from: "var(--color-sky-night-horizon)", to: "var(--color-sky-night)", cy: "34%" } },
];

/** The sky at an exact hour — the two bracketing stops, blended. Exactly ON a stop returns that stop's recipe
 *  untouched (no wrapper mix, no reformatted `cy` — the authored palette is what paints). */
export function waystoneSkyAt(hour: number): WaystoneSky {
  const { a, b, t } = bracket(SKY_STOPS, hour);
  if (t <= 0) {
    return a;
  }
  if (t >= 1) {
    return b;
  }
  return {
    from: mixColor(a.from, b.from, t),
    to: mixColor(a.to, b.to, t),
    cy: `${(Number.parseFloat(a.cy) + (Number.parseFloat(b.cy) - Number.parseFloat(a.cy)) * t).toFixed(MIX_PRECISION)}%`,
  };
}

/** The stop table, exported so the test can pin each stop's hour + tokens (the palette IS the design). */
export const WAYSTONE_SKY_STOPS = SKY_STOPS;

// ─── The celestial arc — the clock a cold viewer reads ────────────────────────────────────────────
const SUNRISE = 5;
const SUNSET = 19;
const DAY_SPAN = SUNSET - SUNRISE;
const NIGHT_SPAN = HOURS_IN_DAY - DAY_SPAN;
const ARC_LEFT = 22;
const ARC_WIDTH = 52;
const ARC_BASE_Y = 54;
const ARC_RISE = 28;
const BODY_R_LOW = 6.4;
const BODY_R_SHRINK = 0.9;

// The sun/moon ride the ATMOSPHERIC set too — a low sun is ember, a high one is near-white starlight, and the
// moon is starlight cooled toward the night anchor. Polarity-fixed like the sky they hang in.
const SUN_LOW = "var(--color-sky-ember)";
const SUN_HIGH = "color-mix(in oklab, var(--color-sky-star) 78%, var(--color-sky-ember))";
const MOON_LOW = "color-mix(in oklab, var(--color-sky-star) 62%, var(--color-sky-twilight))";
const MOON_HIGH = "color-mix(in oklab, var(--color-sky-star) 88%, var(--color-sky-night-horizon))";

/** The sun (05:00-19:00) or the moon (19:00-05:00) at its exact point on the arc: rises left, peaks overhead
 *  at the middle of its watch, sets right. Continuous in the hour, so ANY advance slides it visibly. */
export function waystoneCelestialAt(hour: number): WaystoneCelestial {
  const h = ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
  const isDay = h >= SUNRISE && h < SUNSET;
  const u = isDay ? (h - SUNRISE) / DAY_SPAN : (((h - SUNSET + HOURS_IN_DAY) % HOURS_IN_DAY) % HOURS_IN_DAY) / NIGHT_SPAN;
  const altitude = Math.sin(Math.PI * u);
  return {
    body: isDay ? "sun" : "moon",
    x: ARC_LEFT + ARC_WIDTH * u,
    y: ARC_BASE_Y - ARC_RISE * altitude,
    r: BODY_R_LOW - BODY_R_SHRINK * altitude,
    fill: isDay ? mixColor(SUN_LOW, SUN_HIGH, altitude) : mixColor(MOON_LOW, MOON_HIGH, altitude),
    altitude,
  };
}

// ─── The star ramp — lit through the night, out through the day ───────────────────────────────────
const STAR_STOPS: readonly { readonly hour: number; readonly value: number }[] = [
  { hour: 0, value: 1 },
  { hour: 4, value: 1 },
  { hour: 5.5, value: 0.5 },
  { hour: 7, value: 0.08 },
  { hour: 8, value: 0 },
  { hour: 16, value: 0 },
  { hour: 17.5, value: 0.12 },
  { hour: 19, value: 0.45 },
  { hour: 20.5, value: 0.8 },
  { hour: 22, value: 1 },
];

/** Star-field opacity at an exact hour (0 in daylight) — the darkness ramp, transitioned in the component. */
export function waystoneStarOpacityAt(hour: number): number {
  const { a, b, t } = bracket(STAR_STOPS, hour);
  return Number.parseFloat((a + (b - a) * t).toFixed(2));
}

// ─── The nine weathers (the DISCRETE axis) ────────────────────────────────────────────────────────
const WEATHER_RECIPES: Readonly<Record<WaystoneWeather, WaystoneWeatherRecipe>> = {
  // `clear` means CLEAR: zero cloud slots (a lone 22%-opacity puff read as a smudge, not weather).
  clear: {
    overlay: "none",
    clouds: { count: 0, opacity: 0, drift: "slow", tone: "light" },
    particles: null,
    bands: null,
    lightning: false,
    wash: null,
    celestialOpacity: 1,
  },
  cloudy: {
    overlay: "clouds",
    clouds: { count: 4, opacity: 0.7, drift: "mid", tone: "light" },
    particles: null,
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-sky-cloud) 70%, var(--color-sky-cloud-dark))", opacity: 0.24 },
    celestialOpacity: 0.5,
  },
  rain: {
    overlay: "rain",
    clouds: { count: 3, opacity: 0.62, drift: "mid", tone: "dark" },
    particles: { kind: "rain", columns: 5, pitch: 12, speed: "fast", slant: 2.6, length: 6, sway: false },
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-sky-rain) 55%, var(--color-sky-cloud-dark))", opacity: 0.34 },
    celestialOpacity: 0.28,
  },
  storm: {
    overlay: "storm",
    clouds: { count: 4, opacity: 0.82, drift: "fast", tone: "dark" },
    particles: { kind: "rain", columns: 7, pitch: 10, speed: "fast", slant: 4.6, length: 7, sway: false },
    bands: null,
    lightning: true,
    wash: { fill: "color-mix(in oklab, var(--color-sky-cloud-dark) 82%, var(--color-sky-night))", opacity: 0.5 },
    celestialOpacity: 0.12,
  },
  snow: {
    overlay: "snow",
    clouds: { count: 3, opacity: 0.5, drift: "slow", tone: "light" },
    particles: { kind: "snow", columns: 5, pitch: 16, speed: "slow", slant: 0, length: 0, sway: true },
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-sky-cloud) 80%, var(--color-sky-rain))", opacity: 0.22 },
    celestialOpacity: 0.45,
  },
  // Fog is a VEIL, not four bars: a heavy wash plus two wide, slow, low-opacity banks (the bars read as a
  // skeleton loader). `breathe` pulses the banks' opacity so the murk moves.
  fog: {
    overlay: "fog",
    clouds: { count: 2, opacity: 0.34, drift: "slow", tone: "light" },
    particles: null,
    bands: { kind: "fog", breathe: true },
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-sky-cloud) 62%, var(--color-sky-rain))", opacity: 0.46 },
    celestialOpacity: 0.2,
  },
  // Wind is MOTION, not glyphs: a fast-drifting deck, leaned streaks, and two stretched low-opacity banks.
  wind: {
    overlay: "wind",
    clouds: { count: 3, opacity: 0.45, drift: "fast", tone: "light" },
    particles: null,
    bands: { kind: "wind", breathe: false },
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-sky-cloud) 55%, var(--color-sky-day-horizon))", opacity: 0.12 },
    celestialOpacity: 0.8,
  },
  ash: {
    overlay: "ash",
    clouds: { count: 3, opacity: 0.55, drift: "mid", tone: "dark" },
    particles: { kind: "ash", columns: 6, pitch: 10, speed: "mid", slant: 1, length: 0, sway: true },
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-sky-ash) 70%, var(--color-sky-ember-deep))", opacity: 0.3 },
    celestialOpacity: 0.3,
  },
  // `indoors` is the OCCLUSION member, not a ninth sky: the scene is enclosed and no sky is legible from it.
  // So every AIR layer is absent (there is no air to read — clouds/particles/bands would be a claim about a
  // sky nobody can see) and the wash is the heaviest in the table, dimming the hour's backdrop the way a wall
  // does. The sun/moon is not erased outright — `0.1` leaves the faintest trace, because the hour is still
  // TRUE indoors and the dial is still telling you what time it is; that is the one read the stone must not
  // lose here. Deliberately NOT `celestialOpacity: 0` for that reason.
  indoors: {
    overlay: "indoors",
    clouds: { count: 0, opacity: 0, drift: "slow", tone: "light" },
    particles: null,
    bands: null,
    lightning: false,
    wash: { fill: "color-mix(in oklab, var(--color-sky-cloud-dark) 60%, var(--color-sky-night))", opacity: 0.58 },
    celestialOpacity: 0.1,
  },
};

/** The air-layer recipe for a weather (`null` ⇒ clear). TOTAL by construction — an exhaustive Record over the
 *  union, so a new weather member fails tsc here rather than painting a silent default. */
export function waystoneWeatherRecipe(weather: WaystoneWeather | null): WaystoneWeatherRecipe {
  return WEATHER_RECIPES[weather ?? "clear"];
}

/** Resolve the full stack for an exact hour and a weather: the continuous backdrop + the discrete air layers. */
export function resolveWaystoneTreatment(hour: number, weather: WaystoneWeather | null): WaystoneTreatment {
  const recipe = waystoneWeatherRecipe(weather);
  return {
    ...recipe,
    sky: waystoneSkyAt(hour),
    celestial: waystoneCelestialAt(hour),
    // Stars are ATTENUATED by the deck above them — a clear night is full of stars, a storm has none. (They
    // used to shine at full strength straight through a rainstorm, which is the tell of two layers that were
    // never introduced to each other.)
    starOpacity: Number.parseFloat((waystoneStarOpacityAt(hour) * cloudBreak(recipe.clouds)).toFixed(2)),
  };
}

/** How much sky the cloud deck LEAVES OPEN — 1 under a clear sky, ~0 under a storm. */
function cloudBreak(clouds: WaystoneCloudLayer): number {
  const cover = Math.min(1, (clouds.count / CLOUD_SLOT_COUNT) * clouds.opacity * CLOUD_COVER_GAIN);
  return Math.max(0, 1 - cover);
}
const CLOUD_SLOT_COUNT = 4;
const CLOUD_COVER_GAIN = 1.2;

// ─── The dial ring's label arcs (the DISCRETE time layer) ─────────────────────────────────────────
// These mirror the contract's TIME_OF_DAY_RANGES — the EXPLICIT phase boundaries (dawn 5 · morning 8 ·
// afternoon 12 · evening 17 · night 20 · midnight 23), so a band arc STARTS exactly where its time period
// starts and the arc the marker sits in is the phase the band's TEXT names. `midnight` is the WRAPPING band:
// it runs 23h → 5h across the day line, expressed as one span with `to` past 24 (every angle goes through
// `hourAngle`, which is modulo — so the arc draws correctly straight through the bottom of the dial).
// The boundaries and the sky palette are ONE design: the golden windows (~5-7h / ~17-19h) fall inside `dawn`
// and `evening`. A unit test imports the contract and pins both relationships.

/** One dial segment: the label band it belongs to and the hour span it covers (24h dial, noon at the top).
 *  `to` may exceed 24 for the band that crosses the day line — the span is always `to - from` hours long. */
export interface WaystonePhaseSpan {
  readonly phase: WaystonePhase;
  readonly from: number;
  readonly to: number;
}

export const WAYSTONE_PHASE_SPANS: readonly WaystonePhaseSpan[] = [
  { phase: "dawn", from: 5, to: 8 },
  { phase: "morning", from: 8, to: 12 },
  { phase: "afternoon", from: 12, to: 17 },
  { phase: "evening", from: 17, to: 20 },
  { phase: "night", from: 20, to: 23 },
  { phase: "midnight", from: 23, to: 29 },
];

/** The label band whose dial segment contains this hour — drives which arc is LIT (the marker always sits on
 *  the lit arc, so the ring reads "we are here, in this named part of the day"). Wrap-aware: an hour before
 *  the day's first band start belongs to the band still running from yesterday (`h + 24` finds it). */
export function waystonePhaseAtHour(hour: number): WaystonePhase {
  const h = ((hour % HOURS_IN_DAY) + HOURS_IN_DAY) % HOURS_IN_DAY;
  const span = WAYSTONE_PHASE_SPANS.find((s) => (h >= s.from && h < s.to) || (h + HOURS_IN_DAY >= s.from && h + HOURS_IN_DAY < s.to));
  return span?.phase ?? "midnight";
}

/** A band's IDENTITY hue: the sky this part of the day actually paints, sampled at the band's MIDPOINT hour.
 *  The dial is a real dial — every segment carries its own section color (dawn's golden window · morning's
 *  light air · the full-bright afternoon · evening's amber · night's deep blue · midnight's darkest indigo),
 *  never a neutral grey. DERIVED from the one sky stop table, so a palette edit moves the ring and the disc
 *  together and they can never disagree (the §12.1.9 one-home rule for the stone). */
export function waystoneBandTint(phase: WaystonePhase): string {
  const span = WAYSTONE_PHASE_SPANS.find((s) => s.phase === phase);
  const midpoint = span === undefined ? 0 : (span.from + span.to) / 2;
  return waystoneSkyAt(midpoint).from;
}
