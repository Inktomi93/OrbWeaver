// The Waystone's LAYER components (charts/meter/waystone.tsx — RV-10): the independently animated pieces of
// the living clock — the dial's label arcs, the sun/moon on its arc, the star field, the cloud deck, the
// falling particles, the sky wash + lightning, and the enveloping fog/wind bands. Split out of the component
// file so the stone stays under the §13.7 primitive size cap; each layer is decorative SVG (the whole
// composite is `aria-hidden` — the band's TEXT carries every datum).
//
// ONE ANIMATION PER ELEMENT: the CSS `animation` shorthand is not additive, so an enter-fade and a loop never
// share a class list — they ride separate nested groups (stacking them silently drops the loop; CT-caught).
import type { CSSProperties, ReactElement } from "react";
import { cn } from "#lib";
import {
  ARC_GAP_HOURS,
  ARC_GLOW_OPACITY,
  ARC_GLOW_SPREAD,
  ARC_REST_OPACITY,
  ASH_DOT_R,
  ASH_EMBER_FILL,
  ASH_FILL,
  arcPath,
  arcStroke,
  BEZEL_R,
  BOLT_STROKE,
  CARDINAL_MOON,
  CARDINAL_R,
  CARDINAL_RAY_GAP,
  CARDINAL_RAY_W,
  CARDINAL_RAYS,
  CARDINAL_STROKE,
  CARDINAL_SUN,
  CLOUD_DARK,
  CLOUD_DRIFT_CLASS,
  CLOUD_LIGHT,
  CLOUD_SLOT_PATHS,
  CLOUD_SLOTS,
  COORD_PRECISION,
  FALL_SPEED_CLASS,
  FLASH_FILL,
  FOG_FILL,
  GLOW_ALTITUDE_GAIN,
  GLOW_FLOOR,
  GLOW_R,
  latticeCells,
  MOON_GLINT,
  MOON_GLINT_R,
  MOON_GLINT_X,
  MOON_GLINT_Y,
  MOON_MASK_R,
  MOON_MASK_SHIFT_X,
  MOON_MASK_SHIFT_Y,
  PARTICLE_OPACITY,
  pointAt,
  RAIN_STROKE,
  RAIN_W,
  RING_W,
  SKY_WH,
  SKY_XY,
  SNOW_DOT_R,
  SNOW_FILL,
  STAR_FILL,
  STAR_POSITIONS,
  WIND_FILL,
} from "./waystone-geometry";
import type { WaystoneBandLayer, WaystoneCelestial, WaystoneCloudLayer, WaystoneParticleLayer, WaystonePhase, WaystoneTreatment } from "./waystone-treatment";
import { WAYSTONE_PHASE_SPANS } from "./waystone-treatment";

const NOON_HOUR = 12;

/** Layer 5 — the falling particles. Rain draws slanted streaks, snow/ash draw motes (snow adds the lateral
 *  sway on an inner group, so the two axes compose without a bespoke keyframe per weather).
 *
 *  Real weather is IRREGULAR: a perfect lattice at one length, one slant and one opacity read as a texture
 *  swatch rather than rain. Every cell carries a deterministic jitter (`latticeCells` — position, length and
 *  opacity), so the fall stays seamless (the pitch is exact) while no two drops match. Ash goes one further:
 *  roughly one mote in eight is a live ember. */
function ParticleLayer({ layer }: { readonly layer: WaystoneParticleLayer }): ReactElement {
  const cells = latticeCells(layer);
  // The keyframe translates by `--orb-ws-pitch`, so one class serves every lattice spacing (the pitch is DATA).
  const style = { "--orb-ws-pitch": `${layer.pitch}px` } as CSSProperties;
  const motes =
    layer.kind === "rain" ? (
      <g stroke={RAIN_STROKE} strokeLinecap="round">
        {cells.map((cell) => (
          <line
            key={`${cell.x}-${cell.y}`}
            x1={cell.x}
            y1={cell.y}
            x2={cell.x - layer.slant * cell.scale}
            y2={cell.y + layer.length * cell.scale}
            strokeWidth={(RAIN_W * cell.scale).toFixed(COORD_PRECISION)}
            opacity={cell.alpha}
          />
        ))}
      </g>
    ) : (
      <g>
        {cells.map((cell) => (
          <circle
            key={`${cell.x}-${cell.y}`}
            cx={cell.x}
            cy={cell.y}
            r={((layer.kind === "snow" ? SNOW_DOT_R : ASH_DOT_R) * cell.scale).toFixed(COORD_PRECISION)}
            fill={moteFill(layer.kind, cell.ember)}
            opacity={cell.alpha}
          />
        ))}
      </g>
    );
  // ONE animation per element: the `animation` shorthand is not additive, so the enter fade and the fall loop
  // live on SEPARATE nested groups (stacking them on one class list silently drops the fall — CT-caught).
  return (
    <g className="orb-ws-enter" data-slot="waystone-precip-enter">
      <g className={FALL_SPEED_CLASS[layer.speed]} style={style} opacity={PARTICLE_OPACITY} data-slot="waystone-precip" data-particles={layer.kind}>
        <g className={layer.sway ? "orb-ws-driftx" : undefined}>{motes}</g>
      </g>
    </g>
  );
}

