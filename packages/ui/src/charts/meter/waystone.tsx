// Waystone — the rpg panel's SIGNATURE composite (panel-redesign DESIGN.md §2/§12), rebuilt as a LAYERED
// LIVING CLOCK (owner RV-10 + the mid-flight upgrade: it is the focal element, so it gets the full system).
//
// THE LAYER STACK (each an independently animated, composited layer; recipe per cell in `waystone-treatment`):
//   0. DIAL RING — six label arcs tiling 24h (the `TIME_OF_DAY` bands the panel's TEXT names), the current one
//      LIT, + the two CARDINAL glyphs that teach the convention: a sun at the top (noon) and a crescent at
//      the bottom (midnight). This is a 24-HOUR dial, which reads as wrong against the 12h clock everyone
//      carries — so the ring says so itself, in two marks, instead of a tick scale nobody can decode.
//   1. SKY — ONE gradient whose stops are the HOUR's interpolated recipe (continuous, not six presets: every
//      hour looks subtly different, and the deliberate golden windows ~5-7h / ~17-19h make dawn and dusk glow
//      without needing a `dusk` write-vocabulary member). The stop colors TRANSITION, so time melts. Tokens
//      only, including the interpolation — a nested `color-mix`, blended by the browser in oklab (D71).
//   2. CELESTIAL — the sun/moon at its COMPUTED point on the arc (rises left, peaks overhead, sets right; low
//      is bigger + warmer, high is small + pale), with a breathing glow and, for the moon, a crescent + glint.
//      A time advance SLIDES it along the sky: this is the clock a cold viewer reads.
//   3. STARS — ten fixed stars, each twinkling on its OWN staggered delay (never in sync); the group's opacity
//      is the phase's darkness, transitioned, so they fade in at dusk and out at dawn.
//   4. CLOUDS — a deck present in every weather, its count/opacity/tone/drift-speed set by the weather
//      (clear = one slow wisp · overcast = a dense light deck · storm = fast + dark).
//   5. PARTICLES — rain streaks (angle + density by weather), snow (slower, with a lateral sway), ashfall.
//      The lattice translates by exactly one pitch per cycle, so the fall loops seamlessly.
//   6. WASH + LIGHTNING — the weather's full-sky veil (rain cools, storm darkens, ash warms) and, on a storm,
//      an occasional sky FLASH plus the drawn bolt.
//   7. HORIZON — the silhouette + one ember-lit gable: the depth anchor that makes the sky read as sky (and
//      the MA-3 minimap promise). Precipitation falls BEHIND it; fog/wind bands drift IN FRONT of it.
//   8. MARKER — the ember hour hand: drawn at 12 o'clock and ROTATED to the hour, so a time change swings it
//      around the dial along the ring instead of cutting across the face.
//
// THE MATRIX: a CONTINUOUS time axis × 8 discrete weathers, composed by `resolveWaystoneTreatment` — every
// combination a distinct stack, unit-tested (the stop table, the interpolation at representative hours, and
// every weather recipe). `clear` is a real treatment (an unveiled sky), not a fallback.
//
// A11Y + MOTION: the whole composite is `aria-hidden` DECORATION (tracker-kit a11y model) — the band's TEXT
// lines carry every datum, so the circle carries ZERO text. Motion is transform/opacity ONLY (GPU-composited,
// no layout thrash), CSS keyframes + transitions rather than any rAF loop, and it PAUSES entirely while the
// document is hidden (`animation-play-state`, one visibility subscription). `prefers-reduced-motion` collapses
// to static-but-still-distinct: every layer still paints, at its natural resting frame (drops at their lattice
// positions, bolt drawn, stars lit), and the lightning flash is removed outright rather than frozen mid-strike.
//
// Nullable-honesty (§12.2.1): `clock: null` (ambient clock unset) ⇒ no marker, no arcs, a plain dim sky.
// `weather: null` (an unresolvable free string) ⇒ the clear recipe; the band text still names it.
//
// Homed in charts/meter (the magnitude-display family; inline data-viz svg is legal only in charts/**, §13.7).
import type { ReactElement } from "react";
import { useCallback, useId, useState, useSyncExternalStore } from "react";
import { cn } from "#lib";
import { waystoneVariants } from "./variants";
import {
  C,
  CLIP_R,
  DISC_R,
  GABLE_FILL,
  GABLE_PATH,
  GABLE_WINDOW,
  GABLE_WINDOW_FILL,
  GABLE_WINDOW_FLOOR,
  GABLE_WINDOW_GAIN,
  HORIZON_FILL,
  handAngle,
  MARKER_HALO_R,
  MARKER_HALO_R_POS,
  MARKER_STROKE,
  MINUTES_IN_HOUR,
  MOON_MASK_R,
  MOON_MASK_SHIFT_X,
  MOON_MASK_SHIFT_Y,
  POINTER_PATH,
  RING_R,
  RING_W,
  SKY_UNSET_OPACITY,
  SKY_WH,
  SKY_XY,
  VIEW,
} from "./waystone-geometry";
import { BandLayer, DialArcs, DialCardinals, SkyLayers } from "./waystone-layers";
import type { WaystoneWeather } from "./waystone-treatment";
import { resolveWaystoneTreatment, waystonePhaseAtHour } from "./waystone-treatment";

