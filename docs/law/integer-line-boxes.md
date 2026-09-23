---
kind: law
status: active
updated: 2026-09-23
---

# Integer line boxes — the crispness doctrine (Law 1: the crisp type scale; Laws 2-4: §9-§12)

Every line box the app produces must be a whole CSS pixel at every font scale, on every device and
orientation. This document defines the type and leading scale that makes line boxes integer (Law 1),
the `integer-line-boxes` gate that enforces it, and three related rules on transforms and promoted
layers (Laws 2-4, §9-§12).

## 1. Integer line boxes

A line box must resolve to a whole CSS pixel at every font scale. A fractional line box shifts every
following baseline off the device-pixel grid; the effect is most visible under a promoted layer
(`backdrop-filter`), which cannot re-snap a baseline per paint.

Crispness requires integer LINE BOXES, not integer font sizes: a fractional glyph size rasterizes
fine, and a size may stay fractional as long as its paired leading resolves to an integer box. No
font size in the approved type hierarchy (24/20/16/15/13/10.5px) moves for this law.

## 2. Multipliers that touch line boxes

Every multiplier that touches a line box, re-derived from the tree:

1. **`--font-scale`** — `packages/ui/src/styles/globals.css` `:root { font-size: calc(100% *
   var(--font-scale, 1)) }`; a continuous slider, min 0.8 / max 1.5 / step 0.05
   (`packages/client/src/features/app-shell/lib/appearance-bounds.ts:24-26`, contract clamp
   `packages/contracts/src/settings/appearance.ts:31-33`), tested at scales {1, 1.25}
   (`appearance-carrier-manifest.ts:104`). 12 of its 15 stops produce a non-integer root
   (16×0.85 = 13.6px), so it stays continuous and needs the `round()` guard (§3b).
2. **Density** — spacing only (`tiers.css` density blocks map the four `--spacing-*` vars); density
   never touches type. No constraint.
3. **The tier map** — remaps slot type between existing pairings (label↔body, promoted title); it is
   a pairing selector, not a multiplier. Covered by making every pairing integer.
