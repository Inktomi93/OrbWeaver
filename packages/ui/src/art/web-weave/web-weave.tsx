// WebWeave — the brand web, woven live on canvas.
// The thin DOM half: geometry is `web-weave-geometry.ts` (pure, seeded), painting is
// `web-weave-render.ts` (stateless painters); this file owns the clock, the canvas, the rAF loop,
// and the TOKEN→palette resolution (canvas can't consume `var()` — the palette is resolved from
// computed style at mount and re-resolved on theme/scheme flips, the §1.3 wiring; every entry is a
// token or a color-mix over tokens, zero literals).
//
// PERF (design §1.2 — the offscreen cache): once the web is STATIC (every resting state, and the
// weaving build past settle) the loop stops re-stroking ~all segments + running a live gaussian every
// frame. Instead the static web + its glow are BAKED ONCE into a detached back-buffer and each frame
// just `drawImage`s it (sway = a whole-canvas translate) with only the genuinely-dynamic layers —
// dew twinkle, glint sweep, spider — painted live on top. The ACTIVE build (weaving, t < settle) still
// paints live via renderWeaveFrame. The cache re-bakes on resize/seed/dim (rebuild) and theme (palette).
//
// PERF, the IDLE half (#467 — the owner's pre-auth login web burned CPU continuously and stuttered):
//   · the loop runs on an AMBIENT BUDGET while nothing is happening (web-weave-cadence.ts owns the
//     "is anything happening?" question) — a PHASE, never a reduced mode: one pluck, one hunt, one gust
//     and the same painters are back at the display's full refresh on the very next frame;
//   · the glint's per-frame hunt for lit segments goes through the web's BEARING INDEX
//     (web-weave-glint.ts), built once per web here in `rebuild` — an exact skip, same lit set.
// Measured on the login backdrop's own props (1440×900, settled, interactive): main-thread busy
// 26.1% → 10.4% of a 5s idle window; the scan's own self-time (swayPt + drawGlint + glintSegmentLit +
// strandPoint) 110ms → 19ms.
//
// Reduced motion is REMOVE, not shorten (guide §3.9): no rAF loop at all — one static paint of the
// state's resting frame (settled web, dew at rest, spider resting head-down at the hub), via the same
// untouched renderWeaveFrame(still) path (the cache is loop-only). The frame counter rides
// `data-orb-weave-frames` so a CT can assert the loop is genuinely absent.
//
// A11y: pure decoration — aria-hidden, pointer-transparent. The hosting surface carries the words.

import type { CSSProperties, ReactElement } from "react";
import { useEffect, useRef } from "react";
import { cn, usePrefersReducedMotion } from "#lib";
import { webWeaveVariants } from "./variants.ts";
import { AMBIENT_FRAME_MS, PREY_SETTLE_TAIL_MS, weaveIsQuiet } from "./web-weave-cadence.ts";
import type { CharacterPreset, WeaveCharacter } from "./web-weave-character.ts";
import { WEAVE_CHARACTER_PRESETS } from "./web-weave-character.ts";
import type { WeaveState, WovenWeb } from "./web-weave-geometry.ts";
import { buildStrandOut, buildWeb } from "./web-weave-geometry.ts";
import type { WeaveGlintSegment } from "./web-weave-glint.ts";
import { buildGlintIndex } from "./web-weave-glint.ts";
import { createPreyState } from "./web-weave-prey.ts";
import type { WeavePalette } from "./web-weave-render.ts";
import { bakeStaticWeb, drawLiveLayers, renderWeaveFrame } from "./web-weave-render.ts";
import type { SpiderTracker } from "./web-weave-spider.ts";
import { STRAND_OUT_MS } from "./web-weave-spider.ts";
import type { WeavePluckMap, WeaveWeather } from "./web-weave-sway.ts";
import { weaveSwayOffset } from "./web-weave-sway.ts";
import type { WeavePhase } from "./web-weave-timeline.ts";
import { WEAVE_TIMELINE, weavePhaseAt } from "./web-weave-timeline.ts";
import type { WeaveTouch, WeaveTouchInput } from "./web-weave-touch.ts";
import { createWeaveTouch } from "./web-weave-touch.ts";