/** The ambient clock as the stone reads it. The HOUR is the whole time axis: it drives the dial angle, the
 *  interpolated sky, the sun/moon's point on its arc, and the star ramp — the six `TIME_OF_DAY` labels stay a
 *  TEXT concern (the band prints them; the ring bands them). One nullable object, so "the story hasn't set the
 *  clock" is one state rather than props that can disagree. */
export interface WaystoneClock {
  readonly hour: number;
  readonly minute: number;
}

export interface WaystoneProps {
  /** The ambient clock; `null` = unset: neutral ring, no marker, plain dim sky (§12.2.1). */
  clock: WaystoneClock | null;
  /** The resolved weather; `null` = unresolvable/unset ⇒ the clear recipe. @defaultValue null */
  weather?: WaystoneWeather | null;
  className?: string;
}

const DEG_FULL = 360;
const DEG_HALF = 180;

/** The signed shortest way round from one angle to another (-180, 180]. */
function shortestDelta(from: number, to: number): number {
  return ((((to - from + DEG_HALF) % DEG_FULL) + DEG_FULL) % DEG_FULL) - DEG_HALF;
}

/** The hand's rendered angle, ACCUMULATED rather than wrapped. `handAngle` is modulo 360, so 23:00 → 01:00
 *  (345° → 15°) told CSS to interpolate 345 → 15 — the hand sweeping almost the whole dial BACKWARDS over the
 *  transit. Keeping a running total and adding only the shortest delta makes every advance take the short way
 *  round, and a forward hour always moves forward. (Derived during render via the prev-state pattern — a ref
 *  read in render is banned here.) */
function useSweptAngle(target: number): number {
  const [swept, setSwept] = useState(target);
  const [seen, setSeen] = useState(target);
  if (seen !== target) {
    setSeen(target);
    setSwept((current) => current + shortestDelta(((current % DEG_FULL) + DEG_FULL) % DEG_FULL, target));
  }
  return swept;
}

/** Subscribe to document visibility — the stone PAUSES every layer while the tab is hidden (no compositing
 *  work for pixels nobody is looking at). One listener, CSS does the pausing. */
function subscribeVisibility(onChange: () => void): () => void {
  document.addEventListener("visibilitychange", onChange);
  return (): void => document.removeEventListener("visibilitychange", onChange);
}

function useDocumentVisible(): boolean {
  return useSyncExternalStore(
    subscribeVisibility,
    useCallback(() => !document.hidden, []),
    useCallback(() => true, []),
  );
}