/** A mote's paint: snow is starlight, ash is grit — except for the roughly one-in-eight still burning. */
function moteFill(kind: WaystoneParticleLayer["kind"], ember: boolean): string {
  if (kind === "snow") {
    return SNOW_FILL;
  }
  return ember ? ASH_EMBER_FILL : ASH_FILL;
}

/** Layer 4 — the cloud deck. Every slot is always mounted; `count` lights the first N by OPACITY so a weather
 *  change fades the deck rather than popping puffs in and out. */
function CloudLayer({ layer }: { readonly layer: WaystoneCloudLayer }): ReactElement {
  return (
    <g className={cn("orb-ws-transit", CLOUD_DRIFT_CLASS[layer.drift])} data-slot="waystone-clouds" data-cloud-count={layer.count} data-cloud-tone={layer.tone}>
      {CLOUD_SLOT_PATHS.slice(0, CLOUD_SLOTS).map((d, index) => (
        <path
          key={d}
          d={d}
          className="orb-ws-transit"
          fill={layer.tone === "dark" ? CLOUD_DARK : CLOUD_LIGHT}
          opacity={index < layer.count ? layer.opacity : 0}
        />
      ))}
    </g>
  );
}

/** Layer 7b — the enveloping bands, drawn IN FRONT of the horizon silhouette: weather that surrounds the
 *  place rather than falling on it.
 *
 *  FOG is a VEIL — two wide, soft, slow ellipses breathing over the heavy wash. (Four rounded bars read as a
 *  skeleton loader, which is the one thing a sky must never look like.) WIND is MOTION — stretched streaks
 *  sweeping across, not a pasted wind glyph: the deck above is already drifting at its fastest. */
export function BandLayer({ layer }: { readonly layer: WaystoneBandLayer }): ReactElement {
  // One animation per element (see ParticleLayer): the enter fade wraps the drifting group, never shares it.
  if (layer.kind === "wind") {
    return (
      // TWO gust groups half a cycle apart: a single sweep spends most of its loop faded out, which reads as
      // "no wind" on any still frame — offset copies keep at least one streak on screen at all times.
      <g className="orb-ws-enter" data-slot="waystone-bands-enter">
        <g fill={WIND_FILL} className="orb-ws-gust" data-slot="waystone-wind">
          <ellipse cx="44" cy="34" rx="20" ry="1.1" opacity="0.5" />
          <ellipse cx="52" cy="45" rx="16" ry="0.9" opacity="0.4" />
        </g>
        <g fill={WIND_FILL} className="orb-ws-gust orb-ws-gust-b" data-slot="waystone-wind-b">
          <ellipse cx="40" cy="40" rx="18" ry="1" opacity="0.45" />
          <ellipse cx="48" cy="52" rx="14" ry="0.8" opacity="0.35" />
        </g>
      </g>
    );
  }
  return (
    <g className="orb-ws-enter" data-slot="waystone-bands-enter">
      <g className="orb-ws-sway-slow" data-slot="waystone-fog">
        <g fill={FOG_FILL} className={layer.breathe ? "orb-ws-breathe" : undefined}>
          <ellipse cx="46" cy="44" rx="30" ry="7" opacity="0.5" />
          <ellipse cx="50" cy="56" rx="26" ry="5.5" opacity="0.42" />
        </g>
      </g>
    </g>
  );
}

/** LAYER 0b — the two CARDINAL glyphs that TEACH the dial's convention: a sun at the top (noon) and a crescent
 *  moon at the bottom (midnight). This is a 24-hour dial, and a cold viewer reads it against the 12-hour clock
 *  they carry — so the ring explains itself in two marks instead of a tick scale nobody can decode (the owner
 *  called the bezel "weird" before these existed). They also rhyme with the disc: the sun is overhead at the
 *  top, exactly where the sky's own sun peaks. Deliberately only TWO — no hour captions. */
