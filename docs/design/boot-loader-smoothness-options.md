---
kind: design
status: active
updated: 2026-08-14
---

# Boot-loader smoothness — options matrix + recommendation

Status: **research/synthesis, no code changed.** Answers the owner's ask ("look at React 19.2 and Base
UI animation… get it super smooth") for `docs/design/login-loading-screen.md`'s `WebWeave`/`WeaveVeil`
(as-built, §9). A live side-eye measured **\~30fps on retina desktop** (1440×900 DPR2, backing 2880×1800;
median 33.3ms/frame) — pixel-fill-bound, caused by `shadowBlur` (CPU gaussian) + a full `clearRect` +
re-stroke of every strand every frame (`web-weave-render.ts` — see receipts below). Mobile is \~55fps
(lower DPR, fine).

## Framing — two layers, don't conflate them

React 19.2 and Base UI operate on the **component/DOM layer**. They cannot make canvas pixels fill
faster — that's GPU/CPU raster work outside React's scheduler entirely. So:

- **Layer A — the weave PAINT** (the actual 30fps bug): a rendering-tech choice. React/Base UI are
  irrelevant here.
- **Layer B — the veil ENTER/EXIT transition** (`WeaveVeil`'s \~360ms mount-fade + dissolve-on-exit):
  where React 19.2 / Base UI *are* the right tools to evaluate.

Confirmed stack versions (read from `pnpm-workspace.yaml` catalog, not assumed):
`react: ^19.2.7`, `react-dom: ^19.2.7`, `@base-ui/react: ^1.7.0` (Base UI v1 stable, not the dead
rc-era `@base-ui-components/react` — per D42 in the ledger).

Code receipts for the diagnosis: `packages/ui/src/art/web-weave/web-weave-render.ts:169-170` sets
`ctx.shadowColor`/`ctx.shadowBlur = CAPTURE_GLOW_BLUR` on the capture strand every frame;
`:185-186` sets `shadowBlur = GLINT_BLUR` for the glint sweep; `:251` sets `shadowBlur = STRAND_OUT_BLUR`
for the A9 handoff beat. `web-weave.tsx:184-187`'s `paint()` does `ctx.clearRect(...)` then
`renderWeaveFrame(...)` — a full clear + full re-stroke of every strand (`drawStrands`, all \~4k
segments) on every rAF tick, unconditionally, even in the `settled` steady state where only sway/dew/
glint actually change. This matches design doc §1.2's own admission: *"Performance. Segments batched
into a few beginPath buckets… settled web can be blitted from an offscreen cache with only sway/dew/
glint painted live"* — that optimization was **designed but never built** (§9 as-built has no offscreen-
cache coupled site).

---

## Layer A — paint technology

### A1. Optimized Canvas 2D (offscreen/back-buffer cache + `drawImage`, drop `shadowBlur`)

