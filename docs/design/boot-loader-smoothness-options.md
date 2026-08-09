# Boot-loader smoothness — options matrix + recommendation

Status: **research/synthesis, no code changed.** Answers the owner's ask ("look at React 19.2 and Base
UI animation… get it super smooth") for `docs/design/login-loading-screen.md`'s `WebWeave`/`WeaveVeil`
(as-built, §9). A live side-eye measured **~30fps on retina desktop** (1440×900 DPR2, backing 2880×1800;
median 33.3ms/frame) — pixel-fill-bound, caused by `shadowBlur` (CPU gaussian) + a full `clearRect` +
re-stroke of every strand every frame (`web-weave-render.ts` — see receipts below). Mobile is ~55fps
(lower DPR, fine).

## Framing — two layers, don't conflate them

React 19.2 and Base UI operate on the **component/DOM layer**. They cannot make canvas pixels fill
faster — that's GPU/CPU raster work outside React's scheduler entirely. So:

- **Layer A — the weave PAINT** (the actual 30fps bug): a rendering-tech choice. React/Base UI are
  irrelevant here.
- **Layer B — the veil ENTER/EXIT transition** (`WeaveVeil`'s ~360ms mount-fade + dissolve-on-exit):
  where React 19.2 / Base UI *are* the right tools to evaluate.

Confirmed stack versions (read from `pnpm-workspace.yaml` catalog, not assumed):
`react: ^19.2.7`, `react-dom: ^19.2.7`, `@base-ui/react: ^1.7.0` (Base UI v1 stable, not the dead
rc-era `@base-ui-components/react` — per D42 in the ledger).

Code receipts for the diagnosis: `packages/ui/src/art/web-weave/web-weave-render.ts:169-170` sets
`ctx.shadowColor`/`ctx.shadowBlur = CAPTURE_GLOW_BLUR` on the capture strand every frame;
`:185-186` sets `shadowBlur = GLINT_BLUR` for the glint sweep; `:251` sets `shadowBlur = STRAND_OUT_BLUR`
for the A9 handoff beat. `web-weave.tsx:184-187`'s `paint()` does `ctx.clearRect(...)` then
`renderWeaveFrame(...)` — a full clear + full re-stroke of every strand (`drawStrands`, all ~4k
segments) on every rAF tick, unconditionally, even in the `settled` steady state where only sway/dew/
glint actually change. This matches design doc §1.2's own admission: *"Performance. Segments batched
into a few beginPath buckets… settled web can be blitted from an offscreen cache with only sway/dew/
glint painted live"* — that optimization was **designed but never built** (§9 as-built has no offscreen-
cache coupled site).

---

## Layer A — paint technology

### A1. Optimized Canvas 2D (offscreen/back-buffer cache + `drawImage`, drop `shadowBlur`)

**What changes:** render the settled web's static strands (frame + radii + aux + capture, ~4k segments)
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
`shadowBlur` + full restroke expensive, and blit cost is ~flat regardless of segment count, this should
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

### A3. Animated SVG (stroke-dashoffset weave + CSS/WAAPI)

**What changes:** every strand becomes an SVG `<path>` animated via `stroke-dasharray`/
`stroke-dashoffset` (the classic "draw-on" trick) or WAAPI, sway via CSS custom properties or a
transform, dew/glint as separate elements.

