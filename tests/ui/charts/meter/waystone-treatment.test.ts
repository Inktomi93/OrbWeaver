// The Waystone's time × weather matrix (RV-10). The owner bar: a full variety of time-of-day and weather
// treatments, no combination falling through to a generic default — built as a CONTINUOUS time axis (the sky
// interpolates across an hour-keyed stop table; the sun/moon walks a computed arc) crossed with EIGHT discrete
// weather layer recipes. So this pins:
//   • the palette-stop TABLE — each stop's hour + its tokens (the palette is the design), monotonic + wrapping;
//   • the INTERPOLATION at representative hours — 6h golden, 12h day, 18h golden, 22h dark, plus the property
//     that every hour differs from its neighbour (the "every hour looks subtly different" claim);
//   • the CELESTIAL arc — sun by day, moon by night, rising left → peaking overhead → setting right, wrapping
//     across midnight;
//   • the eight WEATHER recipes — each layer slot present, each weather distinct on multiple axes;
//   • the dial's discrete label bands matching the contract's EXPLICIT `TIME_OF_DAY_RANGES` boundaries edge for
//     edge (the ring names what the band's TEXT names, and a band ARC starts where its time period starts).
import { TIME_OF_DAY, TIME_OF_DAY_HOURS, TIME_OF_DAY_RANGES, timeOfDayAtHour } from "@orb/contracts/rpg";
import type { WaystoneParticleLayer, WaystonePhase, WaystoneWeather } from "@orb/ui/meter";
import {
  handAngle,
  hourAngle,
  resolveWaystoneTreatment,
  WAYSTONE_PHASE_SPANS,
  WAYSTONE_PHASES,
  WAYSTONE_SKY_STOPS,
  WAYSTONE_WEATHERS,
  waystoneBandTint,
  waystoneCelestialAt,
  waystonePhaseAtHour,
  waystoneSkyAt,
  waystoneStarOpacityAt,
  waystoneWeatherRecipe,
} from "@orb/ui/meter";
import { expect, test } from "../../../support/fixtures.ts";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
/** Every color the matrix emits must be a token or a `color-mix` over tokens (D71). */
const TOKEN_COLOR_RE = /^(var\(--|color-mix\(in oklab,)/u;
/** An interpolated sky nests one mix over two token recipes — the tell that it blended, not snapped. */
const NESTED_MIX_RE = /^color-mix\(in oklab, color-mix\(/u;
const WASH_MIX_RE = /^color-mix\(in oklab,/u;
const BODY_RE = /^(sun|moon)$/u;

/** Is an angle inside the clockwise wedge from `from` to `to`? (Wrap-aware — a dial band may straddle 0°.) */
function withinWedge(angle: number, from: number, to: number): boolean {
  const span = (((to - from) % 360) + 360) % 360;
  const offset = (((angle - from) % 360) + 360) % 360;
  return offset <= (span === 0 ? 360 : span);
}

/** The particle layer of a weather that must HAVE one — throws (rather than optional-chaining) so a recipe
 *  that silently lost its particles fails loudly instead of comparing `undefined`s. */
function particlesOf(weather: WaystoneWeather): WaystoneParticleLayer {
  const particles = waystoneWeatherRecipe(weather).particles;
  if (particles === null) {
    throw new Error(`${weather} should carry a particle layer`);
  }
  return particles;
}

// ── The palette stop table ──────────────────────────────────────────────────────────────────────
test("the sky stop table is a valid 24h ramp: ascending hours, in range, every color a token or a token mix", () => {
  expect(WAYSTONE_SKY_STOPS.length).toBeGreaterThan(6);
  let previous = -1;
  for (const stop of WAYSTONE_SKY_STOPS) {
    expect(stop.hour, `stop ${stop.hour} out of order`).toBeGreaterThan(previous);
    expect(stop.hour).toBeLessThan(24);
    previous = stop.hour;
    for (const color of [stop.value.from, stop.value.to]) {
      expect(color, `stop ${stop.hour} emitted a raw color literal`).toMatch(TOKEN_COLOR_RE);
    }
    expect(Number.parseFloat(stop.value.cy)).toBeGreaterThanOrEqual(0);
    expect(Number.parseFloat(stop.value.cy)).toBeLessThanOrEqual(100);
  }
  // The table starts at midnight so the wrap-around segment (last stop → 0h) is the deep-night ramp.
  expect(WAYSTONE_SKY_STOPS[0]?.hour).toBe(0);
});

test("the sky is painted from the ATMOSPHERIC set, never the categorical chart ramp (the side-eye root cause)", () => {
  // The stone used to paint its sky with `--color-track-*` (a CATEGORICAL chart ramp) mixed toward
  // `--color-background` — which is theme-relative, so the Light seed rendered midnight LIGHTER than noon.
  // Every sky value now comes from the polarity-fixed `--color-sky-*` set.
  for (const hour of HOURS) {
    const sky = waystoneSkyAt(hour);
    for (const value of [sky.from, sky.to]) {
      expect(value, `hour ${hour} still borrows the chart ramp`).not.toContain("var(--color-track-");
      expect(value, `hour ${hour} mixes toward a theme-relative surface`).not.toContain("var(--color-background)");
      expect(value, `hour ${hour} is not atmospheric`).toContain("var(--color-sky-");
    }
  }
  // The NIGHT ANCHOR holds both ends of the night, so midnight can never out-lighten noon in any theme.
  expect(waystoneSkyAt(0).from).toContain("var(--color-sky-night)");
  expect(waystoneSkyAt(23).to).toContain("var(--color-sky-night)");
  expect(waystoneSkyAt(12).from).toContain("var(--color-sky-day");
});

test("the GOLDEN windows are real: ~5-7h and ~17-19h reach for the ember, the middle of the day never does", () => {
  // This is how dawn/dusk differentiation ships WITHOUT a `dusk` write-vocabulary member (owner ruling): the
  // golden hours are the only skies tinted with the atmospheric ember.
  for (const hour of [5.5, 6, 7, 17, 18, 18.5]) {
    expect(waystoneSkyAt(hour).from, `hour ${hour} should glow`).toContain("var(--color-sky-ember)");
  }
  // The deep ember (the fire ON the horizon) belongs ONLY to the golden windows — the afternoon carries a
  // trace of the plain ember as it warms toward evening, which is the atmosphere doing its job.
  for (const hour of [9, 10, 12]) {
    expect(waystoneSkyAt(hour).from, `hour ${hour} should NOT glow`).not.toContain("var(--color-sky-ember)");
  }
  for (const hour of [9, 12, 14, 15]) {
    expect(waystoneSkyAt(hour).from, `hour ${hour} should not carry horizon fire`).not.toContain("var(--color-sky-ember-deep)");
  }
  expect(waystoneSkyAt(5.5).from).toContain("var(--color-sky-ember-deep)");
  expect(waystoneSkyAt(18.5).from).toContain("var(--color-sky-ember-deep)");
  // Midday sits high (a dome), the golden hours sit low (light at the horizon) — the other golden-hour tell.
  expect(Number.parseFloat(waystoneSkyAt(12).cy)).toBeLessThan(40);
  expect(Number.parseFloat(waystoneSkyAt(6).cy)).toBeGreaterThan(60);
  expect(Number.parseFloat(waystoneSkyAt(18).cy)).toBeGreaterThan(60);
  // Deep night is the night anchor's own band — no ember anywhere in it.
  expect(waystoneSkyAt(22).from).toContain("var(--color-sky-night");
  expect(waystoneSkyAt(22).from).not.toContain("var(--color-sky-ember)");
});

test("the sky INTERPOLATES: an hour between two stops blends both, and every half-hour of the day differs", () => {
  // Exactly on a stop = that stop's recipe, untouched (no pointless wrapper mix).
  expect(waystoneSkyAt(12)).toEqual(WAYSTONE_SKY_STOPS.find((s) => s.hour === 12)?.value);
  // Between stops = a nested color-mix over BOTH neighbours — the browser blends it in oklab, so the
  // interpolated sky is still fully theme-reactive (no resolved RGB anywhere).
  const between = waystoneSkyAt(10.5);
  expect(between.from).toMatch(NESTED_MIX_RE);
  expect(between.from).toContain("var(--color-sky-day");
  // Every hour looks subtly different — no two adjacent half-hours resolve to the same sky.
  const seen = new Set<string>();
  for (let h = 0; h < 24; h += 0.5) {
    seen.add(JSON.stringify(waystoneSkyAt(h)));
  }
  expect(seen.size).toBe(48);
  // …and the axis WRAPS: 23:30 is a blend toward midnight, not a fallback.
  expect(waystoneSkyAt(23.5).from).toContain("color-mix");
  expect(waystoneSkyAt(24)).toEqual(waystoneSkyAt(0));
});

// ── The celestial arc — the clock a cold viewer reads ───────────────────────────────────────────
test("the sun holds the sky 05:00-19:00 and the moon holds the rest — the handover is the day's shape", () => {
  expect(waystoneCelestialAt(5).body).toBe("sun");
  expect(waystoneCelestialAt(12).body).toBe("sun");
  expect(waystoneCelestialAt(18.9).body).toBe("sun");
  expect(waystoneCelestialAt(19).body).toBe("moon");
  expect(waystoneCelestialAt(0).body).toBe("moon");
  expect(waystoneCelestialAt(4.9).body).toBe("moon");
});

test("both bodies walk a real arc: rising left, peaking overhead mid-watch, setting right (wrapping midnight)", () => {
  // The sun's x is strictly increasing across its watch, and its altitude peaks at solar noon.
  const daytime = [5, 7, 9, 12, 15, 17, 18.9];
  for (let i = 1; i < daytime.length; i++) {
    const previous = waystoneCelestialAt(daytime[i - 1] ?? 0);
    const current = waystoneCelestialAt(daytime[i] ?? 0);
    expect(current.x, `sun should move right from ${daytime[i - 1]} to ${daytime[i]}`).toBeGreaterThan(previous.x);
  }
  expect(waystoneCelestialAt(12).altitude).toBeGreaterThan(0.99);
  expect(waystoneCelestialAt(12).y).toBeLessThan(waystoneCelestialAt(6).y);
  expect(waystoneCelestialAt(6).y).toBeLessThan(60);
  // A low body is bigger and warmer (the horizon illusion); a high one is small and pale.
  expect(waystoneCelestialAt(6).r).toBeGreaterThan(waystoneCelestialAt(12).r);
  expect(waystoneCelestialAt(6).fill).toContain("var(--color-sky-ember)");
  expect(waystoneCelestialAt(12).fill).toContain("var(--color-sky-star)");
  // The moon's watch wraps midnight: it rises at 19:00 on the left and peaks around 00:00.
  expect(waystoneCelestialAt(20).x).toBeLessThan(waystoneCelestialAt(0).x);
  expect(waystoneCelestialAt(0).x).toBeLessThan(waystoneCelestialAt(3).x);
  expect(waystoneCelestialAt(0).altitude).toBeGreaterThan(0.99);
  // Every color it emits stays a token recipe (D71 — the interpolated tint included).
  for (const hour of HOURS) {
    expect(waystoneCelestialAt(hour).fill).toMatch(TOKEN_COLOR_RE);
  }
});

test("STARS ARE ATTENUATED BY THE DECK ABOVE THEM — a clear night is full of them, a storm has none", () => {
  // They used to shine at 0.96 straight through a rainstorm: `starOpacity` never met the cloud layer.
  const clearNight = resolveWaystoneTreatment(0, "clear").starOpacity;
  const cloudyNight = resolveWaystoneTreatment(0, "cloudy").starOpacity;
  const stormNight = resolveWaystoneTreatment(0, "storm").starOpacity;
  expect(clearNight).toBe(1);
  expect(cloudyNight).toBeLessThan(clearNight);
  expect(stormNight).toBeLessThan(cloudyNight);
  expect(stormNight).toBeLessThan(0.1);
  // Daylight stays starless whatever the weather.
  expect(resolveWaystoneTreatment(12, "clear").starOpacity).toBe(0);
  expect(resolveWaystoneTreatment(12, "storm").starOpacity).toBe(0);
});

/** The DECKLESS pair — the two members that paint no cloud slots, and the only two, for OPPOSITE reasons:
 *  `clear` is an unveiled sky (nothing up there), `indoors` is an occluded one (no sky to read at all). Every
 *  other member is a state OF the sky and owes a deck. Named once so both invariants below carve the same
 *  hole and neither can silently widen. */
const DECKLESS_WEATHERS: readonly WaystoneWeather[] = ["clear", "indoors"];

test("`clear` means CLEAR — zero cloud slots (a lone 22%-opacity puff read as a smudge, not weather)", () => {
  expect(waystoneWeatherRecipe("clear").clouds.count).toBe(0);
  // `indoors` is deckless too, and that is the POINT: painting a cloud deck on a scene that cannot see the
  // sky would be the stone asserting weather nobody in the fiction can observe.
  expect(waystoneWeatherRecipe("indoors").clouds.count).toBe(0);
  for (const weather of WAYSTONE_WEATHERS.filter((w) => !DECKLESS_WEATHERS.includes(w))) {
    expect(waystoneWeatherRecipe(weather).clouds.count, `${weather} deck`).toBeGreaterThan(0);
  }
});

test("the cloud deck's DARK tone is darker than its light one (they were inverted — storm clouds shone)", () => {
  // Structural: the tones are named atmospheric tokens, and the dark one is the dedicated storm token.
  expect(waystoneWeatherRecipe("storm").clouds.tone).toBe("dark");
  expect(waystoneWeatherRecipe("cloudy").clouds.tone).toBe("light");
  expect(waystoneWeatherRecipe("storm").clouds.opacity).toBeGreaterThan(waystoneWeatherRecipe("cloudy").clouds.opacity);
});

test("the raw star ramp is lit through the night, dark through the day, and continuous across both edges", () => {
  expect(waystoneStarOpacityAt(0)).toBe(1);
  expect(waystoneStarOpacityAt(2)).toBe(1);
  expect(waystoneStarOpacityAt(12)).toBe(0);
  expect(waystoneStarOpacityAt(14)).toBe(0);
  // Fading out through dawn, fading back in through dusk — never a step.
  expect(waystoneStarOpacityAt(5.5)).toBeLessThan(waystoneStarOpacityAt(4));
  expect(waystoneStarOpacityAt(7)).toBeLessThan(waystoneStarOpacityAt(5.5));
  expect(waystoneStarOpacityAt(19)).toBeGreaterThan(waystoneStarOpacityAt(17.5));
  expect(waystoneStarOpacityAt(21)).toBeGreaterThan(waystoneStarOpacityAt(19));
  for (const hour of HOURS) {
    expect(waystoneStarOpacityAt(hour)).toBeGreaterThanOrEqual(0);
    expect(waystoneStarOpacityAt(hour)).toBeLessThanOrEqual(1);
  }
});

// ── The discrete weather axis ───────────────────────────────────────────────────────────────────
test("EXHAUSTIVE: all nine weather recipes carry every layer slot, and no two are the same stack", () => {
  const seen = new Map<string, string>();
  for (const weather of WAYSTONE_WEATHERS) {
    const recipe = waystoneWeatherRecipe(weather);
    // Every weather has a cloud deck and an overlay identity — a missing layer is the silent-default failure
    // mode this table exists to make impossible.
    expect(recipe.clouds.count, `${weather} deck`).toBeGreaterThanOrEqual(0);
    expect(recipe.overlay, `${weather} has no overlay identity`).not.toBe(undefined);
    const sig = JSON.stringify(recipe);
    expect(seen.get(sig), `${weather} paints the same stack as ${seen.get(sig)}`).toBeUndefined();
    seen.set(sig, weather);
  }
  expect(seen.size).toBe(WAYSTONE_WEATHERS.length);
  // Three INDEPENDENT signals per weather (deck · veil · overlay), so a 64px stone still reads "storm" vs
  // "rain" when individual drops are sub-pixel.
  expect(new Set(WAYSTONE_WEATHERS.map((w) => waystoneWeatherRecipe(w).celestialOpacity)).size).toBe(WAYSTONE_WEATHERS.length);
  // The DECK axis carries a distinct signature per member that HAS a deck. The deckless pair is excluded by
  // construction (both are `count: 0` — an empty deck cannot be a signal), and they are held apart on the two
  // remaining axes instead, asserted directly below. Widening this exclusion is how the 64px read dies, so it
  // is pinned to exactly the two.
  const decked = WAYSTONE_WEATHERS.filter((w) => !DECKLESS_WEATHERS.includes(w));
  expect(new Set(decked.map((w) => JSON.stringify(waystoneWeatherRecipe(w).clouds))).size).toBe(decked.length);
  // `clear` is a real treatment (an unveiled sky), never a fallthrough.
  expect(waystoneWeatherRecipe("clear").overlay).toBe("none");
  expect(waystoneWeatherRecipe("clear").wash).toBeNull();
  expect(waystoneWeatherRecipe("clear").particles).toBeNull();
  expect(waystoneWeatherRecipe(null)).toEqual(waystoneWeatherRecipe("clear"));
  // …and `indoors` is its OPPOSITE, not its twin: same empty deck, but the heaviest wash in the table and a
  // celestial all but extinguished. That is the whole 64px read for the occlusion member, so it is asserted
  // rather than left to the recipe-JSON distinctness above (which a one-character wash edit would satisfy).
  const indoors = waystoneWeatherRecipe("indoors");
  expect(indoors.overlay).toBe("indoors");
  expect(indoors.particles).toBeNull();
  expect(indoors.bands).toBeNull();
  expect(indoors.celestialOpacity).toBeLessThan(waystoneWeatherRecipe("storm").celestialOpacity);
  // The hour must still be READABLE indoors — the dial's primary job does not stop at a door.
  expect(indoors.celestialOpacity).toBeGreaterThan(0);
  const heaviest = Math.max(...WAYSTONE_WEATHERS.map((w) => waystoneWeatherRecipe(w).wash?.opacity ?? 0));
  expect(indoors.wash?.opacity).toBe(heaviest);
});

test("the storm is the loudest cell on every air axis; the particle layers are animatable by construction", () => {
  const storm = waystoneWeatherRecipe("storm");
  const rain = waystoneWeatherRecipe("rain");
  expect(storm.clouds.drift).toBe("fast");
  expect(storm.clouds.tone).toBe("dark");
  expect(storm.lightning).toBe(true);
  expect(rain.lightning).toBe(false);
  expect(storm.celestialOpacity).toBeLessThan(rain.celestialOpacity);
  expect(particlesOf("storm").columns).toBeGreaterThan(particlesOf("rain").columns);
  expect(particlesOf("storm").slant).toBeGreaterThan(particlesOf("rain").slant);
  for (const weather of WAYSTONE_WEATHERS) {
    const particles = waystoneWeatherRecipe(weather).particles;
    if (particles === null) {
      continue;
    }
    // The fall keyframe translates by exactly one pitch — a zero pitch would freeze the loop.
    expect(particles.pitch, `${weather} pitch`).toBeGreaterThan(0);
    expect(particles.columns, `${weather} columns`).toBeGreaterThan(0);
    // Rain draws streaks (a length + a slant); motes have neither.
    expect(particles.kind === "rain" ? particles.length > 0 : particles.length === 0).toBe(true);
  }
  expect(particlesOf("snow").sway).toBe(true);
  expect(particlesOf("snow").speed).toBe("slow");
  expect(particlesOf("rain").speed).toBe("fast");
  // The enveloping bands are the OTHER geometry family — fog breathes, wind gusts.
  expect(waystoneWeatherRecipe("fog").bands).toEqual({ kind: "fog", breathe: true });
  expect(waystoneWeatherRecipe("wind").bands).toEqual({ kind: "wind", breathe: false });
  expect(waystoneWeatherRecipe("rain").bands).toBeNull();
  // Every wash that exists is a token recipe.
  const washFills = WAYSTONE_WEATHERS.map((w) => waystoneWeatherRecipe(w).wash).filter((wash) => wash !== null);
  expect(washFills.length).toBeGreaterThan(0);
  expect(washFills.every((wash) => WASH_MIX_RE.test(wash.fill))).toBe(true);
});

test("the composed treatment is the two axes joined: any hour × any weather is a complete, distinct stack", () => {
  const seen = new Set<string>();
  for (const hour of HOURS) {
    for (const weather of WAYSTONE_WEATHERS) {
      const t = resolveWaystoneTreatment(hour, weather);
      expect(t.sky.from).toMatch(TOKEN_COLOR_RE);
      expect(t.celestial.body).toMatch(BODY_RE);
      expect(t.overlay).toBe(waystoneWeatherRecipe(weather).overlay);
      seen.add(JSON.stringify(t));
    }
  }
  expect(seen.size).toBe(HOURS.length * WAYSTONE_WEATHERS.length);
  expect(resolveWaystoneTreatment(21, null)).toEqual(resolveWaystoneTreatment(21, "clear"));
});

// ── The dial's discrete label bands ─────────────────────────────────────────────────────────────
test("the dial's hour buckets ARE the contract's TIME_OF_DAY_RANGES label for every hour of the day", () => {
  // TIME_OF_DAY_RANGES = the phase START hours: midnight 23 → dawn 5 → morning 8 → afternoon 12 → evening 17
  // → night 20, wrap-aware (midnight spans 23h-5h). 4am is MIDNIGHT — under the old nearest-representative-hour
  // inversion it was "dawn", which put a dawn-colored band under a pitch-dark sky.
  const expected: readonly WaystonePhase[] = [
    "midnight",
    "midnight",
    "midnight",
    "midnight",
    "midnight",
    "dawn",
    "dawn",
    "dawn",
    "morning",
    "morning",
    "morning",
    "morning",
    "afternoon",
    "afternoon",
    "afternoon",
    "afternoon",
    "afternoon",
    "evening",
    "evening",
    "evening",
    "night",
    "night",
    "night",
    "midnight",
  ];
  expect(HOURS.map((hour) => waystonePhaseAtHour(hour))).toEqual([...expected]);
  // The ui MIRROR and the contract's own derivation are the same function of the hour — the D54 seal means the
  // table is duplicated, so this is the pin that keeps the ring and the band's TEXT from ever drifting apart.
  for (const hour of HOURS) {
    expect(waystonePhaseAtHour(hour), `hour ${hour}: ring and text must name the same phase`).toBe(timeOfDayAtHour(hour));
  }
});

test("every dial band carries its OWN identity hue, derived from the sky it paints (never a grey ring)", () => {
  // The owner's read of the first build: the ring showed "two colors — grey + dark blue", because only the
  // current band was tinted. A dial has SECTIONS: all six bands are their own color, and the derivation is the
  // sky stop table sampled at the band's midpoint, so the ring and the disc can never disagree.
  const tints = WAYSTONE_PHASES.map((phase) => waystoneBandTint(phase));
  expect(new Set(tints).size).toBe(WAYSTONE_PHASES.length);
  for (const tint of tints) {
    expect(tint).toMatch(TOKEN_COLOR_RE);
    // No band falls back to a neutral: a grey would be a `--color-muted`/`--color-border` recipe.
    expect(tint).not.toContain("var(--color-muted)");
    expect(tint).not.toContain("var(--color-border)");
    // …and every one is ATMOSPHERIC, so the ring and the disc share one palette.
    expect(tint).toContain("var(--color-sky-");
  }
  // DERIVED, not re-authored: each band's tint IS the sky's `from` at that band's midpoint hour.
  for (const span of WAYSTONE_PHASE_SPANS) {
    expect(waystoneBandTint(span.phase), `${span.phase} tint must come from the stop table`).toBe(waystoneSkyAt((span.from + span.to) / 2).from);
  }
  // …and the identities are the ones the day actually has: the golden bands reach for the ember token, the
  // dark bands for the night track. (dawn/evening being neighbours in hue is honest — their dial POSITIONS,
  // opposite sides of the ring, are what separate them.)
  expect(waystoneBandTint("dawn")).toContain("var(--color-sky-ember)");
  expect(waystoneBandTint("evening")).toContain("var(--color-sky-ember)");
  expect(waystoneBandTint("afternoon")).toContain("var(--color-sky-day");
  expect(waystoneBandTint("afternoon")).not.toContain("var(--color-sky-ember-deep)");
  expect(waystoneBandTint("night")).toContain("var(--color-sky-night");
  expect(waystoneBandTint("midnight")).toContain("var(--color-sky-night)");
});

test("ONE BOUNDARY HOME: every band's arc EDGES are the contract's range boundaries, drawn through `hourAngle`", () => {
  // The owner's finding: the band edges used to be EMERGENT (the midpoints between two representative hours),
  // so dawn's arc reached back to ~3am. They are now EXPLICIT — `TIME_OF_DAY_RANGES` is the boundary truth and
  // the arc starts exactly where the time period starts. This asserts EQUALITY of the edges, not containment.
  // (The arc and the hand still agree only because both resolve through `hourAngle` — a second table with its
  // own origin is how a dial drifts out of agreement with its own pointer, so the angles go through it here.)
  for (const span of WAYSTONE_PHASE_SPANS) {
    const next = TIME_OF_DAY[(TIME_OF_DAY.indexOf(span.phase) + 1) % TIME_OF_DAY.length] ?? span.phase;
    expect(span.from, `${span.phase}'s arc must START at its range start`).toBe(TIME_OF_DAY_RANGES[span.phase]);
    // …and END where the NEXT phase begins (the tuple is in start order; the wrapping band's `to` is +24).
    const end = TIME_OF_DAY_RANGES[next];
    expect(span.to % HOURS.length, `${span.phase}'s arc must END at the next phase's start`).toBe(end);
    // The band's angular wedge, straight off the shared mapping — the rendered arc is drawn from these two.
    // Compared the way a dial actually works (clockwise sweep, wrap-aware): the afternoon band legitimately
    // straddles 12 o'clock and midnight straddles the bottom, so a plain >=/<= on raw degrees is the wrong
    // question. Every hour the band owns must sit inside the arc the band draws.
    for (const hour of HOURS.filter((h) => waystonePhaseAtHour(h) === span.phase)) {
      expect(withinWedge(hourAngle(hour), hourAngle(span.from), hourAngle(span.to)), `${span.phase} at ${hour}h sits outside its own arc`).toBe(true);
    }
  }
  // WRITES CANNOT DISAGREE WITH LABELS: the hour a `timeOfDay` label puts on the clock reads back as that label.
  for (const label of TIME_OF_DAY) {
    expect(waystonePhaseAtHour(TIME_OF_DAY_HOURS[label]), `${label}'s representative hour must light ${label}'s arc`).toBe(label);
  }
  // PALETTE ↔ BOUNDARIES stay coupled: the sky's deliberate golden windows are what make dawn and dusk glow, so
  // they must fall INSIDE the dawn and evening bands — otherwise the ring says one thing and the light another.
  for (const hour of [5.5, 7]) {
    expect(waystonePhaseAtHour(hour), `the ${hour}h golden stop must sit in dawn`).toBe("dawn");
  }
  for (const hour of [17, 18.5]) {
    expect(waystonePhaseAtHour(hour), `the ${hour}h golden stop must sit in evening`).toBe("evening");
  }
});

test("the dial's cardinal angles are the clock everyone knows: noon UP, midnight DOWN, 06h LEFT, 18h RIGHT", () => {
  // Degrees clockwise from 12 o'clock (the SVG rotation the hand uses).
  expect(hourAngle(12)).toBe(0);
  expect(hourAngle(0)).toBe(180);
  expect(hourAngle(6)).toBe(270);
  expect(hourAngle(18)).toBe(90);
  // The hand's angle is the SAME function, minutes included — never a parallel derivation.
  expect(handAngle(12, 0)).toBe(hourAngle(12));
  expect(handAngle(21, 30)).toBe(hourAngle(21.5));
});

test("the dial's phase spans tile the whole 24h ring exactly once (no gap, no overlap, one arc per label)", () => {
  // The ring is a CIRCLE, so the tiling is head-to-tail from the first band's start all the way back round to
  // it — the last band (midnight) crosses the day line, which is why its `to` runs past 24 rather than being
  // cut into two arcs. Total swept span is exactly one revolution.
  const first = WAYSTONE_PHASE_SPANS[0];
  if (first === undefined) {
    throw new Error("the dial has no bands");
  }
  let cursor = first.from;
  for (const span of WAYSTONE_PHASE_SPANS) {
    expect(span.from).toBe(cursor);
    expect(span.to).toBeGreaterThan(span.from);
    cursor = span.to;
  }
  expect(cursor - first.from).toBe(HOURS.length);
  expect(new Set(WAYSTONE_PHASE_SPANS.map((s) => s.phase)).size).toBe(WAYSTONE_PHASES.length);
});