export function DialCardinals({ maskId }: { readonly maskId: string }): ReactElement {
  const noon = pointAt(NOON_HOUR, BEZEL_R);
  const midnight = pointAt(0, BEZEL_R);
  return (
    <g data-slot="waystone-cardinals">
      <g data-slot="waystone-cardinal-noon">
        {CARDINAL_RAYS.map((ray) => (
          <line
            key={ray}
            x1={noon.x}
            y1={noon.y}
            x2={noon.x}
            y2={noon.y}
            stroke={CARDINAL_SUN}
            strokeWidth={CARDINAL_RAY_W}
            strokeLinecap="round"
            transform={`rotate(${ray} ${noon.x} ${noon.y}) translate(0 ${-CARDINAL_R - CARDINAL_RAY_GAP})`}
          />
        ))}
        <circle cx={noon.x} cy={noon.y} r={CARDINAL_R} fill={CARDINAL_SUN} stroke="var(--color-sidebar)" strokeWidth={CARDINAL_STROKE} />
      </g>
      {/* The crescent is carved by a luminance mask (`white`/`black` are mask values, not paint — the moon's
          own color is a token), so it reads as a moon rather than a second dot. */}
      <mask id={maskId}>
        <circle cx={midnight.x} cy={midnight.y} r={CARDINAL_R} fill="white" />
        <circle cx={midnight.x + CARDINAL_R * MOON_MASK_SHIFT_X} cy={midnight.y - CARDINAL_R * MOON_MASK_SHIFT_Y} r={CARDINAL_R * MOON_MASK_R} fill="black" />
      </mask>
      <circle
        cx={midnight.x}
        cy={midnight.y}
        r={CARDINAL_R + CARDINAL_STROKE / 2}
        fill="none"
        stroke="var(--color-sidebar)"
        strokeWidth={CARDINAL_STROKE}
        data-slot="waystone-cardinal-midnight-rim"
      />
      <circle cx={midnight.x} cy={midnight.y} r={CARDINAL_R} fill={CARDINAL_MOON} mask={`url(#${maskId})`} data-slot="waystone-cardinal-midnight" />
    </g>
  );
}

/** LAYER 0 — the 24h dial: SIX label arcs, each in its OWN band identity (a real dial where every segment is
 *  its own section, never a grey ring with one lit piece), the current one lifted to full opacity. */
export function DialArcs({ litPhase }: { readonly litPhase: WaystonePhase }): ReactElement {
  const litSpan = WAYSTONE_PHASE_SPANS.find((s) => s.phase === litPhase) ?? WAYSTONE_PHASE_SPANS[0];
  if (litSpan === undefined) {
    throw new Error("waystone: the dial has no bands");
  }
  return (
    <>
      {/* The current band's GLOW: a wider, softer arc UNDER the ring in the band's own hue. Emphasis has to
          be hue-agnostic — a brightness step alone reads on the gold bands and vanishes on the indigo ones,
          so "we are here" is a halo, not a shade. */}
      <path
        d={arcPath(litSpan.from + ARC_GAP_HOURS, litSpan.to - ARC_GAP_HOURS)}
        className="orb-ws-transit"
        stroke={arcStroke(litPhase, true)}
        strokeWidth={RING_W + ARC_GLOW_SPREAD}
        fill="none"
        strokeLinecap="butt"
        opacity={ARC_GLOW_OPACITY}
        data-slot="waystone-arc-glow"
      />
      {WAYSTONE_PHASE_SPANS.map((span) => (
        <path
          key={`${span.phase}-${span.from}`}
          d={arcPath(span.from + ARC_GAP_HOURS, span.to - ARC_GAP_HOURS)}
          className="orb-ws-transit"
          stroke={arcStroke(span.phase, span.phase === litPhase)}
          strokeWidth={RING_W}
          fill="none"
          strokeLinecap="butt"
          opacity={span.phase === litPhase ? 1 : ARC_REST_OPACITY}
          data-slot="waystone-arc"
          data-arc-phase={span.phase}
          data-lit={span.phase === litPhase}
        />
      ))}
    </>
  );
}