**Verdict:** the design doc already ran this analysis (§1.2, live in the repo) and rejected it for
concrete, still-valid reasons: the capture spiral is "thousands of dash-managed segments," the spider
needs to walk an articulated-leg path tangent (no SVG primitive expresses "legs following a moving
strand tip"), sag-tension interpolation *mutates geometry every frame* (a `<path d>` string rewrite per
frame, not a cheap transform — this is worse than canvas per-frame stroke, since it forces DOM
attribute parsing + layout invalidation on top of paint), and dew/glint are point-level painters that
map to per-point DOM elements at the CT-proven density this web runs at (~4k segments). SVG's real
strength — compositor-friendly CSS/WAAPI transforms on a *few dozen* static shapes — is not what this
component needs; it needs per-frame *procedural mutation* of thousands of points, which is exactly what
DOM-based rendering is bad at (each mutation risks layout/paint, unlike canvas's flat pixel buffer).
**Ceiling: uncertain, likely worse than current canvas** for the live-weave and settled-sway states
specifically (bounded animated primitives — dew twinkle, glint sweep — would be fine in isolation, but
the strand geometry itself doesn't fit SVG's model without either baking to static paths, defeating the
whole point, or fighting per-frame `d` attribute churn). **Complexity:** high (rearchitects the entire
render module for a worse fit). **Dep cost:** zero. **Stack fit:** poor — contradicts the design's own
prior rejection with no new information that changes the calculus.

### Layer A verdict table

| Option | fps ceiling @ DPR2 | Complexity | Dep cost | Stack fit |
| --- | --- | --- | --- | --- |
| **A1 Canvas 2D + offscreen cache, drop live `shadowBlur`** | **60fps, high confidence** | Medium (speced already) | None | Excellent |
| A2 WebGL (OGL/regl/Pixi/three) | 60fps, guaranteed | High | New dep (even OGL) | Poor–neutral, solves an already-solved problem |
| A3 Animated SVG | Uncertain, likely worse | High | None | Poor — design already rejected this with valid reasons that still hold |

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
that CSS already does natively, on GPU compositor threads, with zero JS scheduling involvement.

### Layer B verdict table

| Option | What it's for | Stable in our stack? | Verdict |
| --- | --- | --- | --- |
| `<Activity>` | keep-alive/pre-render alternate screens | Yes (19.2) | Not applicable — loader has one mount, no alternate screen to pre-render |
| `useEffectEvent` | effect dependency-array correctness | Yes (19.2) | Applicable as an opportunistic polish of the existing ref pattern; not a smoothness fix |
| `<ViewTransition>` | cross-DOM-state animated transitions | **No — Canary/experimental only, `unstable_` prefix** | Do not use; not on our `^19.2.7` line |
| Base UI Portal/Popup + `data-*` attrs | dialog/popover open-close animation contract | Yes, but wrong primitive shape for a non-dialog veil | Don't adopt the primitive; the *pattern* is already followed by hand in `BootVeil` |
| Motion / motion-one | gesture/spring/shared-layout animation | N/A (not installed) | Not warranted — the veil's transition is a plain 2-property compositor transition, CSS's exact sweet spot |

---

## Recommendation

**Layer A (the actual 30fps bug): ship A1 — optimized Canvas 2D with an offscreen/back-buffer cache,
and stop calling `shadowBlur` in the live per-frame path.** This is the fix the design doc already
speced (§1.2, §9.9) and never built — it isn't new research, it's closing a known gap. Concretely:
cache the settled web's static strand geometry (post-`shadowBlur`-baked glow included) into an offscreen
canvas/bitmap once per `rebuild()` (mirrors the existing resize/theme-flip rebuild triggers already in
`web-weave.tsx`), then each rAF tick does one `drawImage` blit + paints only the genuinely dynamic
layers live (dew twinkle, glint sweep, spider, and either a whole-canvas translate approximating sway or
a small subset of strands kept live if per-point sway must be exact). This should clear 60fps at DPR2
with high confidence — it eliminates the two named cost centers (shadowBlur gaussian, full-web restroke)
without touching the geometry module, the token-palette wiring, or the deterministic-seed contract.
**Do not reach for WebGL** — it guarantees the fps ceiling too, but at a real dependency and complexity
tax to solve a problem A1 already solves for free; escalate to WebGL only if A1 is implemented, profiled,
and *still* short of 60fps (unlikely given the diagnosis). **Do not reach for SVG** — the design doc's
existing rejection holds; nothing in this research changes that calculus, and the geometry (thousands of
per-frame-mutated points) is the shape SVG/DOM handles worst.

**Layer B (the veil transition): no rendering-tech change needed — `BootVeil`'s existing hand-rolled CSS
transition already is the "right modern-stack way."** It independently arrived at the exact pattern Base
UI's own docs prescribe (transitions over animations for interruptibility, completion-detection over
fixed timeouts, `opacity`+`filter` as GPU-compositable properties). Do not adopt a Base UI Dialog/Popover
primitive for it — wrong semantic shape, would add indirection with no smoothness gain. Do not adopt
Motion/motion-one — the transition is a plain two-property compositor animation, the case CSS is built
for; adding a JS animation library here would be dependency weight for zero measurable benefit. The one
optional, low-risk polish: adopt React 19.2's stable `useEffectEvent` in `WebWeave`'s mount effect to
replace the manual `onSettledRef`/`onPhaseRef` latest-callback pattern (`web-weave.tsx:100-107`) — a
correctness/readability improvement, explicitly NOT part of the fps fix, and safe to bundle into the
same lane or skip entirely.

**Dependency ledger:** the recommended path adds **zero new dependencies** — `OffscreenCanvas` and a
second `<canvas>` element are platform APIs already reachable from the existing `web-weave.tsx` module.
This keeps the crowning-surface latitude the design doc was granted (§ "we can go HARD") spent on the
weave's *craft*, not on adopting an unproven rendering stack or an animation library the transition
doesn't need.

**What I could not confirm / flag explicitly:** exact post-fix fps was not measured (no code was
changed per this task's scope) — the "60fps, high confidence" verdict for A1 is a diagnosis-driven
prediction (the two named cost centers are textbook canvas-perf killers and this is the textbook fix),
not a benchmarked result; the build lane implementing A1 should re-run the side-eye fps measurement as
its own verification receipt, per this repo's "verification — static is not done" law.