/** The pointer seam, when the host asked for one (module-scope so the effect stays legible). */
function makeTouch(interactive: boolean, input: WeaveTouchInput): WeaveTouch | null {
  return interactive ? createWeaveTouch(input) : null;
}

/** What a non-interactive frame reports instead of stepping the physics. */
const QUIET = { shiver: 0, ringing: false } as const;

/** The per-frame motion bundle the three painters share. */
interface FrameMotion {
  readonly weather: WeaveWeather;
  readonly plucks: WeavePluckMap;
  readonly dt: number;
  readonly character: CharacterPreset;
  readonly prey: ReturnType<typeof createPreyState> | null;
}

export interface WebWeaveProps {
  /** @defaultValue "settled" */
  state?: WeaveState;
  /** Deterministic build seed — the same seed weaves the same web. @defaultValue 7 */
  seed?: number;
  /** Hub position as box fractions (boot veil 0.5/0.42; login backdrop 0.5/0.34). */
  hub?: { readonly x: number; readonly y: number };
  /** Silk brightness multiplier 0..1 — the login card dims the web under itself. @defaultValue 1 */
  dim?: number;
  /** The weaver herself — a future "reduce spiders" courtesy hides her, the web stays. @defaultValue true */
  spider?: boolean;
  /** The hub-centered ambient accent glow layer. @defaultValue true */
  glow?: boolean;
  /** Fired once when the build reaches settle (immediately for the already-settled states). */
  onSettled?: () => void;
  /** Build-phase changes (the boot veil's caption feed). Only `weaving` walks the phases. */
  onPhaseChange?: (phase: WeavePhase) => void;
  /** Let a pointer touch the web: the silk plucks where the cursor crosses it and the weaver comes to
   *  investigate (weave-lab §2/§5). Takes pointer events; the art stays `aria-hidden` either way —
   *  it announces nothing and has no keyboard path, so there is nothing to expose. @defaultValue false */
  interactive?: boolean;
  /** Weather, 0..1 — widens the ambient sway and adds a rolling gust. @defaultValue 0 */
  wind?: number;
  /** How lively the weaver is: gait, turn rate, burst, sprint, idle twitches. `calm` is the motion the
   *  component shipped with. @defaultValue "calm" */
  character?: WeaveCharacter;
  /** Build-clock multiplier — 2.2 runs the ~12s weave in ~5.5s (the boot story). Ambient beats (sway,
   *  glint, dew) keep wall-clock time; only the BUILD is scaled. @defaultValue 1 */
  tempo?: number;
  className?: string;
}

const DEFAULT_SEED = 7;
const DEFAULT_HUB = { x: 0.5, y: 0.42 } as const;
/** DPR cap — beyond 2 the silk is sub-pixel anyway and the fill cost doubles. */
const MAX_DPR = 2;
/** The frozen mid-build instant for `partial` (radii done, no spiral — the B4 half-woven web). */
const PARTIAL_T = WEAVE_TIMELINE.radii[1] + 1;
/** The A9 beat starts a breath after mount so the settled web registers before the spider departs. */
const STRAND_OUT_DELAY_MS = 250;
const PERCENT = 100;
/** Dew condensation span (render module DEW_CONDENSE_MS) — the still frame rests past it. */
const DEW_CONDENSE_LEAD_MS = 900;
/** The reduced-motion resting instant: past settle far enough that dew is fully condensed. */
const STILL_T = WEAVE_TIMELINE.settle + DEW_CONDENSE_LEAD_MS;
/** No wind, no shiver — what the buffer is baked under (it is blitted, never re-stroked). */
const CALM_WEATHER: WeaveWeather = { wind: 0, shiver: 0 };
/** Frame-delta ceiling: a backgrounded tab returns a multi-second delta, which would teleport the
 *  weaver across the web on the first frame back. */
const MAX_FRAME_MS = 50;