/** The waystone — a pure-SVG decorative composite; pair it with the band's text lines (the datum). */
export function Waystone({ clock, weather = null, className }: WaystoneProps): ReactElement {
  const uid = useId();
  // An unset stone has no layers to carry, so it drops a size step (variants.ts) — the compressed band's
  // stone (HUD-1 §7.3), derived from the datum rather than dictated by the band.
  const slots = waystoneVariants({ unset: clock === null });
  const visible = useDocumentVisible();
  const treatment = clock === null ? null : resolveWaystoneTreatment(clock.hour + clock.minute / MINUTES_IN_HOUR, weather);
  const litPhase = clock === null ? null : waystonePhaseAtHour(clock.hour);
  const moonMaskId = `${uid}-moon`;
  const sweptAngle = useSweptAngle(clock === null ? 0 : handAngle(clock.hour, clock.minute));
  const cardinalMaskId = `${uid}-cardinal-moon`;

  return (
    <svg
      aria-hidden={true}
      className={cn(slots.root(), className)}
      data-slot="waystone"
      data-phase={litPhase ?? "unset"}
      data-weather={treatment === null ? "unset" : treatment.overlay}
      data-paused={!visible}
      viewBox={`0 0 ${VIEW} ${VIEW}`}
    >
      <defs>
        {/* LAYER 1 — the sky is ONE gradient whose stops are the hour's interpolated recipe; the stop COLORS
            transition, so an advance melts the sky from one hour to the next instead of swapping it. */}
        {treatment === null ? null : (
          <radialGradient id={`${uid}-sky`} cx="50%" cy={treatment.sky.cy} r="85%">
            <stop offset="0%" stopColor={treatment.sky.from} className="orb-ws-sky-stop" data-slot="waystone-sky-from" />
            <stop offset="100%" stopColor={treatment.sky.to} className="orb-ws-sky-stop" data-slot="waystone-sky-to" />
          </radialGradient>
        )}
        <clipPath id={`${uid}-clip`}>
          <circle cx={C} cy={C} r={CLIP_R} />
        </clipPath>
        {treatment === null || treatment.celestial.body !== "moon" ? null : (
          // A luminance mask carves the crescent. `white`/`black` here are mask LUMINANCE values, not paint —
          // the moon's own color is a theme token (the D71 rule is about what the user SEES).
          <mask id={moonMaskId}>
            <circle cx={0} cy={0} r={treatment.celestial.r} fill="white" />
            <circle
              cx={treatment.celestial.r * MOON_MASK_SHIFT_X}
              cy={-treatment.celestial.r * MOON_MASK_SHIFT_Y}
              r={treatment.celestial.r * MOON_MASK_R}
              fill="black"
            />
          </mask>
        )}
      </defs>

      {/* LAYER 0 — the 24h dial: the neutral track, the six label arcs (the one we're IN lit), the bezel scale. */}
      <circle cx={C} cy={C} r={RING_R} className={slots.track()} stroke="currentColor" strokeWidth={RING_W} fill="none" />
      {litPhase === null ? null : <DialArcs litPhase={litPhase} />}
      <DialCardinals maskId={cardinalMaskId} />
      <circle cx={C} cy={C} r={DISC_R} fill="var(--color-sidebar)" />
      <g clipPath={`url(#${uid}-clip)`}>
        {/* LAYER 1 — the hour's interpolated sky (the unset stone shows a plain dim wash instead). */}
        {treatment === null ? (
          <rect x={SKY_XY} y={SKY_XY} width={SKY_WH} height={SKY_WH} fill="var(--color-muted)" opacity={SKY_UNSET_OPACITY} data-slot="waystone-sky-unset" />
        ) : (
          <>
            <rect x={SKY_XY} y={SKY_XY} width={SKY_WH} height={SKY_WH} fill={`url(#${uid}-sky)`} data-slot="waystone-sky" />
            <SkyLayers treatment={treatment} maskId={moonMaskId} />
          </>
        )}

        {/* LAYER 7 — the horizon depth anchor: the silhouette + its one ember-lit gable. */}
        <path d="M 16 58 Q 30 50 42 56 T 80 55 L 80 82 L 16 82 Z" fill={HORIZON_FILL} data-slot="waystone-horizon" />
        {/* The homestead, SEATED in the ridge (its base runs below the silhouette's crest at this x) with a
            lit window — the one ember in the landscape. The window brightens as the sky darkens, so the place
            reads as inhabited at night and merely standing by day. */}
        <path d={GABLE_PATH} fill={GABLE_FILL} data-slot="waystone-gable" />
        <rect
          x={GABLE_WINDOW.x}
          y={GABLE_WINDOW.y}
          width={GABLE_WINDOW.w}
          height={GABLE_WINDOW.h}
          rx="0.4"
          fill={GABLE_WINDOW_FILL}
          className="orb-ws-transit"
          opacity={treatment === null ? 0 : (GABLE_WINDOW_FLOOR + treatment.starOpacity * GABLE_WINDOW_GAIN).toFixed(2)}
          data-slot="waystone-gable-window"
        />

        {/* LAYER 7b — the enveloping bands, in FRONT of the silhouette. */}
        {treatment === null || treatment.bands === null ? null : <BandLayer key={treatment.bands.kind} layer={treatment.bands} />}
      </g>
      <circle cx={C} cy={C} r={DISC_R} fill="none" stroke="var(--color-border)" strokeWidth="1" />

      {/* LAYER 8 — the ember hour hand: drawn at noon, ROTATED to the hour, so time swings it around the ring. */}
      {clock === null ? null : (
        <g className="orb-ws-hand" style={{ rotate: `${sweptAngle}deg` }} data-slot="waystone-marker">
          <circle cx={C} cy={C - MARKER_HALO_R_POS} r={MARKER_HALO_R} fill="var(--color-primary)" opacity="0.32" className="orb-ws-marker" />
          {/* The POINTER — a tapered ember needle that spans the bezel and CROSSES the band it marks, tip
              aimed inward at the sky (the watch-bezel pip idiom). A detached dot near the rim read as "a
              weird dot" (owner) — a hand has to look like it belongs to the dial and to point. The sidebar
              outline keeps it legible where it crosses a band whose hue is close to the ember (dawn/evening). */}
          <path
            d={POINTER_PATH}
            fill="var(--color-primary)"
            stroke="var(--color-sidebar)"
            strokeWidth={MARKER_STROKE}
            strokeLinejoin="round"
            data-slot="waystone-marker-pointer"
          />
        </g>
      )}
    </svg>
  );
}