**What changes:** render the settled web's static strands (frame + radii + aux + capture, \~4k segments)
once into an offscreen `<canvas>` (or `OffscreenCanvas`), including any glow baked in as a *pre-blurred
sprite* (draw the glow layer once with `shadowBlur`, or better, pre-blur via a cheap box-blur pass, then
cache it as a bitmap). Each live frame becomes: `clearRect` + one `drawImage` of the cached bitmap (a
GPU texture blit) + draw ONLY the live deltas (sway offsets on a small point set, dew twinkle circles,
the glint sweep's lit segments, spider legs) directly. MDN's canvas optimization guide: "pre-render
similar primitives... on an offscreen canvas" so "expensive operations happen once during caching, not
every frame," turning O(n) path ops into O(1) `drawImage` calls, and browsers hardware-accelerate
`drawImage` as a GPU texture copy — cheap regardless of segment count. `shadowBlur` is separately
flagged industry-wide as one of the costliest canvas 2D ops (CPU-side gaussian, no path skip) and should
be avoided in the hot loop entirely — bake it once into the cached bitmap instead of calling it live. [Optimizing Canvas — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas), [Optimising HTML5 Canvas Rendering — ag-grid blog](https://blog.ag-grid.com/optimising-html5-canvas-rendering-best-practices-and-techniques/), [Konva: Shape Caching perf tip](https://konvajs.org/docs/performance/Shape_Caching.html)

**Verdict:** the *sway* problem is the one wrinkle — every strand point currently moves every frame
(`drawPolyline`'s per-point `sin`/`cos` offset), so a naive single static bitmap can't be blitted as-is
during sway. Two fixes, both cheap: (a) the sway amplitude is tiny (2.1px / 1.5px, `SWAY_X_PX`/
`SWAY_Y_PX`) — draw the cached bitmap with a whole-canvas `ctx.translate` approximating the *dominant*
low-frequency sway term instead of per-point sway (visually indistinguishable at this amplitude, and
still leaves room for a *few* strands drawn live if per-point sway must be kept exactly); or (b) cache
the settled web pre-sway and re-composite dew/glint/spider (already drawn live) on top, accepting that
sway freezes into the cached layer's coarse translate. Given the segment count (≤4k) is what made
`shadowBlur` + full restroke expensive, and blit cost is \~flat regardless of segment count, this should
comfortably clear 60fps at DPR2 — the fill-bound cost (shadowBlur gaussian × every strand × every frame)
is eliminated, leaving a single texture blit + a handful of live-painted small primitives (dew circles,
lit glint segments, spider). **Ceiling: 60fps at DPR2, high confidence** — this is the textbook fix for
exactly this failure mode (static-content-redrawn-every-frame + per-stroke shadow), not a research bet.
**Complexity:** medium — the design doc already speced this (§1.2/§9.9 lists it as the deferred
optimization); it's implementing a plan that exists, not inventing one. **Dep cost:** zero — no new
package, `OffscreenCanvas`/second `<canvas>` element are platform APIs. **Stack fit:** perfect — same
module boundary (`web-weave-render.ts` pure painters unchanged in shape, `web-weave.tsx` gains a cache
buffer + rebuild-on-resize/theme-flip, which the component already does for `rebuild()`).

### A2. WebGL (raw, or a light lib: regl / ogl / PixiJS / three.js)

**What changes:** strands become GPU line-geometry (buffers), sway/glint/dew become vertex-shader
uniforms or per-instance attributes, glow becomes a real shader bloom pass. GPU fill is essentially free
at this segment count regardless of DPR.

**Library comparison** (2026 reads): **OGL** — "small, effective WebGL library aimed at developers who
like minimal layers of abstraction, and are comfortable creating their own shaders" — smallest footprint
of the group, no scene-graph/render-loop machinery bought you don't need. **regl** — functional/
declarative low-level wrapper; "requires more graphics knowledge" and is "a bit outdated... too heavy
for simple use cases." **PixiJS** — "the fastest 2D WebGL renderer" but "even heavier than three" —
brings a full 2D scene graph, sprite batching, filters (bloom/glow built-in) — powerful but the wrong
shape for one hand-authored web (you'd fight its retained-mode object model to express strand-by-strand
procedural sag/tension). **three.js** — "the most popular and default choice for any 3D project," heaviest
and 3D-oriented — wrong tool for a flat 2D weave. [webgl-libs-comparison (GitHub)](https://github.com/jsulpis/webgl-libs-comparison), [ogl README](https://app.unpkg.com/ogl@0.0.42/files/README.md), [Three.js vs alternatives — MoldStud](https://moldstud.com/articles/p-a-comprehensive-comparison-of-threejs-and-alternative-webgl-libraries-to-guide-developers)

**Verdict:** **guarantees 60fps at any DPR** — GPU raster of a few thousand line segments is trivial
(this is the kind of load real-time GPU line renderers handle at orders of magnitude more geometry).
But: (1) **dep cost** — even OGL is a new dependency for a codebase that already has strict
vendored-vs-dependency discipline (though the design doc explicitly grants "latitude for a crowning
surface"); raw WebGL with zero deps is possible but is meaningfully more code (shader strings, buffer
management, resize/DPR handling by hand) for a team that has zero prior WebGL surface in this codebase
(the waystone precedent §1.2 explicitly rejected WebGL as "power unneeded… costs shader opacity/
token-color plumbing and readability"). (2) **complexity** — token→color plumbing (currently a clean
`color-mix()` read via computed style, §1.3) has to become uniform-buffer updates; the strand sag/
tension/birth-time geometry (already pure & testable in `web-weave-geometry.ts`) stays as-is, but the
*painting* half goes from readable imperative Canvas 2D calls to shader authoring — a real loss of
approachability for a codebase whose stated pattern is "pure geometry module + thin component" readable
like the waystone. (3) it fixes a problem (60fps *ceiling*) that A1 already solves at zero dep cost —
WebGL only wins if A1's ceiling turns out insufficient, which the analysis above says it won't.
**Stack fit: poor-to-neutral** — solves an already-solved problem at a real complexity and dependency
tax; only justified if profiling A1 shows it can't hit 60fps (unlikely).

### A3. Animated SVG + CSS `@keyframes` — the HOUSE PATTERN (the waystone precedent)

**Revised verdict (supersedes an earlier draft of this doc that took the design doc's SVG rejection at
face value without checking whether this codebase already runs a comparable animated-SVG surface at
60fps in production).** It does: **the waystone** (`packages/ui/src/charts/meter/waystone.tsx` +
`waystone-layers.tsx`; keyframes `packages/ui/src/styles/globals.css:394-720`) is a family of eight
independently animated SVG layers inside one 96×96 viewBox — dial arcs, cardinal glyphs, a star field,
a cloud deck, falling-particle lattices, a sky wash + lightning bolt, wind/fog bands, a sun/moon that
translates along its arc — **zero `<canvas>`, zero `requestAnimationFrame`, zero WAAPI** (confirmed:
no `getContext`/rAF/`.animate` anywhere under `charts/meter/`). It is proven smooth precisely *because*
it never repaints static geometry — CSS `@keyframes` on `translate`/`rotate`/`opacity`/`scale` run on
the compositor thread, and the browser's own retained-mode paint cache keeps unanimated path geometry
as a static layer, repainted zero times per second. That is the structural fix the offscreen-cache
option (A1) has to hand-roll — SVG gets it for free from the platform's rendering model.

**The one real risk, addressed head-on, not hand-waved:** the waystone's busiest layers (star field,
particle lattice) run on the order of a dozen-to-a-few-dozen elements. The weave is bigger — confirmed
by reading `web-weave-geometry.ts`: `RADIUS_COUNT = 16` (`:141`), `CAPTURE_TURNS = 9` /
`SPIRAL_STEP_RAD = 0.11` (`:145,175`) → ≈514 capture-spiral sample points, `AUX_TURNS = 4.4` → ≈251
scaffold points, 16 radii × `RADIUS_SAMPLES = 22` (`:177`) → 352 points, plus frame/bridge/drop
samples — **≈1,300 total path points**, the same order of magnitude the design doc's original "thousands
of dash-managed segments" rejection (§1.2) was gesturing at. **Does that push it over the wall? No —
if segments are grouped correctly, and yes if they're treated as one animated element per point.** The
distinction that matters:

- **Static path *point count* is a one-time paint cost, not a per-frame cost.** A `<path d="...">`
  with 500 points, once painted and not touching `d` again, costs the browser nothing on subsequent
  frames — same as any complex static SVG illustration. This is NOT the same risk as canvas, where
  every point is re-stroked every tick regardless of whether it changed.
- **The real budget is *animated element/layer count*, not point count.** Each CSS-animated
  transform/opacity target is a compositor layer; dozens of them is exactly the waystone's proven
  envelope (6 dial-arc paths + 2 cardinal glyphs + \~10 star circles with individually offset
  twinkle phases (`globals.css:569-593`, the `nth-child(7n+k)` coprime-phase trick — 7 buckets over 10
  stars so no two stars sync) + cloud slots + particle-lattice motes + 2 wind/fog band groups — all
  ticking concurrently today at 96×96, unmeasured-but-unflagged by any side-eye pass). Hundreds of
  *animated* elements is the danger zone; dozens is not.

**Concrete grouping strategy (the answer, not a hand-wave) — port the render module's beats onto this
discipline:**

1. **Weaving draw-on → `stroke-dasharray`/`stroke-dashoffset` per strand, timed by data, not JS.** Each
   strand already carries its birth window (`t0`/`t1` — `WeaveStrand` in `web-weave-geometry.ts:38-45`).
   Set `stroke-dasharray: <path length>` and animate `stroke-dashoffset` from length→0 with
   `animation-delay`/`animation-duration` computed once from `t0`/`t1` at mount (inline custom
   properties, same idiom the render module already uses for `--orb-ws-pitch`/`--orb-weave-hub-x`).
   After that, the browser's own animation timeline runs it — **zero JS per frame**, versus the current
   canvas loop's `Math.sin`/`clearRect`/full-restroke on every rAF tick. This is a *more* efficient
   build phase than what ships today, not just an equally-fast one.
2. **16 radii = 16 elements, not 352.** Each radius is ONE `<path>` (its 22 sample points baked into a
   single `d`); sway/dashoffset apply per-path, not per-point. Same for frame/bridge (1 path each).
3. **Capture spiral (\~514 points) split into \~6-8 arc-ring `<path>` groups**, not one path per point and
   not one path for the whole spiral (a single path can't carry per-ring phase-offset sway). Each ring
   gets a phase-offset `orb-ws-sway`-style transform (coprime `animation-delay` fractions, the star
   precedent at `globals.css:569-593`), so the sway reads organic without per-point sine math. Total
   animated groups for the whole web: 16 radii + \~8 spiral rings + \~1 frame + \~1 bridge + dew drops
   (≈20-30, same order as the design's own dew-density spec) + spider ≈ **60-70 concurrently animated
   elements at peak (weaving phase)**, settling to a much smaller ambient set (sway groups + dew + glint
   overlay + resting spider ≈ 30-40) once settled — both comfortably inside the compositor's practical
   envelope for transform/opacity-only layers, and the ambient-state number is within 2-3x of the
   waystone's own already-shipping-smooth count.
4. **Sway is GROUP-level, never per-point** (matches the waystone's own `orb-ws-sway`/`orb-ws-driftx`
   pattern, `globals.css:427-441` — a whole-group `translate`, not a per-vertex offset). This is a
   visual approximation of the canvas version's per-point ripple, not an identical reproduction — an
   acceptable trade the waystone already normalizes in this codebase (its fog/wind bands sway as whole
   groups too, `waystone-layers.tsx:158-186`).
5. **Spider walk → CSS motion path (`offset-path`/`offset-distance`)** along the precomputed
   `SpiderLeg.pts` polylines (`web-weave-geometry.ts:56-63`, already itinerary data) instead of the
   current per-frame imperative pose tracker (`web-weave-spider.ts`). Resting/breathing spider = a
   `scale` keyframe, identical in spirit to `orb-ws-glow`'s breathe (`globals.css:597-599`). Leg
   articulation (gait) during the walk is the one piece that stays closest to bespoke work — nested
   per-leg groups with phase-offset step keyframes, the same idiom as the wind bands' offset-copy
   trick (`waystone-layers.tsx:160-174`, two gust groups half a cycle apart so wind never fully
   disappears).
6. **Glow: bake it, never compute it live — same lesson as canvas `shadowBlur`, restated for SVG.**
   `<feGaussianBlur>` / CSS `filter: blur()` are expensive when applied to an *animating* element
   (many engines fall back to software raster for filtered layers, reproducing exactly canvas's
   shadowBlur problem in a different API). Fix: bake the glow as a static asset — a duplicated,
   thicker, lower-opacity stroke copy of the same static path (a "glow twin," zero live filter cost)
   for the capture spiral's halo, or a pre-blurred sprite computed once. Filters are fine on layers
   that never move; dangerous on ones that do.
7. **Glint sweep → a rotating gradient-masked overlay, not per-segment alpha math.** The canvas version
   computes an angular distance-from-sweep alpha for every capture/radii segment every frame
   (`web-weave-render.ts:187-192`, `drawGlint`'s `lit()` function) — O(segments) trig per tick. The SVG
   equivalent: a single `<rect>`/`<div>` carrying a conic/radial CSS gradient, masked over the strand
   layer, animated with one `rotate` transform keyframe. This is compositor-only (one rotating layer)
   versus canvas's per-segment recomputation — strictly cheaper, and it's the same "rotating sheen"
   technique used broadly for skeleton-loader shimmer, just repurposed as a directional sweep.
8. **Hidden-tab pause + reduced motion: port the waystone's mechanism verbatim.**
   `[data-paused="true"] * { animation-play-state: paused; }` off one `visibilitychange` subscription
   (`waystone.tsx:123-124`, `globals.css:665-667`), and `@media (prefers-reduced-motion: reduce) { * {
   animation: none; } }` with resting-frame overrides for any animation whose *default* rest state
   would otherwise vanish (the bolt precedent, `globals.css:669-680`) — directly reusable for the
   weave's own reduced-motion REMOVE law (design doc §3.9), replacing the current JS `still` branch
   with the same declarative mechanism the waystone already ships.

**Ceiling: 60fps at DPR2, high confidence, PROVIDED the grouping discipline above is followed** — the
failure mode to avoid is a *naive* SVG port that animates per-point or per-segment (which would indeed
hit a wall, as the design doc's original rejection correctly warned), not SVG-as-a-technology. Grouped
correctly, this is structurally *safer* against the fill-bound failure than canvas, because the browser
enforces "don't repaint what didn't change" automatically instead of relying on hand-rolled cache
invalidation. **Complexity:** high — this is a real rearchitecture of the render module (imperative
painters → declarative grouped SVG + keyframe timing), more invasive than A1's targeted cache-and-drop-
shadowBlur patch, but it is executing an *already-proven-in-this-codebase* pattern, not inventing a new
one. **Dep cost:** zero — CSS, `offset-path`, and SVG masks/gradients are platform features already in
use (globals.css, the waystone). **Stack fit: excellent, and the best philosophical fit** — it aligns
the weave with the single house pattern this codebase already trusts for "smooth, rich, ambient
animated visual," rather than adding a second bespoke rendering strategy (hand-rolled canvas caching)
that the waystone precedent shows wasn't even necessary here.

### Layer A verdict table

| Option | fps ceiling @ DPR2 | Complexity | Dep cost | Stack fit |
| - | - | - | - | - |
| **A3 Animated SVG + CSS keyframes (waystone pattern)** | **60fps, high confidence, if grouped per-unit not per-point** | High (real rearchitecture, but a proven in-house pattern) | None | **Best — the house pattern for exactly this problem shape** |
| A1 Canvas 2D + offscreen cache, drop live `shadowBlur` | 60fps, high confidence | Medium (speced already, smaller diff) | None | Good — solid fallback, keeps the current imperative-canvas shape |
| A2 WebGL (OGL/regl/Pixi/three) | 60fps, guaranteed | High | New dep (even OGL) | Poor–neutral, solves an already-solved problem |

---

## Layer B — the veil enter/exit transition

### B1. React 19.2 — what actually shipped, verified against react.dev

Per [react.dev/blog/2025/10/01/react-19-2](https://react.dev/blog/2025/10/01/react-19-2) (released
2025-10-01) and our `pnpm-workspace.yaml` catalog pin (`^19.2.7`, so we're already on it):

- **`<Activity>` — STABLE.** Two modes, `visible`/`hidden`; in `hidden` mode it unmounts effects and
  defers updates without destroying state/DOM. Useful for *pre-rendering* a screen you're about to
  reveal or *keeping state* of a screen you left — not directly an animation primitive, and not what a
  full-screen loader needs (the loader has exactly one mount, not a kept-alive alternate screen).
- **`useEffectEvent` — STABLE.** Solves the "effect depends on a value it shouldn't re-run for" problem
  (event-like logic pulled out of an Effect's dependency array). Marginally relevant: `WeaveVeil`/
  `WebWeave` already solve this today via **latest-callback refs** (`web-weave.tsx:100-107`,
  `onSettledRef`/`onPhaseRef` written in an effect, read in the rAF loop) — the exact pattern
  `useEffectEvent` now gives a name and compiler-checked correctness to. **A legitimate, low-risk
  refactor**: swap the manual ref-pattern for `useEffectEvent` in `WebWeave`'s mount effect, but it is
  a code-quality/correctness polish, not a smoothness lever — it changes zero rendered frames.
- **`cacheSignal` — STABLE, but React Server Components only.** Not applicable (no RSC in this client
  app's boot path).
- **Performance Tracks, Partial Pre-rendering, SSR batching** — all STABLE but server/profiling
  features, not applicable to a client-only boot veil.
- **`<ViewTransition>` — NOT STABLE, NOT SHIPPED IN 19.2.** Confirmed against
  [react.dev/reference/react/ViewTransition](https://react.dev/reference/react/ViewTransition): *"This
  feature is available in the latest Canary version of React"* — Canary/Experimental channel only,
  imported as `unstable_ViewTransition`, requires overriding to `react@experimental`/
  `react-dom@experimental` builds. **Do not use it.** Shipping an `unstable_` API pinned to a moving
  Canary build in a production boot path is exactly the kind of speculative-dependency risk the
  project's own discipline (vendored-vs-dependency, no gratuitous surface area) rules out, and it isn't
  even on our installed `^19.2.7` stable line.

**Bottom line on React 19.2 for Layer B:** nothing in the stable 19.2 feature set is an animation
primitive for a full-screen dissolve. The one applicable item (`useEffectEvent`) is a correctness/
readability polish already informally implemented via refs — worth doing opportunistically, not a
smoothness fix, and out of scope for "make it 60fps."

### B2. Base UI's animation model

Per [base-ui.com/react/handbook/animation](https://base-ui.com/react/handbook/animation): Base UI
exposes state via data attributes — **`[data-open]`/`[data-closed]`** (drive CSS *animations*) and
**`[data-starting-style]`/`[data-ending-style]`** (drive CSS *transitions* — "the initial/final style to
transition from/to"). Base UI's own guidance prefers **transitions over animations** because "a
transition can be smoothly cancelled midway" — directly relevant to an *interruptible* dissolve (the
`data-app-ready` gate can fire mid-weave per §9.3, and the exit must not look broken if that happens
mid-transition). **`keepMounted`** on Portal-hosted components keeps the DOM node present through the
exit animation so it can finish before unmount, and Base UI detects animation completion via
`element.getAnimations()` rather than a fixed timeout.

**Is there a Base UI primitive well-suited to a full-screen veil?** Base UI ships interactive overlay
primitives (Dialog, Popover, Tooltip) with this exact open/close data-attribute contract, but a
boot-time loading veil isn't a dialog/popover — it has no trigger, no focus trap needs, no dismiss
semantics. **`BootVeil` (as-built, `features/app-shell/components/boot-veil.tsx`) already implements the
CSS-transition half of this exact pattern by hand** — per §9.4/§9.3 of the design doc: `opacity` +
`filter: blur(var(--blur-strength))` transitioning on `--motion-layout`/`--ease-out-expo`, unmount on
`transitionend`, degraded-hidden-tab safety timer as the `getAnimations()`-completion-detection
equivalent. This is functionally the same contract Base UI's data-attribute model formalizes, just
hand-rolled with a boolean `open` prop instead of a Base UI primitive underneath. **Verdict: Base UI's
*Portal/Popup* primitives are the wrong shape to adopt here** (no dialog semantics needed; wrapping one
just to inherit its attribute contract would add indirection over code that already does the right
thing), but Base UI's animation *pattern* (transitions-not-animations, starting/ending-style,
completion-detection-not-timeout) is exactly what `BootVeil` already follows. No change needed here —
this is confirmation, not a gap.

### B3. Is a dedicated animation lib (Motion / motion-one) warranted?

Per [motion.dev/docs/base-ui](https://motion.dev/docs/base-ui) and the CSS-vs-Motion guidance the
research surfaced: **"CSS handles enter/exit for elements that don't need gesture response or layout
tracking like tooltips and popovers, while Motion handles anything with gesture input, spring physics,
or layout shifts."** The veil's dissolve is a single compositor-friendly two-property transition
(`opacity` + `filter`), non-interactive (no drag/gesture), no shared-layout animation, no spring physics
requirement (the design's `--ease-out-expo` timing is a plain cubic-bezier, already achievable in pure
CSS). This is precisely the case the ecosystem's own guidance says CSS suffices for.

**Verdict: no — a dedicated animation lib is not warranted for Layer B.** `BootVeil`'s existing
hand-rolled CSS-transition + `transitionend` approach already matches best practice (Base UI's own
documented pattern) and adding Motion would be a dependency for a two-property compositor transition
that CSS already does natively, on GPU compositor threads, with zero JS scheduling involvement. The
waystone independently confirms this is the house answer for enter/exit too: its `.orb-ws-enter`
keyframe (`globals.css:633-634`, `animation: orb-ws-enter var(--motion-transit) ease-out both;`,
applied per-layer in `waystone-layers.tsx:118,164,177,282` — precipitation, wind/fog bands, and the
celestial body each wrap their own `orb-ws-enter` group) is a plain CSS keyframe entrance, and reduced
motion collapses it the same REMOVE way (`globals.css:669-680`, `[data-reduced-motion="true"] [data-slot="waystone"] * { animation: none; }` with the one necessary resting-frame exception). No
animation library anywhere in this codebase's two richest ambient-motion surfaces.

### Layer B verdict table

| Option | What it's for | Stable in our stack? | Verdict |
| - | - | - | - |
| `<Activity>` | keep-alive/pre-render alternate screens | Yes (19.2) | Not applicable — loader has one mount, no alternate screen to pre-render |
| `useEffectEvent` | effect dependency-array correctness | Yes (19.2) | Applicable as an opportunistic polish of the existing ref pattern; not a smoothness fix |
| `<ViewTransition>` | cross-DOM-state animated transitions | **No — Canary/experimental only, `unstable_` prefix** | Do not use; not on our `^19.2.7` line |
| Base UI Portal/Popup + `data-*` attrs | dialog/popover open-close animation contract | Yes, but wrong primitive shape for a non-dialog veil | Don't adopt the primitive; the *pattern* is already followed by hand in `BootVeil` |
| Motion / motion-one | gesture/spring/shared-layout animation | N/A (not installed) | Not warranted — the veil's transition is a plain 2-property compositor transition, CSS's exact sweet spot |

---

## Recommendation

**Layer A (the actual 30fps bug): rebuild the weave as animated SVG + CSS `@keyframes`, following the
waystone's proven house pattern (A3) — retire the canvas/rAF renderer.** This codebase already has a
smooth, rich, ambient-animated visual in production (`packages/ui/src/charts/meter/waystone.tsx` +
`waystone-layers.tsx`, keyframes `globals.css:394-720`) built entirely on SVG geometry + compositor-only
CSS animation, with zero canvas, zero rAF, zero WAAPI — and it is smooth *because of*, not despite, that
choice: static geometry is paint-cached by the browser instead of hand-rolled-cached by application
code, and only `translate`/`rotate`/`opacity`/`scale` ever animate. That is a direct, mechanical fix for
this weave's exact failure mode (full `clearRect` + full restroke + live `shadowBlur` every rAF tick,
`web-weave-render.ts:169-186,251`, `web-weave.tsx:184-187`) — the SVG version structurally *cannot*
reproduce that mistake, because unanimated paths never repaint regardless of point count. The concrete
engineering plan (detailed above, A3): 16 radii as 16 static `<path>` elements, the capture spiral split
into \~6-8 phase-offset ring groups (never per-point), the weave-in draw-on driven by
`stroke-dashoffset` keyframes timed from the strands' already-existing `t0`/`t1` birth-window data (zero
JS per frame — a strict improvement over today's `Math.sin`-every-tick loop), the spider's walk on CSS
`offset-path`/`offset-distance` over the existing `SpiderLeg` polylines, glow baked as a static
duplicate-stroke twin (never a live filter — the SVG-filter equivalent of the shadowBlur mistake), the
glint sweep as one rotating gradient-masked overlay instead of O(segments) per-frame trig, and hidden-tab
pause / reduced-motion REMOVE ported verbatim from the waystone's `[data-paused]`/`visibilitychange` and
`prefers-reduced-motion` mechanisms. Expect 60fps at DPR2 with high confidence, and — unlike A1 below —
this ceiling holds by construction (the compositor doesn't care about DPR for transform/opacity layers)
rather than by careful cache management.

**Fallback, not the pick: A1 (optimized Canvas 2D + offscreen cache, drop live `shadowBlur`) — smaller
diff, same house-tested imperative-canvas shape, ship it instead if the SVG rearchitecture's lift doesn't
fit the lane's budget.** It's the fix the design doc itself speced and never built (§1.2, §9.9), and it
also clears 60fps at DPR2 with high confidence by eliminating the same two cost centers (shadowBlur
gaussian, full-web restroke) without touching the geometry module or token-palette wiring. Between the
two: **A3 is the stronger long-term answer** (it's the pattern this codebase already trusts, and it
solves the caching problem structurally instead of procedurally); **A1 is the cheaper answer** (smaller,
more localized diff against code that already works, no rearchitecture risk). The orchestrator should
pick based on lane budget, not fps ceiling — both hit the target.

**Do not reach for WebGL (A2)** — guarantees the ceiling too, but at real dependency and complexity cost
to solve a problem both A3 and A1 already solve for free; only escalate here if both are implemented,
profiled, and *still* short of 60fps (very unlikely given the diagnosis).

**Layer B (the veil transition): no rendering-tech change needed — `BootVeil`'s existing hand-rolled CSS
transition already is the "right modern-stack way," and the waystone independently confirms it.** Both
`BootVeil` (opacity+filter, `transitionend`-driven unmount, §9.3/§9.4 of the design doc) and the
waystone's `.orb-ws-enter` (`globals.css:633-634`, applied per-layer in `waystone-layers.tsx`) arrive at
the same answer Base UI's own docs prescribe: transitions over animations for interruptibility,
completion-detection over fixed timeouts, GPU-compositable properties only. Do not adopt a Base UI
Dialog/Popover primitive for it — wrong semantic shape. Do not adopt Motion/motion-one — the transition
is a plain compositor animation, the case CSS is built for, and neither of this codebase's two richest
motion surfaces uses one. The one optional, low-risk polish: adopt React 19.2's stable `useEffectEvent`
in `WebWeave`'s mount effect to replace the manual `onSettledRef`/`onPhaseRef` latest-callback pattern
(`web-weave.tsx:100-107`) — a correctness/readability improvement, explicitly NOT part of the fps fix,
moot entirely if `WebWeave` is rebuilt as SVG per A3 (the effect shape changes anyway).

**Dependency ledger:** the recommended path (A3) adds **zero new dependencies** — CSS `@keyframes`,
`offset-path`, SVG masks/gradients, and `stroke-dashoffset` are all platform features already exercised
by the waystone. The fallback (A1) is equally dependency-free. Either way, the crowning-surface latitude
the design doc was granted (§ "we can go HARD") gets spent on the weave's *craft*, not on adopting an
unproven rendering stack or an animation library the transition never needed.

**What I could not confirm / flag explicitly:** exact post-fix fps was not measured for either A3 or A1
(no code was changed per this task's scope) — both "60fps, high confidence" verdicts are diagnosis-driven
predictions grounded in a proven in-house precedent (A3, the waystone) or a textbook fix for a
textbook failure mode (A1), not benchmarked results. Whichever the orchestrator picks, the build lane
should re-run the side-eye fps measurement (the same 1440×900 DPR2 protocol that produced the 33.3ms/
frame baseline) as its own verification receipt before calling the fps problem closed, per this repo's
"verification — static is not done" law. One SVG-specific unknown worth flagging: `offset-path`/
`offset-distance` browser support is solid in Chromium/Firefox but has a weaker Safari history — worth a
quick cross-browser spot-check during the build lane if Safari/WebKit is a supported target for this
app; if it isn't (or if it's an acceptable-degradation surface), this is a non-issue.
