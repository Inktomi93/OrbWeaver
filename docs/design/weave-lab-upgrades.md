---
kind: design
status: active
updated: 2026-08-14
---

# Weave Lab — the second-generation motion upgrade spec

> Provenance: the claude.ai/design motion review's SECOND handoff ("Orbweaver UI" project,
> `templates/weave-lab/HANDOFF.md`, fetched 2026-08-14). Extends — and in one place AMENDS —
> [`web-weave-motion-fixes.md`](web-weave-motion-fixes.md); the design side's own sequencing is
> "land the defect fixes first." Browser-verified references vendored read-only:
> [`mocks/weave-lab-reference.js`](mocks/weave-lab-reference.js) (engine, `<weave-lab>`) and
> [`mocks/weave-spinner-reference.js`](mocks/weave-spinner-reference.js) (loader). Same constants
> and timeline as shipped. REFERENCE, never a vendoring source; every claim gets re-verified
> against the live tree before implementing.

## ⚠ Amendment to motion-fixes §2 (radius termination at the box)

The lab's `buildWeb` computes the ray's frame-hit and rect-hit SEPARATELY (`rayInfo → {frame,
rect, len}`): when the RECT binds (`rect < frame`), the radius **overshoots** past the edge
(`len = rect + 14`) so the canvas crop reads as an offscreen anchor — never a tip floating inside
the box at the inset rect. When the FRAME binds, terminate on the sagged silk
(`len · RADIUS_TIP_INSET`). Spirals still hard-clamp inside (`rayLen(θ) · SPIRAL_EDGE_FRAC`).
Relayed to the motion-fix lane 2026-08-14 mid-flight.

## 1. Silk physics — new pure module `web-weave-physics.ts`

A pure displacement field composed over the baked geometry (no rebuild):

- **Pluck**: damped transverse traveling wave per strand.
  `offset(s, t) = amp · e^(−age/380) · e^(−|s−s0|·len/42) · sin(age·0.05 − |s−s0|·len·0.16)`,
  life 1500ms, applied along the local strand normal, ≤6 live plucks per strand.
- **Shiver**: scalar web-wide sway-amplitude boost, `+0.5` per pluck (cap 1), decay `e^(−dt/650)`
  — the "vibration travels outward" read.
- **Wind** (0..1 prop): sway amplitude ×(1 + wind·2.6), gust modulation
  `1 + (sin(t·3e−4)·0.5 + sin(t·7.3e−4 + x·0.002)·0.5)·wind`.
- All keyed off the existing `swayPt`; deterministic given (plucks\[], t) → unit-testable.

## 2. Prey response — `web-weave-spider.ts` state machine

`rest → alert (freeze 170ms, orient) → sprint → inspect (front-leg taps) → return → rest`

- Disturbances come from pointer hits on strands (hit radius \~10px, 18px re-trigger throttle);
  ignore hits within 24px of the hub; ignore during weaving/strand-out.
- Sprint: straight-line at `speed(character)` px/ms with burst modulation
  `0.55 + 0.85·|sin(t·0.012)|`; return at 45% speed; heading via shortest-arc lerp.
- Deterministic given the event list — vitest can drive it with synthetic disturbances.

## 3. Character — gait + idle life

- Burst locomotion on itinerary walks: `p′ = p − a·sin(4πp)/(4π)` on top of easeInOutQuad
  (derivative stays positive). `a` per character.
- Character presets: calm / lively / full → {burst, gaitHz, gaitAmp, turnRate, sprint, inspectMs,
  twitch}. Values in the `CHARACTER` map in the lab reference.
- Idle twitches at rest: hash-scheduled \~2.6s slots (P=0.45), 20% tail of the slot plays an
  abdomen shiver + single leg lift. Sprint gait: hz 0.034, amp 0.36.
- Inspect: front two legs tap (`sin(t·0.03)·0.28`).
- Anatomy v2 (drawSpiderBody): leg bases grouped \[0.38, 0.8, 1.9, 2.35] (I/II forward, III/IV
  back, flank gap), per-leg length scale \[1.12, .95, .85, 1.05], three segments (femur 5.6 /
  tibia 4.6 / tarsus 2.6, widths 1.25/.95/.7), alternating-tetrapod phase
  `((i%2)+(side<0))%2·π`, pedicel + teardrop tail + flank speckles on the abdomen.