/** The §1.3 palette — token derivations ONLY (resolved via computed style; no raw colors). */
const PALETTE_EXPRESSIONS: Readonly<Record<keyof WeavePalette, string>> = {
  silk: "color-mix(in oklab, var(--color-foreground) 62%, transparent)",
  silkBright: "color-mix(in oklab, var(--color-primary) 55%, var(--color-foreground))",
  glow: "var(--color-primary)",
  dew: "color-mix(in oklab, var(--color-sky-star) 70%, var(--color-primary))",
  spiderBody: "color-mix(in oklab, var(--color-foreground) 55%, var(--color-primary))",
  spiderBand: "var(--color-primary)",
};

/** Resolve the palette through a probe element INSIDE the host (so theme scopes apply). */
function resolvePalette(probe: HTMLElement): WeavePalette {
  const resolve = (expression: string): string => {
    probe.style.color = expression;
    return getComputedStyle(probe).color;
  };
  return {
    silk: resolve(PALETTE_EXPRESSIONS.silk),
    silkBright: resolve(PALETTE_EXPRESSIONS.silkBright),
    glow: resolve(PALETTE_EXPRESSIONS.glow),
    dew: resolve(PALETTE_EXPRESSIONS.dew),
    spiderBody: resolve(PALETTE_EXPRESSIONS.spiderBody),
    spiderBand: resolve(PALETTE_EXPRESSIONS.spiderBand),
  };
}

