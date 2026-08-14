// WebWeave — the brand web, woven live on canvas (docs/design/login-loading-screen.md §1/§4.1/§9).
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
import type { WeaveState, WovenWeb } from "./web-weave-geometry.ts";
import { buildStrandOut, buildWeb } from "./web-weave-geometry.ts";
import type { WeavePalette, WeavePluckMap, WeaveWeather } from "./web-weave-render.ts";
import { bakeStaticWeb, drawLiveLayers, renderWeaveFrame, weaveSwayOffset } from "./web-weave-render.ts";
import type { SpiderTracker } from "./web-weave-spider.ts";
import type { WeavePhase } from "./web-weave-timeline.ts";
import { WEAVE_TIMELINE, weavePhaseAt } from "./web-weave-timeline.ts";

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
  className,
}: WebWeaveProps): ReactElement {
  const slots = webWeaveVariants();
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
    let width = 0;
    let height = 0;
    let dpr = 1;
    let strandOut: { pts: ReturnType<typeof buildStrandOut>; t0: number } | null = null;
    const tracker: SpiderTracker = { prev: null };
    // The physics state (weave-lab §1). Inert until a host opts in: no wind, no shiver, no plucks —
    // which is exactly the sway the web shipped with.
    const weather: WeaveWeather = { wind: 0, shiver: 0 };
    const plucks: WeavePluckMap = null;
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
      strandOut = state === "strand-out" && !reduced ? { pts: buildStrandOut(web, width, height), t0: performance.now() + STRAND_OUT_DELAY_MS } : null;
      baked = false;
    };

    const timelineAt = (now: number): number => {
      if (reduced) {
        return state === "partial" ? PARTIAL_T : STILL_T;
      }
      if (state === "weaving") {
        return now - clock0;
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
    const staticNow = (t: number): boolean => state !== "weaving" || t >= WEAVE_TIMELINE.settle;

    const bake = (now: number): void => {
      if (web === null || bufferCtx === null) {
        return;
      }
      const bakeT = state === "partial" ? PARTIAL_T : WEAVE_TIMELINE.rest;
      bufferCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      bufferCtx.clearRect(0, 0, width, height);
      bakeStaticWeb(bufferCtx, { web, state, t: bakeT, now, palette, dim: 1, still: true, spider, strandOut, weather, plucks: null });
      baked = true;
    };

    const composite = (now: number, t: number): void => {
      if (web === null) {
        return;
      }
      if (!baked) {
        bake(now);
      }
      const { dx, dy } = weaveSwayOffset({ kind: "offset", now, ...weather });
      // Blit the cached web (native px, sway as a whole-canvas translate, dim via globalAlpha)…
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = dim;
      ctx.drawImage(buffer, Math.round(dx * dpr), Math.round(dy * dpr));
      ctx.globalAlpha = 1;
      // …then paint only the live layers on top, in CSS-px space.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawLiveLayers(ctx, { web, state, t, now, palette, dim, still: false, spider, strandOut, weather, plucks }, tracker);
    };

    const paint = (now: number): void => {
      if (web === null) {
        return;
      }
      const t = timelineAt(now);
      if (!reduced && bufferCtx !== null && staticNow(t)) {
        composite(now, t);
      } else {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);
        renderWeaveFrame(ctx, { web, state, t, now, palette, dim, still: reduced, spider, strandOut, weather, plucks }, tracker);
      }
      notify(t);
      frames += 1;
      canvas.dataset["orbWeaveFrames"] = String(frames);
    };

    const loop = (now: number): void => {
      paint(now);
      rafId = requestAnimationFrame(loop);
    };

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
      probe.remove();
    };
  }, [state, seed, hubX, hubY, dim, spider, reduced]);

  const glowPosition = { "--orb-weave-hub-x": `${hubX * PERCENT}%`, "--orb-weave-hub-y": `${hubY * PERCENT}%` } as CSSProperties;
  return (
    <div ref={wrapperRef} aria-hidden={true} data-slot="web-weave" data-weave-state={state} className={cn(slots.root(), className)}>
      {glow ? <div data-slot="web-weave-glow" className={slots.glow()} style={glowPosition} /> : null}
      <canvas ref={canvasRef} data-slot="web-weave-canvas" className={slots.canvas()} />
    </div>
  );
}
