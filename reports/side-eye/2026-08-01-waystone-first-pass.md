# side-eye: the rebuilt Waystone — first pass (2026-08-01, overnight)

> Fix-all batch target. Verdict: DO NOT SHIP as focal element yet — architecture sound (motion floor
> certified: 0/934 dropped frames, compositor-clean, reduced-motion + hidden-pause verified, a11y
> model correct), the RENDERED VALUES wrong. Owner rulings folded in at the end.

## Findings (fix ALL — [[side-eye-fix-all-findings]])

- **F1 P1 — Light theme inverts day/night.** Sky recipe mixes every stop toward `--color-background`
  → on Light, midnight (oklab L .932) renders LIGHTER than noon (.822); STAR_FILL flips to dark dirt.
  FIX: polarity-fixed night anchor (dedicated dark token or mix toward black for the night half);
  stars derive from the anchor's contrast partner, never `--color-foreground`.
- **F2 P1 — Noon hand sweeps ~360° BACKWARDS** (`% 360` wrap + numeric CSS interpolation over 1.4s;
  measured 308→262→204→…→74deg). FIX: monotonic accumulated angle or prev+shortestDelta.
- **F3 P1 — Sun/moon slides backwards across the sky at 05/19h** (arc u restarts; same DOM node
  transitions 73.95px→22px). FIX: key the <g> on body (remount + enter-fade) or run night arc RTL.
- **F4 P1 — Gable:** flat base floats 0.92–2.36 units above the sloping ridge, 4.75px, no ember,
  1.3:1 vs hill. FIX: seat base ON the ridge (or union into horizon d) + 1–1.5u `--color-primary`
  window + scale up (owner leans anchor-not-kill; ember window at night done RIGHT).
- **F5 P1 — CLOUD_DARK/LIGHT swapped** (dark = L .804, light = .500; storm clouds brightest thing in
  the sky). FIX: swap + derive both from resolved sky lightness at the hour.
- **F6 P1 — Rain = cyan chart token on a perfect lattice** (oklch .767/.08/199°; zero x-jitter,
  identical length/slant/width). FIX: atmospheric recipe anchored to the hour's sky + per-column
  jitter + per-cell length/opacity variance.
- **F7 P1 — Authored 320px, shipped 76px** — stars 1.4px, gable 4.75px, ticks 1.9px: sub-pixel mush;
  "the dimmest orb in a row of orbs — hierarchy inverted." → SUPERSEDED BY OWNER RULING (below): the
  stone GROWS (~120px) + the context panel widens on desktop; still add size-gating so any smaller
  render drops sub-pixel layers gracefully.
- **F8 P1 — Fog = four rounded bars = skeleton loader.** FIX: wash veil + 1-2 wide low-opacity
  drifting ellipses; delete the bars.
- **F9 P1 — Stars at 0.96 opacity through rainstorms** (starOpacity ignores weather). FIX: attenuate
  by cloudCount×cloudOpacity; storm ≈ 0.
- **F10 P2 — Ash = bright peach confetti** (L .849, brighter than the moon). FIX: dark grey motes
  L≈.35–.45 low-opacity, ~1-in-8 ember-tinted.
- **F11 P2 — Lightning bolt permanently drawn**, desynced from the 6.6s flash (one-shot enter anim →
  opacity 1 forever; highest-chroma object, dead center). FIX: bolt joins the strike keyframe cycle.
- **F12 P2 — Precipitation bleeds through the horizon** (hill opacity .85 over .8 particles). FIX:
  silhouette opacity 1; tone via fill.
- **F13 P2 — Wind = 4 pasted Lucide glyphs.** FIX: delete; wind = faster drift + precip lean +
  streaked low-opacity ellipses.
- **F14 P2 — Bezel scale illegible + convention unteachable** (8 near-identical ticks; noon-top 24h
  dial unlearnable cold — OWNER LIVE-PROVED IT: five band-by-band observations to self-decode,
  "maybe I'm reading it wrong"). FIX: tiny SUN glyph at top cardinal + CRESCENT at bottom; drop
  indistinct minors (few clear marks beat many invisible ones). Also VERIFY band-arc angles derive
  from the hand's hour→angle function (owner's readings matched design; pin with a unit test so the
  two geometries can never drift).
- **F15 P3 — Stars twinkle in 5 synchronized pairs** (nth-child(5n) over 10). FIX: coprime buckets
  (7/11) or per-star delay data.
- **F16 P3 — Dead `size` prop / two sizing homes** (variant never passed; container class never
  fires). FIX: one home — resolves naturally with the size ruling below.
- **F17 P3 — Numeric hour is visual-only.** FIX: append it to the when-line (`night · 21:40`) so the
  text stays a superset of the picture.
- **F18 P3 — `clear` renders a smudge-cloud** (count 1 @ .22). FIX: clear = zero clouds (or a real
  wisp only at ≥ the grown size).
- **ROOT CAUSE (F1/F3/F5/F6/F10 common ancestor): the sky is painted with the CHART palette**
  (`--color-track-*` categorical ramp). FIX: a small dedicated atmospheric token set / sky-anchored
  color-mix recipes, tuned at the SHIPPED size.

## Owner rulings (2026-08-01, live)

1. **GROW the stone to ~120px** and **widen the whole context panel on desktop** ("a bit cramped") —
   the hierarchy-inversion cure; size-gating stays as the responsive floor.
2. Gable: anchor + ember it properly (kill only if it still fails after).
3. Dial geometry confirmed correct by owner readings; teach it (F14 glyphs).

## Certified-good (do not regress)

Motion floor (transform/opacity only, 0 dropped frames) · reduced-motion + document-hidden arms ·
aria-hidden/zero-text a11y model · continuous-hour architecture + theme-reactive color-mix
interpolation · particle loop seam math.