/** The living brand web. Fills its host box; pure decoration. */
export function WebWeave({
  state = "settled",
  seed = DEFAULT_SEED,
  hub = DEFAULT_HUB,
  dim = 1,
  spider = true,
  glow = true,
  onSettled,
  onPhaseChange,
  interactive = false,
  wind = 0,
  character = "calm",
  tempo = 1,
  className,
}: WebWeaveProps): ReactElement {
  const slots = webWeaveVariants({ interactive });
  const reduced = usePrefersReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Latest-callback refs (written in an effect, read in the loop — never during render) so a parent
  // re-render with a fresh closure doesn't tear down and restart the whole weave.
  const onSettledRef = useRef(onSettled);
  const onPhaseRef = useRef(onPhaseChange);
  useEffect(() => {
    onSettledRef.current = onSettled;
    onPhaseRef.current = onPhaseChange;
  });
  const hubX = hub.x;
  const hubY = hub.y;

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    if (wrapper === null || canvas === null) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (ctx === null) {
      return;
    }
    const probe = document.createElement("span");
    probe.style.display = "none";
    wrapper.appendChild(probe);

    let palette = resolvePalette(probe);
    let web: WovenWeb | null = null;
    let glint: readonly WeaveGlintSegment[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let strandOut: { pts: ReturnType<typeof buildStrandOut>; t0: number } | null = null;
    const tracker: SpiderTracker = { prev: null };
    // The physics + character state (weave-lab §1/§2/§3). Inert unless a host opts in: no wind, no
    // shiver and no plucks is exactly the sway the web shipped with.
    const characterPreset = WEAVE_CHARACTER_PRESETS[character];
    const prey = interactive ? createPreyState() : null;
    const listening = (now: number): boolean => !reduced && (state !== "weaving" || timelineAt(now) >= WEAVE_TIMELINE.settle);
    const touch = makeTouch(interactive, { host: wrapper, getWeb: () => web, accepts: listening, prey: spider ? prey : null });
    const plucks: WeavePluckMap = touch?.plucks ?? null;
    let shiver = 0;
    let ringing = false;
    let lastNow = performance.now();
    // The ambient budget's cursors: when the last frame was PAINTED (not merely offered), and how long
    // the weaver's activity keeps the full refresh alive past her last un-resting frame.
    let lastPaint = Number.NEGATIVE_INFINITY;
    let preyBusyUntil = 0;
    // The offscreen cache (design §1.2): the static settled web + baked glow, drawn ONCE and blitted
    // each resting frame. A detached canvas (drawImage from it is as fast as OffscreenCanvas and needs
    // no feature-detect). `baked` invalidates on rebuild (size/web) and theme (palette) — re-baked lazily.
    const buffer = document.createElement("canvas");
    const bufferCtx = buffer.getContext("2d");
    let baked = false;
    const clock0 = performance.now();
    let rafId = 0;
    let frames = 0;
    let settledFired = false;
    let lastPhase: WeavePhase | null = null;

    const rebuild = (): void => {
      width = wrapper.clientWidth;
      height = wrapper.clientHeight;
      dpr = Math.min(globalThis.devicePixelRatio || 1, MAX_DPR);
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      buffer.width = canvas.width;
      buffer.height = canvas.height;
      web = buildWeb({ width, height, hub: { x: hubX, y: hubY }, seed });
      glint = buildGlintIndex(web);
      strandOut = state === "strand-out" && !reduced ? { pts: buildStrandOut(web, width, height), t0: performance.now() + STRAND_OUT_DELAY_MS } : null;
      baked = false;
    };

    const timelineAt = (now: number): number => {
      if (reduced) {
        return state === "partial" ? PARTIAL_T : STILL_T;
      }
      if (state === "weaving") {
        return (now - clock0) * tempo;
      }
      if (state === "partial") {
        return PARTIAL_T;
      }
      // settled / strand-out: hold past settle; ambient beats ride the wall clock.
      return WEAVE_TIMELINE.settle + (now - clock0);
    };

    const phaseFor = (t: number): WeavePhase => {
      if (state === "weaving" && !reduced) {
        return weavePhaseAt(t);
      }
      return state === "partial" ? "radii" : "settled";
    };
    const notify = (t: number): void => {
      const phase = phaseFor(t);
      if (phase !== lastPhase) {
        lastPhase = phase;
        onPhaseRef.current?.(phase);
      }
      if (!settledFired && state !== "partial" && t >= WEAVE_TIMELINE.settle) {
        settledFired = true;
        onSettledRef.current?.();
      }
    };

    // The web is STATIC (cacheable) whenever it isn't actively being woven: every resting state, and
    // the weaving build once it has passed settle (the boot veil's slow-boot hold). Reduced motion is
    // excluded — it keeps the untouched single renderWeaveFrame(still) paint (§3.9, zero perf concern).
    //
    // WIND and a LIVE RING both un-static the frame: the cached blit can only sway as one rigid sheet,
    // and a ringing strand is a per-point deformation the buffer cannot express. Both are opt-in and
    // transient — the default (no wind, nothing touched) keeps the bake/composite split intact, and a
    // plucked web returns to the cache the moment its last ring dies.
    const staticNow = (t: number): boolean => (state !== "weaving" || t >= WEAVE_TIMELINE.settle) && wind === 0 && shiver === 0 && !ringing;

    const bake = (now: number): void => {
      if (web === null || bufferCtx === null) {
        return;
      }
      const bakeT = state === "partial" ? PARTIAL_T : WEAVE_TIMELINE.rest;
      bufferCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bufferCtx.clearRect(0, 0, width, height);
      bakeStaticWeb(bufferCtx, {
        web,
        state,
        t: bakeT,
        now,
        palette,
        dim: 1,
        still: true,
        spider,
        strandOut,
        weather: CALM_WEATHER,
        plucks: null,
        dt: 0,
        character: characterPreset,
        prey: null,
        glint,
      });
      baked = true;
    };

    const composite = (now: number, t: number, frame: FrameMotion): void => {
      if (web === null) {
        return;
      }
      if (!baked) {
        bake(now);
      }
      const { dx, dy } = weaveSwayOffset({ kind: "offset", now, ...frame.weather });
      // Blit the cached web (native px, sway as a whole-canvas translate, dim via globalAlpha)…
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = dim;
      ctx.drawImage(buffer, Math.round(dx * dpr), Math.round(dy * dpr));
      ctx.globalAlpha = 1;
      // …then paint only the live layers on top, in CSS-px space.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLiveLayers(ctx, { web, state, t, now, palette, dim, still: false, spider, strandOut, glint, ...frame }, tracker);
    };

    const paint = (now: number): void => {
      if (web === null) {
        return;
      }
      const t = timelineAt(now);
      // The frame delta drives the prey machine (px/ms) and the shiver's decay. Clamped: a backgrounded
      // tab hands back a multi-second `dt`, which would teleport her across the web on the first frame.
      const dt = Math.min(MAX_FRAME_MS, Math.max(0, now - lastNow));
      lastNow = now;
      const physics = touch === null ? QUIET : touch.step(now, dt);
      shiver = physics.shiver;
      ringing = physics.ringing;
      const weather: WeaveWeather = { wind, shiver };
      const frame = { weather, plucks, dt, character: characterPreset, prey };
      if (!reduced && bufferCtx !== null && staticNow(t)) {
        composite(now, t, frame);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        renderWeaveFrame(ctx, { web, state, t, now, palette, dim, still: reduced, spider, strandOut, glint, ...frame }, tracker);
      }
      notify(t);
      frames += 1;
      canvas.dataset["orbWeaveFrames"] = String(frames);
    };

    // Is the web merely BREATHING right now? Everything here is something a person is doing or
    // watching happen — the build, the A9 ride, wind, a rung strand, the weaver off her hub (plus the
    // tail her per-frame turn-home ease needs). Any of them and the ambient budget is off for the
    // frame. `plucks.size` is read straight from the pointer seam rather than from the previous
    // frame's verdict: a skipped frame never ran `touch.step`, so last frame's `ringing` is stale
    // exactly when a fresh pluck must un-throttle us.
    const quiet = (now: number): boolean => {
      if (prey !== null && prey.mode !== "rest") {
        preyBusyUntil = now + PREY_SETTLE_TAIL_MS;
      }
      return weaveIsQuiet({
        building: state === "weaving" && timelineAt(now) < WEAVE_TIMELINE.settle,
        riding: strandOut !== null && now - strandOut.t0 < STRAND_OUT_MS,
        hunting: now < preyBusyUntil,
        wind,
        shiver,
        ringing,
        plucks,
      });
    };

    const loop = (now: number): void => {
      rafId = requestAnimationFrame(loop);
      if (quiet(now) && now - lastPaint < AMBIENT_FRAME_MS) {
        return;
      }
      lastPaint = now;
      paint(now);
    };

    touch?.attach();

    rebuild();
    if (reduced) {
      // REMOVE, not shorten: one static resting frame, no loop (guide §3.9).
      paint(performance.now());
    } else {
      rafId = requestAnimationFrame(loop);
    }

    // ResizeObserver ALWAYS fires once on observe() — skip no-op sizes so the initial fire doesn't
    // double the mount paint (the reduced-motion frame counter is a test seam and must stay exact).
    const resizeObserver = new ResizeObserver(() => {
      if (wrapper.clientWidth === width && wrapper.clientHeight === height) {
        return;
      }
      rebuild();
      if (reduced) {
        paint(performance.now());
      }
    });
    resizeObserver.observe(wrapper);

    // Theme flips re-resolve the token palette (the web recolors with the deployment theme). A raw
    // OS scheme flip with NO attribute change is not observed — the no-raw-matchmedia gate homes
    // matchMedia plumbing in the reduced-motion lib only, and a color-scheme sibling seam is a
    // follow-up (§9.9); every in-app theme path touches the documentElement and is caught here.
    const themeObserver = new MutationObserver(() => {
      palette = resolvePalette(probe);
      // Invalidate the cache so the resting loop re-bakes with the new palette (the raw string reads
      // the fresh tokens next frame). Reduced motion has no loop, so repaint its one static frame now.
      baked = false;
      if (reduced) {
        paint(performance.now());
      }
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class", "style"] });

    return (): void => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      themeObserver.disconnect();
      touch?.detach();
      probe.remove();
    };
  }, [state, seed, hubX, hubY, dim, spider, reduced, interactive, wind, character, tempo]);

  const glowPosition = { "--orb-weave-hub-x": `${hubX * PERCENT}%`, "--orb-weave-hub-y": `${hubY * PERCENT}%` } as CSSProperties;
  return (
    <div ref={wrapperRef} aria-hidden={true} data-slot="web-weave" data-weave-state={state} className={cn(slots.root(), className)}>
      {glow ? <div data-slot="web-weave-glow" className={slots.glow()} style={glowPosition} /> : null}
      <canvas ref={canvasRef} data-slot="web-weave-canvas" className={slots.canvas()} />
    </div>
  );
}