- The lab also has the spider LAY THE FRAME herself (edge itinerary with walk-back legs — the
  `edgeDefs`/`fLeg` block) instead of frame strands appearing unattended.

## 4. WebSpinner — weave loop instead of rotation

`weave-spinner-reference.js`: same glyph constants as OrbWeb (8 spokes 2.6→13.6, spiral r 4→13.5,
2.6 turns). Spiral stroke-dash loop over 2.6s: draw-in 0→52%, hold to 68%, pay-out to 100%
(offset → −L); spokes breathe opacity .65→.95; hub r pulses; whole glyph rotates 360° / 14s.
CSS-only, `currentColor`, `role="status"` + sr-only label, reduced-motion = static full glyph.
Sizes sm/md/lg/xl/hero = 14/18/24/36/56px. (Repo mapping: the shipped WebSpinner's motion lives in
globals.css keyed on `data-animate` + the icon-seal glyphs — the loop mechanic ports onto that
system; sizes stay the shipped 16/20/24/32/48 table unless the owner rules otherwise.)

## 5. WebWeave API additions

- `interactive?: boolean` — enables pointer plucks + prey AI (default false; keeps the
  aria-hidden/pointer-transparent contract when off).
- `wind?: number` (0..1), `character?: "calm" | "lively" | "full"`, `tempo?: number` (timeline
  multiplier — the boot story runs weaving at 2.2 ≈ 5.8s).
- Boot composition: `WeaveVeil open label` over a weaving `WebWeave`; `onSettled` flips `open`
  false; `onExited` unmounts. No new veil API. (The lab adds a `weave-settled` DOM event; the
  shipped component already has the `onSettled` prop — no new seam needed.)
- Strand-out as navigation: trigger `state="strand-out"`, crossfade content at \~1300ms while she
  rides the strand; restore with `state="settled"`.

## As built (2026-08-14)

Landed across `packages/ui/src/art/web-weave/` (+ the spinner's CSS), red-first where the spec gave an
acceptance shape; 58 unit tests in `tests/ui/art/web-weave/` and 16 CTs. Where the tree differs:

1. **The scaffold seam DISSOLVED rather than moving.** §3's own thesis (no unattended silk) applies to
   the aux spiral too: the last radius left her at the hub while the scaffold began a free-zone radius
   out, so she jumped ~100px and its first ring was spun by nobody. She now WALKS OUT over the first 8%
   of the scaffold beat, and the scaffold's birth times start when she arrives. The build's itinerary
   is now gap-free end to end (previously one pinned 104px seam).
2. **`character` defaults to `calm`, and `calm.turnRate` is the SHIPPED 0.22, not the lab's 0.18.** The
   lab defaults to `full`; adopting that would have re-livened the motion the owner's "turbo" ruling
   calmed, for every existing host, without anyone asking. Hosts opt IN.
3. **`interactive` flips pointer-events but NOT `aria-hidden`** (the spec says "pointer-events + aria").
   The canvas has no accessible name, no state to announce and no keyboard path to the pluck; un-hiding
   it would advertise an affordance that does not exist and put a dead end in the tab order's
   neighbourhood. Ornament that answers a cursor is still ornament. Flagged for a `side-eye` lens.
4. **Wind and a live pluck drop the frame off the offscreen cache** (and back on when the last ring
   dies). The perf note says keep the bake/composite split; a cached blit can only sway as one rigid
   sheet, so per-point weather and a ringing strand cannot be expressed through it. The DEFAULT path
   (no wind, nothing touched) is unchanged and still cached.
5. **The spinner's pay-out runs the dash offset to +L, not −L.** With `dasharray: L`, `0 → +L` hides the
   spiral from the hub end outward — the drawn silk travels away and off the rim, which is what
   "pay-out" describes. `0 → −L` retracts it back toward the hub (a rewind). §4's parenthetical says
   −L; the browser-verified reference uses +L. The reference wins, and the CSS carries the reasoning.
6. Sizes stayed the shipped 16/20/24/32/48 table, per the spec's own repo-mapping note; the loop rides
   `data-animate` + the icon-seal glyph, no web component.

## Perf notes

- Physics adds per-point work only on strands with live plucks; glint remains per-segment. The lab
  demo holds steady 60 FPS at 920×460 on a 2020-class laptop (its cards carry an EMA FPS meter).
- Keep the shipped component's bake/composite split for static layers — the lab renders unbaked
  for simplicity; production keeps the buffer.