4. **Reading knobs** (`readingLineHeight` 1.2–2.2 continuous, `readingBodyScale`/`NameScale`
   0.8–1.6) — chat reading surface only (`packages/client/src/styles/globals.css:527`
   `line-height: var(--reading-line-height)` on message prose). A user-authored continuous
   multiplier on a user-editable surface is a declared residual (Law 4's honest limit), carried as
   a typed exemption in the gate (§11). Guarding the reading surface is a separate client-globals
   change.
5. The 16px rem root. Browser zoom and DPR are Law 4's territory (§11).

**Every `--spacing-*` token carries `orb.output: snapped`**, so each emits `round(up, <rem>, 1px)`
and resolves to a whole CSS pixel at every stop of the slider. Every one is authored integer at the
16px root (2 · 4 · 6 · 8 · 12 · 16 · 24 · 32 · 44 · 44 · 48 · 56 · 24 · 32 · 40 · 64 · 64 · 44 · 9 ·
18 · 24 · 12 · 16 · 20 · 24 · 32 px, plus the seven `orb.pointerFine` overrides 28 · 32 · 34 · 40 ·
48 · 32 · 6), so `up` is the identity at scale 1 and the guard moves no shipped pixel. **The fine
override is guarded too** — a `@media (pointer: fine)` override replaces the `@theme` value, so
guarding only the base value would leave the guard off on the pointer most sessions use.

**The guard makes each LENGTH whole, never the DIFFERENCE between two of them EVEN.** Any centred
child — `items-center`, `justify-center`, an equal inset — halves `(container − content)`, so when
that difference is ODD the offset lands on a half pixel: crisp at DPR 2 (a whole device pixel),
resampled at DPR 1 and DPR 3.

**The repair, where the content's size is ours to derive:** for a centred child whose size is a
design quantity the token system owns, make it a FUNCTION of the container's guarded lengths instead
of a fourth guarded length. The switch knob is `track-height − 2×border − 2×inset` at the site
(`packages/ui/src/primitives/switch/variants.ts`), so the halved difference is `2×inset` — even by
construction — and the rest landing is exactly `border + inset`, whole at every scale. The removed
token is `--spacing-switch-thumb` (`packages/ui/src/tokens/removed.json` carries the row). Measured
at a fine pointer with `--border-width-control` 1px:

| `--font-scale` | root | inset | knob = track−2b−2i | track | content box | rest offset = b + i | lands |
| - | - | - | - | - | - | - | - |
| 1 | 16px | 6 | 18 | 32 | 30 | 7 | whole px at every DPR |
| 0.875 | 14px | ceil(5.25) = 6 | 14 | 28 | 26 | 7 | whole px at every DPR |
| 1.15 | 18.4px | ceil(6.9) = 7 | 21 | ceil(36.8) = 37 | 35 | 8 | whole px at every DPR |
| 1.25 | 20px | ceil(7.5) = 8 | 22 | 40 | 38 | 9 | whole px at every DPR |

So Law 1's guarantee is: every line BOX and every `--spacing-*` LENGTH is a whole CSS pixel at every
font-scale; at scale 1 both are integers by authorship; and a centred child whose size the token
system derives from its container lands whole at every scale too. **The residual class survives**,
narrowed to where the repair does not reach: a centred child whose size is NOT ours to derive
(intrinsic content, a third-party box, a user-owned continuous multiplier) still halves whatever
difference it happens to produce, and that stays Law 2/3/4 territory — the runtime
`off-grid-transform` / `promoted-layer-offset` rules, not a token this system can retune. An
element's absolute landing depends on its ancestors' offsets too, and that is also Law 2/3/4
runtime territory; only the offset a primitive itself owns is its to fix. The pins are
`tests/ui/tokens/index.test.ts` (every snapped spacing token guarded on both the base value and the
fine override, and integer at the 16px root) and
`tests/ui/primitives/switch/switch.ct.tsx` (the four rows above, measured from the rendered boxes,
plus the rest landing in whole DEVICE px at both pointer classes and both rest positions).

## 3. The chosen architecture

### 3a. Leadings become px-resolving DIMENSION tokens (fixed line boxes per step)

`leading.*` (except `none`) change from unitless numbers to **rem dimensions authored to integer px
at the 16px root**, emitted through a snapping serialization (§3b). Chosen values — smallest deltas
from the shipped resolved boxes, hierarchy untouched:

| token | authored | box @16 | was | Δ | effective ratio on its voice |
| - | - | - | - | - | - |
| leading.display | 1.875rem | 30px | 30 | 0 | 1.25 on 24px |
| leading.headline | 1.625rem | 26px | 26 | 0 | 1.3 on 20px |
| leading.title | 1.375rem | 22px | 21.6 | +0.4 | 1.375 on 16px |
| leading.body | 1.4375rem | 23px | 23.25 | −0.25 | 1.533 on 15px |
| leading.label | 1rem | 16px | 16.25 | −0.25 | 1.231 on 13px |
| leading.micro (NEW) | 0.8125rem | 13px | 13.125 (tw `leading-tight`) | −0.125 | 1.238 on 10.5px |
| leading.label-relaxed (NEW) | 1.25rem | 20px | 20.15 (label×body) | −0.15 | 1.538 on 13px |
| leading.none | 1 (number, unchanged) | = font | — | 0 | glyph-caption |

WHY fixed boxes and not re-tuned unitless ratios: the live cross-pairings (`text-code
leading-body`, `text-micro leading-body`, `text-micro leading-label`, `text-label leading-body`)
COUPLE the constraints — one unitless body ratio must make 15, 13, AND 10.5px all integer, which
has no solution below 2.0. Fixed rem boxes decouple every pairing (any size under the box is
integer by construction), scale proportionally with `--font-scale` (rem-denominated, so ratios are
scale-invariant), and match the field precedent (GOV.UK/Material author line-heights as fixed
lengths). The GOV.UK multiple-of-5 rhythm was weighed and rejected: {30, 25, 20, 15} boxes would
move the approved voices by whole pixels; smallest-delta wins (owner hierarchy approvals).

### 3b. The round() guard: `round(up, <rem>, 1px)` in the emitted value

The generated `theme.css` emits every snapped leading as `round(up, 1.4375rem, 1px)` — identity at
scale 1 (authored integer), integer at EVERY `--font-scale` (the continuous multiplier from §2).
`round()` is the one usable platform primitive (Chromium 117+/FF 118+/Safari 15.4+;
`line-height-step` has zero support). The guard lives in the TOKEN VALUE so every consumer — the
Tailwind `leading-*` utilities, tiers.css's `--orb-tier-*-leading` indirection, `lh`-unit
arithmetic (`.orb-lines-N`) — inherits it from one home.

**The rounding strategy is `up`, not `nearest`.** `round()`'s default `nearest` keeps the box
integer but can shrink it by up to half a pixel while the paired font size scales continuously, so
the resolved ratio can fall below the ratified leading floor (§6's `LEADING_FLOOR` =
`leading.label / text.label` = 16/13 ≈ 1.2308) at scales the authored value cannot see. On the
`reading` appearance preset (`--font-scale` 1.25, root 20px), `text.micro` resolves to 13.125px
while `round(0.8125rem, 1px)` under `nearest` resolves to 16px — ratio 1.219, below the floor.
`nearest` also breaks `leading.label` on `text.label`, whose authored ratio IS the floor exactly, so
half a pixel of slack in either direction drops below it. `up` never shrinks the box, so the
resolved ratio stays ≥ the authored ratio at every stop of the slider; because the token-arithmetic
check already proves every snapped token is authored integer at the 16px root, `up` is the identity
at the default scale. The only resolved box that moves at scale 1.25 is `leading.micro`, 16px →
17px.

Mechanism: a new `orb.output` role **`snapped`** in the vault contract
(`packages/ui/token-contract.ts` `outputSchema` + a `snapped ⇒ dimension` diagnostic), rendered by
`tokens.build.ts` (`renderPortableToken`) as `round(up, ${amount}${unit}, 1px)`. This is the house
pattern for serialization directives (the `percentage`/`light-dark` precedent) — the design value
stays a portable DTCG dimension; only the CSS serialization is vendor-shaped.

Because `TOKENS[path].value` becomes the CSS string, `tokens/index.ts` generation adds a numeric
companion surface for build-time consumers (the `TOKEN_POLARITY_ARMS` precedent — "consumers never
parse the serialization"): `SNAPPED_LENGTH_BASE_PX` mapping each snapped token to its resolved px
at the 16px root (e.g. `"leading.label": 16`).

### 3c. The re-pairing sweep (fix-at-landing; sub-pixel deltas)

Fixed boxes make three classes of site wrong-by-vocabulary; each is re-paired to the box nearest
its CURRENT resolved value:

1. **Tailwind default-scale leadings** (banned by the gate): `leading-tight` on micro voices →
   `leading-micro` (`text/variants.ts` micro/kicker/gloss, `charts/scatter` count,
   `compare-blocks` stateChip).
2. **Cross-pairs whose intent was a ratio:** `text-code leading-body` → `leading-label-relaxed`
   (Text `code` voice, `datumMono`, number-field `inline`); `text-label leading-body` →
   `leading-label-relaxed` (Text `prose` modifier, list-row `subtitleWrap`); `text-micro
   leading-label` → `leading-micro` (series-row detail); `text-micro leading-body` →
   `leading-label` 16px box (highlighted-text `code`, multi-line micro mono, ratio 1.52 ≈ its
   current 1.55).
3. **Bare `text-*` with no leading class** (boxes currently decided by preflight's inherited 1.5 →
   19.5/22.5px, fractional TODAY): each gains its voice's leading
   (`leading-body`/`leading-label`/`leading-label-relaxed`). SVG text classes (`charts/meter`
   ×3) take a reasoned `@orb-gate-ignore` (line-height is inert in SVG); the markdown
   nested-selector inline-code site keeps parent-box semantics with a reasoned marker.

`tailwind-merge` must learn the two new leading members (`packages/ui/src/lib/class-merge.ts`
`CUSTOM_CLASS_GROUPS.leading`) or a voice override keeps BOTH classes and the winner is stylesheet
order (that file's own warning).

## 4. Rejected alternatives

- **Re-tune unitless ratios only** — no solution exists under the live cross-pairings (§3a); every
  future pairing re-couples the constraints. Rejected on arithmetic.
- **Move font sizes to make ratios integer** — violates the approved 24/20/16/15/13/10.5 hierarchy
  (owner-approved voices, reviewed); still leaves micro coupled. Rejected.
- **Quantize the font-scale slider to quarter steps** ({0.75,1,1.25,1.5}) — guts a 15-stop control
  to 4 stops to avoid a one-line guard, and still leaves spacing fractional at 1.25 (0.375rem×20 =
  7.5px), so it buys less than it costs. Rejected; the guard covers the whole range.
- **`round()` at each consuming declaration** instead of in the token value — N spellings of the
  guard, every new consumer a chance to forget it; the token value is the one home. Rejected.
- **Author leadings in `orb.cssValues`** (the vendor extension) — the value would be spelled twice
  (the dimension for arithmetic, the `round()` string for CSS) with no contract check binding
  them; `orb.output: snapped` keeps one authored value. Rejected.
- **Px-denominated leadings** — would not track `--font-scale` (root-rem scaling), so text scales
  and boxes don't: overlap at 1.5×. Rejected.
- **A declared pairing table in tokens.json** (`orb.leadingPairs`) reconciled against the tree —
  considered for two-sidedness, but the consuming sites ARE the contract (derive from consuming
  sites, never a hand-list); the pairing census and the blindness check already achieve
  two-sidedness, and the ramp floor derives from the tokens directly (§6). Rejected as decoration.

## 5. Part B — the `integer-line-boxes` gate

**Legacy design record.** The descriptor fields and coupled sites below record the original gate
design; current gate-policy authoring follows `tooling/src/verify/gates/GATE-AUTHORING.md`. A
conversion of this descriptor must preserve its four checks and their evidence while replacing the
archived legacy mechanisms.

`tooling/src/verify/gates/integer-line-boxes.ts` (scaffold `pnpm gate:new`), `scopeSafety:
"whole-project"`, `fsBacked: true` (reads `tokens.json` + the CSS homes off disk), a `run` check
over the shared project, and a descriptor carrying ≥1 `mustFlag`/`mustPass` per check (fractional
token fixture, unpaired text fixture, banned-vocab fixture, marker-honoured pass, SVG-marker pass).
Four checks:

- **Token arithmetic:** parse `packages/ui/src/tokens/tokens.json`; every `leading.*`
  except `none` must be a dimension carrying `orb.output: snapped` whose resolved px at the 16px
  root is an integer; `leading.none` must be exactly the number 1. A fractional authored leading is
  RED at `pnpm check`.
- **Pairing census:** ride the neutral static-class walker
  (`tooling/src/verify/lib/static-class-expression.ts`, the `no-tailwind-dark-variant` consumption
  pattern) over `packages/ui/src` + `packages/client/src`. Per resolved candidate, after top-level
  variant-prefix stripping: (a) any leading utility outside the token vocabulary — Tailwind's
  unitless `leading-(none…loose)` core scale (except our own `leading-none`), numeric
  `leading-<n>`, arbitrary `leading-[…]` — is RED; (b) a candidate naming a `text-<step>` with no
  `leading-<step>` is RED (an inheritance-decided box is a latent fraction) — escapes via the
  shared `@orb-gate-ignore` marker with reason (SVG text, inline-in-prose); (c) each (text ×
  leading) pair present must satisfy box ≥ font px (mispairing/clip guard), and `text-<step>` +
  `leading-none` is RED unless the step resolves integer. Unresolved walker output fails loud
  (the sibling's `unresolved:` pattern).
- **CSS homes:** read every committed `.css` under `packages/ui/src` +
  `packages/client/src` (glob-derived, no hand-list): a `line-height:` declaration must resolve to
  the leading vocabulary (`var(--leading-*)` / the tiers.css `--orb-tier-*-leading` indirection,
  which itself must alias `var(--leading-*)`); a `--leading-*:` definition outside generated
  theme.css is RED. Typed exemption row (why + stale check): the reading-surface rule
  (`packages/client/src/styles/globals.css` `var(--reading-line-height)`) — the §2 declared
  exemption.
- **Blindness:** zero walker roots, zero CSS files, or zero leading tokens → RED
  (real-tree anchor `packages/ui/src/lib/class-merge.ts`, outside every conformance example's
  path); plus a distinct-pairing floor (found pairings below the known population → RED "census
  blind, not clean").

The gate int test is `tests/tooling/verify/gates/integer-line-boxes.int.test.ts`, coupled to its
`docs/law/Core-Enforcement-Active-Gates.md` row. Comment posture: the pairing check is AST-side
(comment-safe via the walker); the CSS check routes CSS text through `blankCssComments`.
Ratification: a planted real-tree violation REDs `pnpm check:structure`; the
clean tree GREENs with a non-trivial scan denominator. Current final policies use the guide's
declared proof, family and coordinated-production surfaces rather than the archived manual count
and `writeFixtures()` route.

## 6. Instrument coherence — ramp.ts stays derived

`tooling/src/ui-audit/lib/ramp.ts:21` derives `LEADING_FLOOR = Number(TOKENS["leading.label"].value)`.
Once `leading.*` values are `snapped` dimensions, that expression reads a CSS string
(`round(1rem, 1px)`) instead of a number and returns NaN — every `tight-leading` comparison silently
passes. `ramp.ts` must re-derive the floor from the numeric companion surface (§3b), staying
ramp-bound exactly as the file's own comment demands ("ours is ramp-bound so ratified label-voice
text stays legal"):

```ts
export const LEADING_FLOOR = SNAPPED_LENGTH_BASE_PX["leading.label"] / (Number.parseFloat(TOKENS["text.label"].value) * REM_PX);
```

\= 16/13 ≈ 1.2308 (the smallest ratified pairing ratio; `leading.micro` on micro is 1.2381, above
it). `TEXT_MICRO_PX` and `RAMP_FONT_FACES` are unaffected (their tokens keep numeric/list values).
`LEADING_FLOOR_EPSILON`'s truncation allowance still holds for non-token line-heights the walker
meets (reading surface, inherited ratios) — it must NOT shrink on the strength of integer tokens
alone. `ramp.ts` sits outside this gate's own scope: this edit routes through the orchestrator, not
made by this lane, and it must land in the same era as the `snapped` leading tokens, or the
tight-leading check goes blind.

## 7. Test plan

- **Red-first:** run the DPR-1 grid probe against the isolated stage (`--dirty`); target ≈ 0
  off-grid text on the config list panel, plus a DPR-1 screenshot pair.
- **Gate:** conformance fixtures (must-flag / must-pass), the `check-gates.int` fixture, a planted
  real-tree violation that REDs then is removed.
- **Freshness:** `pnpm --filter @orb/ui tokens:build` regenerated artifacts committed together;
  `tests/ui/tokens` suite.
- **Behavioral tier:** `tests/ui/density-tier.suite.ct.tsx` (computed-voice pins),
  `tests/ui/lib/class-merge.test.ts` (new leading members), `touch-target-floor.suite.ct.tsx`,
  plus every CT a literal grep finds for the changed values (16.25/20.15/23.25/13.125/21.6/16.4062/
  1.55/1.35/`leading-tight`/`leading-body` across `tests/**`).
- **Types:** `node scripts/ts7.cjs --noEmit -p tsconfig.json` and per-package `pnpm typecheck`
  (the only program that sees `.ct.tsx`); scoped biome on touched files; `pnpm check:structure`.
- **Design-audit baseline:** the config surface must not gain a design-audit finding. If a
  `tight-leading` row shifts, report it with numbers (§6); never tune it away.

## 8. Scope

1. **Files outside the named scope that the outcome forces** — ui variant re-pairs (every call
   site the report names in `packages/ui/src`), `class-merge.ts` group extension,
   `token-contract.ts` outputRole extension. Default: fix every file the report names; the §3c
   sweep is unreachable without them.
2. **ramp.ts** (§6) is a required companion edit, not an optional follow-up: the lane does not touch
   it — it routes through the orchestrator and lands in the same era, or the tight-leading check
   goes blind.
3. **Adjacent work:** other in-flight changes may read surfaces this change moves. Coordinate
   before landing.

Memory lessons applied: `gate-authoring-hub`, `whole-project-arms-need-scope-self-guard`,
`gate-authoring-three-new-traps`, `merge-floor-owes-the-literal-pinning-cts`,
`tailwind-merge-custom-token-override`, `degraded-instrument-fixes-now`,
`instruments-lie-verify-the-verifier`.

## 9. Law 2 — rest-state transform identity

At rest, an element must not carry a transform whose raster cannot land on the device-pixel grid. A
resting SCALE resamples every glyph and edge under it for the element's whole life; a resting
TRANSLATION that lands the box between device pixels offsets the same raster. A transform belongs to
MOTION — a state variant or a `@keyframes` stop — never to rest. Law 2 judges translate and scale
only; a rotation is out of scope.

**Gate vs. runtime.** `ops/walker/census-tier.ts` states the deciding question: not "is this value
legal" (a source-side gate already proves the authored value is a token), but "did the resolved
pixel match". Law 2 splits across that line:

- **Authorship-provable → a gate.** `tooling/src/verify/gates/rest-transform-grid.ts`. A rest-state
  `scale-*` other than `scale-100` is unprovable-by-construction: whatever the layout does, a
  non-identity scale resamples. `no-arbitrary-tw-values`'s `SCOPED_UTILITY_RE` names
  `translate(-x|-y|-z)?` and omits `scale`, so an arbitrary `scale-[1.02]` was legal everywhere until
  this gate. The CSS check carries the same claim into stylesheets: a `transform`/`translate`/`scale`
  declaration outside `@keyframes` whose value carries a fractional px length or a percentage is RED.
- **Resolved-only → a runtime rule.** `off-grid-transform` in ui-audit. Whether a legal token
  translate LANDS on the grid depends on the live root font-size (§2's continuous `--font-scale`
  slider), the element's own box, and the DPR — none of which authorship can see. A centred child's
  offset — the halved difference between two guarded `--spacing-*` lengths (§2) — can still land on
  a half pixel regardless of line boxes; full-grid alignment at those offsets is Law 2/3/4
  territory.

**What REST means.** A class token is rest when EVERY variant prefix is a non-state one (breakpoint,
container query, polarity, media feature, pseudo-element, structural position). `hover:`, `active:`,
`data-*:`, `group-*:`, `aria-*:`, `peer-*:`, `starting:`, and any unrecognised prefix are MOTION and
are skipped. A missed state prefix costs coverage the blindness check still catches; a
mis-classified state prefix would red legitimate motion (the live `active:scale-95` press idiom) —
so the classification stays conservative in that direction.

**Declared limits**, each a `mustPass` row: a fractional-px arbitrary TRANSLATE is already RED under
`no-arbitrary-tw-values`; a PERCENTAGE translate is a runtime fraction of the element's own box and
is unprovable from a class string (the live `before:-translate-x-1/2` centring idiom); a
`var()`/`calc()` indirection carries the token's own contract. All three land at resolved-pixel time
on `off-grid-transform`.

## 10. Law 3 — promoted-layer grid alignment

**The law.** `backdrop-filter`, `will-change` and 3D-promoted layers rasterize their subtree ONCE and
composite it, which disables the browser's per-paint baseline snapping. A promoted layer's own offset
is therefore inherited by every glyph and edge inside it, so that offset must be an integer number of
device pixels.

**Decision: RUNTIME, with no authorship half at all.** A layer's offset is decided by layout — its
ancestors' box model, the resolved spacing steps, the live root font-size. There is no authored value
to judge, so a gate here would be a wish with a scanRoot. The rule is `promoted-layer-offset` in
ui-audit, whose subject is the promotion ROOT, not the text inside it: that is where the repair
lands, and filing it once against the layer instead of N times against its descendants is what keeps
a single fix from being buried under its own blast radius.

**The three promotion shapes and only those.** `backdrop-filter` (incl. the `-webkit-` alias),
`will-change` other than `auto`, and a 3D context (`transform-style: preserve-3d`, or a computed
transform that resolves to `matrix3d`). `filter` was considered and left out: it is not one of the
three the law names, and widening the promotion vocabulary is a separate measurement.

## 11. Law 4 — the runtime off-grid-text backstop

**The law.** Text painted inside a promotion context lands wherever its layer landed. Law 1 fixes
the arithmetic that produces most fractional line boxes; this backstop catches what arithmetic
cannot reach: a horizontal offset a promoted layer introduces at layout time, not a line-box height.

**Decision: RUNTIME.** Same reason as Law 3, plus one more: this backstop must fire on ANY surface
at ANY scale, including scales no authored value can be checked against (most of the `--font-scale`
slider's stops produce a non-integer root).

**Population semantics** (is the contract):

| reason | disposition | why |
| - | - | - |
| no promoting ancestor | EXCLUDED `snapped` | the browser re-snaps that baseline every paint — a measurement proving INAPPLICABILITY, so the verdict survives |
| inside the reading surface | EXCLUDED `readingSurface` | the typed mirror of the `integer-line-boxes` gate's CSS-check exemption row (§5) |
| non-finite rect / unusable DPR | WITHHELD `unmeasurable` | the instrument could not judge — fails loud, never a clean pass |

**The reading-surface exemption is MIRRORED, never re-decided.** The `integer-line-boxes` gate
exempts `packages/client/src/styles/globals.css::var(--reading-line-height)`; that declaration sits
on `[data-slot="message-bubble"]`, so the same user-owned continuous multiplier
(`appearance.readingLineHeight` 1.2–2.2) decides every text landing inside the bubble.
`tooling/src/ui-audit/lib/checks-grid.ts`'s `GRID_EXEMPTIONS` carries the selector, the `why` and the
SAME end condition (it ends when the reading rule gains its own `round()` guard at the consuming
declaration), and interpolates the selector into the walker so it is spelled exactly once across the
Node verdict layer and the in-page census. **Two-sidedness at runtime is the ACCOUNTING:** the
exclusion must be counted and printed, so an audit of a surface with bubbles and a zero
`readingSurface` count is a visible instrument problem.

**The DPR matrix.** Every fraction is normalized to DEVICE pixels IN THE PAGE
(`value * devicePixelRatio - round(value * devicePixelRatio)`), which is what makes one Node-side
epsilon correct at every DPR value: a CSS half-pixel is a real off-grid landing at DPR 1 and a
perfectly crisp one at DPR 2. `design-audit` has no `--dpr` flag and does not add one; the
1 / 1.25 / 2 DPR values are taken by a scratch playwright probe that sets `deviceScaleFactor` per
DPR value, and pinned permanently in `tests/tooling/ui-audit/lib/checks-grid.test.ts`.

## 12. Laws 2–4 coupled sites

- Gate: `tooling/src/verify/gates/rest-transform-grid.ts` and its `Core-Enforcement-Active-Gates.md`
  row. Current final-policy coupled sites and proof ownership follow
  `tooling/src/verify/gates/GATE-AUTHORING.md` §§2 and 5.
- Instrument: `tooling/src/ui-audit/ops/walker/census-grid.ts` (post-cohort, after `census-tier`) ·
  `ops/walker.ts`'s composition · `ops/walker/returns.ts` · `contract/samples-grid.ts` ·
  `contract/samples-populations.ts` (the `RelationalSamples` + accounting join) · `contract/rules.ts`
  (three rule ids) · `lib/checks-grid.ts` · `lib/collect.ts` (the `rung-4` accounting,
  `authoredDecisionKey`) ·
  `lib/evidence.ts`'s `RELATIONAL_SAMPLE_FAMILIES` mapped-type record.
- Proofs: `tests/tooling/ui-audit/lib/checks-grid.test.ts` (the `design-audit-rule-proof`
  fires/silent rows for all three rules, plus the DPR matrix).
