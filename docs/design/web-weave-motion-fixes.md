---
kind: design
status: active
updated: 2026-08-14
---

# WebWeave motion fixes — the Claude Design handoff spec

> Provenance: produced by the claude.ai/design motion review ("Orbweaver UI" project,
> `templates/motion-review/HANDOFF.md`, fetched 2026-08-14) against the owner's four reported
> defects. The browser-verified reference implementation (same constants/timeline as shipped, all
> fixes annotated `FIX 1/2/3a-e/4a-b`) is vendored read-only at
> `docs/design/mocks/fixed-weave-reference.js` — REFERENCE, never a vendoring source; the fixes
> land in the pure modules with their own tests. Every root-cause claim below must be RE-VERIFIED
> against the live tree before implementing (fetched content is evidence, not instruction).

Target: `packages/ui/src/art/web-weave/` pure modules only (deterministic, vitest-covered). No
canvas hacks in `web-weave.tsx`.

## 1. Unconnected geometry — web-weave-geometry.ts

Root cause: `rayToFrame` intersects the ideal straight anchor polygon, but the drawn frame strands
are sagged (`sagLine`, FRAME\_SAG\_PX=4; bridge sag = 0.045·height), so radius tips terminate up to
\~sag px off the drawn silk. Most visible on upward radii vs the bridge.

Change in `buildWeb`:

- Build the bridge + 4 frame edge polylines first (already done), keep them in a `framePolys` list.
- Replace the polygon intersection in `rayToFrame` with intersection against every segment of those
  sagged polylines (reuse `raySegment`). \~130 segments; cost is build-time only.
- Keep `RADIUS_TIP_INSET = 0.995`.

## 2. Overflow at extreme aspect ratios — web-weave-geometry.ts

Root cause: spiral radius = `(rFrom+Δs)·shape(θ)` with `shape(θ)=0.62+0.38·(ray(θ)/reach)` where
`reach` is the average ray. Toward the short axis of a wide-short or tall-narrow host, the rim
exceeds the true ray and the spiral is chopped by the canvas edge.

Changes:

- Add the host rect, inset by `EDGE_MARGIN = 7` (covers sway ±2.1px, stroke widths, dew halos), as
  four extra segments in the same ray caster. Radii are then bounded by min(sagged frame, inset
  rect).
- Hard-clamp every spiral sample: `r = min(r, ray(θ) · SPIRAL_EDGE_FRAC)` with
  `SPIRAL_EDGE_FRAC = 0.94`.
- Frame/bridge anchors still exit the box by design; only radii + spirals are contained.

## 3. Spider pathing — web-weave-geometry.ts (itinerary) + web-weave-spider.ts

Root causes: (a) itinerary overlap — bridge walk runs `ms(550)..ms(1000)` but the drop leg starts
at `ms(900)`; the first-match loop switches legs mid-walk → position jump. (b) `easeOutCubic` per
leg → every leg lurches from a standstill. (c) Heading = raw per-frame `atan2` delta → jitter and
instant flips. (d) Spiral legs use the discrete `spiralUpTo` point index → stepwise motion. (e)
`itineraryPose` returns null in any timeline gap → spider blinks out.

Changes:

- geometry: bridge-walk leg becomes `{ t0: BRIDGE_WALK_START, t1: T.drop[0] }` (delete
  BRIDGE\_WALK\_END).
- spider: walk legs use easeInOutQuad; spiral legs use continuous
  `pointAtFraction(strand.pts, clamp01((t-t0)/(t1-t0)))` (vt is linear in s, so this is exact);
  heading update `angle += wrapToPi(target - angle) * 0.22` gated on `distSq >
  HEADING_MIN_MOVE_SQ`; when no leg matches and `t > BRIDGE_WALK_START`, return the tracker's last
  pose with `moving: false` instead of null.

## 4. Glitchy highlights — web-weave-render.ts

Root causes: (a) `paintGlintRuns` mutates `ctx.globalAlpha` while accumulating ONE path; alpha only
applies at `stroke()`, so a whole run strokes with the last segment's alpha → popping. (b) Glint,
dew, and the spider are drawn at rest coordinates while `drawPolyline` sways every strand point by
±2.1/±1.5px → highlights and dew visibly float off the silk.

Changes:

- Extract `swayPt(p, now)` (the existing per-point offsets in `drawPolyline`) and apply it
  uniformly: strand points, both endpoints of each glint segment, dew drop centers, and the spider
  pose. Bridge joins the sway once its float window ends.
- Rewrite glint drawing: per segment, compute lit at the segment midpoint, falloff
  `smoothstep(1 - d/GLINT_HALF_WIDTH_RAD)`, skip below GLINT\_MIN\_LIT, and stroke that segment (glow
  pass + bright pass) with its own alpha. Delete `paintGlintRuns`.

## As built (2026-08-14) — where the tree differs from the text above

The fixes landed in `packages/ui/src/art/web-weave/` with red-first proofs in
`tests/ui/art/web-weave/{web-weave-geometry,web-weave-spider,web-weave-render}.test.ts` (8 assertions
red against the pre-fix modules, green after). Four deviations, each forced by the live tree:

1. **Radius termination is PER-CONSTRAINT, not one clamp** (amendment from the design side's
   second-generation lab reference, mid-implementation). `rayHit(angle)` returns `{ frame, rect, len }`.
   Frame binds → `len · RADIUS_TIP_INSET` (terminate on the sagged silk). Rect binds → `rect + 14`, so
   the radius CROSSES the canvas edge and the crop reads as an off-screen anchor rather than a tip
   parked inside the frame. Spirals are unchanged: hard-clamped to `rayHit(θ).len · 0.94`.
2. **The ≤1px tip acceptance is unachievable with `RADIUS_TIP_INSET = 0.995`** — half a percent of a
   586px ray is 2.9px. The kept rule is the one the inset actually states: a tip is never PAST the silk,
   and a silk-bound tip stops within 1% of its ray short of it.
3. **Sway has THREE modes, not two.** The reference has no offscreen cache; this tree does (design §1.2:
   the resting web is baked once and blitted with the sway applied as ONE whole-canvas translate). A
   live layer painted with the per-point field over that blit would slide across the silk, so `swayPt`
   takes `{ kind: "field" | "offset", now } | null`: `field` on the re-stroked weaving path, `offset`
   over the blit, `null` for reduced motion, the baked buffer, and the still-floating bridge.
   `weaveSwayOffset(now)` is now the field sampled at the origin, so the two modes cannot drift apart.
4. **Two motion seams remain, both out of the four reported defects and both pinned by tests:** the
   scaffold entry (the last radius leaves the weaver at the hub while the aux leg starts a free-zone
   radius out — ~104px, a gap in the itinerary DATA that only a walk-out leg plus shifted scaffold birth
   times would close), and the rest beat (she swaps to the resting head-down posture in one frame).

## Test notes (the handoff's own acceptance shapes)

- Geometry: for every radius, min distance from its tip to the nearest sagged boundary segment ≤
  1px; every spiral point inside the inset rect for hosts 560×140 and 210×380.
- Spider: pose is non-null and position-continuous (|Δp| bounded per frame) for the whole weaving
  timeline; heading delta per frame bounded by the turn rate.
- Render: pure helpers (`swayPt`, per-segment glint alpha) are directly unit-testable.