/** LAYER 2 — the sun or moon, drawn at the origin and TRANSLATED to its computed point on the arc, so ANY
 *  hour change slides it along the sky over the transit duration. Low = bigger, warmer, dimmer-glowing; high =
 *  small, pale and bright (the altitude is continuous in the hour). */
function CelestialBody({ body, veil, maskId }: { readonly body: WaystoneCelestial; readonly veil: number; readonly maskId: string }): ReactElement {
  const glow = GLOW_FLOOR + body.altitude * GLOW_ALTITUDE_GAIN;
  return (
    <g
      className="orb-ws-transit-move orb-ws-enter"
      style={{ translate: `${body.x.toFixed(COORD_PRECISION)}px ${body.y.toFixed(COORD_PRECISION)}px` }}
      opacity={veil}
      data-slot="waystone-celestial"
      data-body={body.body}
    >
      {/* The breath keyframe reads `--orb-ws-glow` as its FLOOR (an `opacity` attribute would lose to the
          animation); reduced motion drops the animation and the same value lands as the resting one. */}
      <circle
        cx={0}
        cy={0}
        r={body.r * GLOW_R}
        fill={body.fill}
        style={{ "--orb-ws-glow": glow.toFixed(COORD_PRECISION), opacity: glow } as CSSProperties}
        className="orb-ws-glow"
      />
      {body.body === "sun" ? (
        <circle cx={0} cy={0} r={body.r} fill={body.fill} />
      ) : (
        <>
          <circle cx={0} cy={0} r={body.r} fill={body.fill} mask={`url(#${maskId})`} />
          <circle cx={-body.r * MOON_GLINT_X} cy={body.r * MOON_GLINT_Y} r={body.r * MOON_GLINT_R} fill={MOON_GLINT} />
        </>
      )}
    </g>
  );
}

/** LAYERS 2-6 — everything the hour and the weather paint between the sky gradient and the horizon. */
export function SkyLayers({ treatment, maskId }: { readonly treatment: WaystoneTreatment; readonly maskId: string }): ReactElement {
  return (
    <>
      {/* LAYER 3 — the stars: individually staggered twinkles under one transitioned group opacity. */}
      <g fill={STAR_FILL} className="orb-ws-transit" opacity={treatment.starOpacity} data-slot="waystone-stars">
        {STAR_POSITIONS.map((star) => (
          <circle key={`${star.x}-${star.y}`} cx={star.x} cy={star.y} r={star.r} className="orb-ws-star" />
        ))}
      </g>
      {/* KEYED ON THE BODY: at 05:00/19:00 the arc restarts, so a shared node would TRANSITION the sun's
          last position into the moon's first — a celestial object sliding backwards across the sky. A remount
          + enter-fade is the honest handover. */}
      <CelestialBody key={treatment.celestial.body} body={treatment.celestial} veil={treatment.celestialOpacity} maskId={maskId} />
      {/* LAYER 4 — the cloud deck. */}
      <CloudLayer layer={treatment.clouds} />
      {/* LAYER 6a — the weather's full-sky wash, under the particles it tints. */}
      <rect
        x={SKY_XY}
        y={SKY_XY}
        width={SKY_WH}
        height={SKY_WH}
        className="orb-ws-transit"
        fill={treatment.wash === null ? "transparent" : treatment.wash.fill}
        opacity={treatment.wash === null ? 0 : treatment.wash.opacity}
        data-slot="waystone-wash"
      />
      {/* LAYER 5 — the falling particles (keyed so a weather change replays the fade-in). */}
      {treatment.particles === null ? null : <ParticleLayer key={treatment.particles.kind} layer={treatment.particles} />}
      {/* LAYER 6b — the storm: an occasional sky flash (removed under reduced motion) + the drawn bolt. */}
      {treatment.lightning ? (
        <g data-slot="waystone-storm">
          <rect x={SKY_XY} y={SKY_XY} width={SKY_WH} height={SKY_WH} fill={FLASH_FILL} opacity="0" className="orb-ws-strike" data-slot="waystone-flash" />
          {/* The bolt shares the strike keyframe with the sky flash — a permanently-drawn bolt (its own
              one-shot enter animation) was the highest-chroma object on the stone, dead centre, forever. */}
          <path
            d="M 47 30 L 41 43 h 5.5 l -4.5 13"
            stroke={BOLT_STROKE}
            strokeWidth="1.7"
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0"
            className="orb-ws-strike"
            data-slot="waystone-bolt"
          />
        </g>
      ) : null}
    </>
  );
}
