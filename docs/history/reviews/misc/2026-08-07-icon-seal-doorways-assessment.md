---
kind: history
status: archived
updated: 2026-08-08
---

# Icon-seal doorways — assessment (GLYPHSWEEP lane, 2026-08-07)

Four named-not-built follow-ups on the icon seal (`packages/ui/src/primitives/icons/icon.tsx` +
`fillable.ts`), all board-confirmed zero-hit. Verdict up front: **BUILD NONE.** Each is an OPPORTUNITY,
not debt; none clears the "genuinely cheap AND clearly valuable" bar against the current wrapper
architecture. Source-pinned against `lucide-react@1.22.0/dist/lucide-react.d.ts` (not memory).

The load-bearing fact behind three of the four verdicts: **every icon in the app renders through the
`Icon` wrapper** (`icon.tsx`), which passes `size`, `absoluteStrokeWidth`, `strokeWidth` EXPLICITLY on
every render, and the icon seal forbids rendering a raw lucide glyph outside it. So any mechanism that
supplies *defaults* is dead by construction — the wrapper always overrides it.

## 1. LucideProvider at the client composition root — BOARD (redundant)

`LucideProvider` is real (d.ts L26191-26194): a React context that sets default
`size/color/strokeWidth/absoluteStrokeWidth/className` for lucide glyphs rendered WITHOUT those props.
The `Icon` wrapper already passes all of them explicitly on every render, so a provider's defaults would
be overridden and never read. The only glyphs that could read them are raw lucide components rendered
outside the wrapper — which the seal forbids. Net value: **zero, arguably negative** (a second,
competing defaults source-of-truth beside the wrapper). Only worth reconsidering if the seal is ever
relaxed to allow raw glyphs — which contradicts the seal's whole point.

## 2. vector-effect CSS stroke route — BOARD (no consumer, redundant path)

`vector-effect: non-scaling-stroke` keeps stroke width constant when an SVG is scaled by a CSS
transform/zoom. The wrapper already gets size-independent OPTICAL stroke via lucide's
`absoluteStrokeWidth` (computes `strokeWidth * 24 / size` off the `size` PROP). The two solve different
cases: `absoluteStrokeWidth` covers the size-prop path (the only path this app uses); `vector-effect`
would only matter for a CSS-transform-scaled icon, of which there is **no consumer**. Building it is a
fix for a case that does not occur. Board as a latent option keyed to a future transform-scaled icon.

## 3. iconNode door for brand glyphs (weave-glyph) — BOARD (not cheap, unwanted gain)

The API is real: `createLucideIcon(name, iconNode)` / generic `Icon` with `iconNode: [el, attrs][]`
(d.ts L10, L26203-26223). It would let `packages/client/src/lib/weave-glyph.tsx` ride lucide's
size/strokeWidth/absoluteStrokeWidth machinery. Assessed against the actual glyph — it does NOT pay:

- WeaveGlyph carries wrapper concerns lucide's `Icon` doesn't model: the `anim` shimmer class, and the
  `decorative` DUAL-ARM a11y (`role="img"` + `aria-label="Orbweaver"` vs `aria-hidden`). Routing through
  `createLucideIcon` still needs a wrapper for both — MORE surface, not less.
- The geometry (mixed per-subpath `fill=currentColor stroke=none` center circle, a `opacity=0.5` detail
  path) maps onto `iconNode` attrs, but that only re-expresses working SVG for no gain.
- The gain (weight/size axes) is UNWANTED: WeaveGlyph is a brand mark rendered at \~one size, and §13.9
  deliberately keeps it a hand-authored brand SVG, NOT an @orb/ui primitive. Coupling it to lucide's
  render machinery fights that ruling.

## 4. fillRule=evenodd probe to grow the fillable set — BOARD (best candidate; uncertain value, needs a visual verdict)

The most legitimate of the four. `fillable.ts` limits `FillableIcon` to single-outline glyphs because a
multi-path outline fills its interior detail into a blob. Threading `fillRule="evenodd"` onto the fill
pass in `icon.tsx` (L98, the `fill` attribute branch) could make some multi-path glyphs fill correctly
(interior holes punched out), growing the fillable set. Cheap to thread. BUT:

- Value is UNCERTAIN until you LOOK — membership is evidence-based (read off the gallery screenshot,
  `IconGalleryStory` → `tests/ui/primitives/icons/icon.ct.tsx`). It's a PROBE, not a known win.
- It needs a visual verdict (which candidate multi-path glyphs read correctly under evenodd) — a
  side-eye/gallery look, not something static or a lane can close alone.
- There is no named consumer currently demanding a new fillable glyph.

Recipe when a demand appears: add `fillRule="evenodd"` to the solid-fill branch, add the candidate
multi-path glyphs (e.g. the multi-shape members the doc calls out) to the gallery story at
0/.25/.5/.75/1, re-shoot the screenshot, and admit only the ones that read clean — same evidence bar as
growing the seal today. Do NOT ship it speculatively; the fill axis is owner-taste.

## Bottom line

Zero-commit-worthy on the code axis: no doorway is built. All four are boarded above with reasons. This
matches the DATABANK-S2 receipt-only precedent — an opportunity list that stays an opportunity list is a
successful outcome, not a skipped one.
