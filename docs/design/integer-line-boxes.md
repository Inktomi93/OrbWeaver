---
kind: design
status: active
updated: 2026-09-13
---

# Integer line boxes — the crispness doctrine (Law 1: the crisp type scale; Laws 2-4: §9-§12)

> Owner rulings 2026-09-01, verbatim intent: "i want everything crisp at all times regardless of
> device or orientation" · "wouldnt it be better to make a gate so it cant happen?" · "we fix the
> scale to work properly we havent shipped yet". This document is the design for (A) the re-authored
> type/leading scale, (B) the `integer-line-boxes` gate, (C) the `round()` belt. **Laws 2-4 (transform
> landings, promoted-layer offsets, the runtime audit backstop) were out of scope for §1-§8 and are now
> designed in §9-§12** — the deferred half of the program, landed against the seven horizontal residuals
> Law 1's own acceptance receipt left behind.

## 1. The measured defect (receipts)

Config list panel, live probe at DPR 1 (scratchpad `fuzz2-config.txt`): **22 of 25 text elements
sit off the device-pixel grid** (top fractions ±0.125/±0.375/−0.5px), all under the panel's
`backdrop-filter` promoted layer, which disables per-paint baseline snapping so the fraction is
resampled and AA degrades. Root cause is arithmetic, not paint: with `leading.label = 1.25`
(unitless) on 13px text the line box is **16.25px**; the boxes stack and every subsequent baseline
walks off the grid. The full base-scale audit at rem=16 (`packages/ui/src/tokens/tokens.json`):

| pairing (as shipped) | box | integer? |
| - | - | - |
| display 24px × 1.25 | 30px | yes |
| headline 20px × 1.3 | 26px | yes |
| title 16px × 1.35 | **21.6px** | no |
| body 15px × 1.55 | **23.25px** | no |
| label 13px × 1.25 | **16.25px** | no |
| code 13px × leading-body 1.55 | **20.15px** | no |
| micro 10.5px × tw `leading-tight` 1.25 | **13.125px** | no |
| micro 10.5px × leading-label 1.25 | **13.125px** | no |
| micro 10.5px × leading-body 1.55 | **16.275px** | no |
| label 13px × leading-body 1.55 (`prose`/`subtitleWrap`) | **20.15px** | no |
| bare `text-*` (no leading class; inherits preflight 1.5) | 19.5/22.5px | no |

Crispness requires integer LINE BOXES, not integer font-sizes — a 10.5px glyph rasterizes fine;
sizes may stay fractional if the paired leading lands the box on an integer. **No font size moves**
(the 24/20/16/15/13/10.5 voices are approved design decisions).

## 2. The multiplier cross (derived, decides the belt)

Every multiplier that touches a line box, re-derived from the tree:

1. **`--font-scale`** — `packages/ui/src/styles/globals.css` `:root { font-size: calc(100% *
   var(--font-scale, 1)) }`; the control is a CONTINUOUS slider, min 0.8 / max 1.5 / step 0.05
   (`packages/client/src/features/app-shell/lib/appearance-bounds.ts:24-26`, contract clamp
   `packages/contracts/src/settings/appearance.ts:31-33`), audit arms {1, 1.25}
   (`appearance-carrier-manifest.ts:104`). 12 of its 15 stops produce a non-integer root
   (16×0.85 = 13.6px), so **it survives as a genuinely continuous multiplier → the belt is required.**
2. **Density** — spacing only (`tiers.css` density blocks map the four `--spacing-*` vars); density
   never touches type. No constraint.
3. **The tier map** — remaps slot type between EXISTING pairings (label↔body, promoted title); it is
   a pairing selector, not a multiplier. Covered by making every pairing integer.
4. **Reading knobs** (`readingLineHeight` 1.2–2.2 continuous, `readingBodyScale`/`NameScale`
   0.8–1.6) — chat reading surface only (`packages/client/src/styles/globals.css:527`
   `line-height: var(--reading-line-height)` on message prose). User-authored continuous
   multipliers on a user-editable surface: **declared residual** (Law 4's honest limit), carried as
   a typed exemption in the gate. Belting the reading surface is a separate client-globals change,
   out of this lane's fence.
5. rem=16 root — verified live earlier in the program; browser zoom/DPR is Law 4.

**Residual, stated honestly — AMENDED 2026-09-05 (#1640, owner ruling: extend the belt to `--spacing-*`
and restate what remains, with numbers).** The sentence this replaces said `--spacing-*` offsets are
fractional at a non-integer root "regardless of line boxes". They no longer are: all 26 `--spacing-*`
tokens carry `orb.output: snapped`, so each emits `round(up, <rem>, 1px)` and every step RESOLVES to a
whole CSS pixel at every stop of the slider. Every one is authored integer at the 16px root (2 · 4 · 6 ·
8 · 12 · 16 · 24 · 32 · 44 · 44 · 48 · 56 · 24 · 32 · 40 · 64 · 64 · 44 · 9 · 18 · 24 · 12 · 16 ·
20 · 24 · 32 px, plus the seven `orb.pointerFine` arms 28 · 32 · 34 · 40 · 48 · 32 · 6), so `up` is
the identity at scale 1 and the belt moves no shipped pixel. **The fine arm is belted too** — a
`@media (pointer: fine)` override REPLACES the `@theme` value, so belting only the base arm would have
left the belt off on the pointer most sessions use, which is exactly where #1143's off-grid switch thumb
lived (`--spacing-switch-thumb` 1.125rem × 0.875 = 15.75px).

**What remains, and it is arithmetic, not tuning: the belt makes each LENGTH whole, never the DIFFERENCE
between two of them EVEN.** Any centred child — `items-center`, `justify-center`, an equal inset — halves
`(container − content)`, so when that difference is ODD the offset lands on a half pixel: crisp at DPR 2
(a whole device pixel), resampled at DPR 1 and DPR 3.

**AMENDED AGAIN 2026-09-06 (#1684, owner ruling) — the residual has a REPAIR where the content's size is
ours to derive, and the switch is no longer its example.** This section used to state the residual on the
switch and rule it unreachable: *"Removing it would mean belting the DIFFERENCE, i.e. quantizing a
container against its own content at layout time, which no authored value and no `round()` on a token can
reach."* That is exactly right for a container and a child whose sizes are two INDEPENDENTLY belted
tokens — and it is what the switch was, so at `--font-scale` 1.25 (the `reading` appearance preset, a
shipping user state) its knob rested at 8.5px and design-audit's `off-grid-transform` filed #1684 against
the resting thumb. The ruling survives; its INPUT changed. Where the centred child's size is a design
quantity the vault owns, make it a FUNCTION of the container's belted lengths instead of a fourth belted
length: the switch knob is now `track-height − 2×border − 2×inset` at the site
(`packages/ui/src/primitives/switch/variants.ts`), so the halved difference is `2×inset` — even by
construction — and the rest landing is exactly `border + inset`, whole at every scale. The retired token
is `--spacing-switch-thumb` (`packages/ui/src/tokens/removed.json` carries the row). Measured at a fine
pointer with `--border-width-control` 1px, this is what the four audited scales land on now:

| `--font-scale` | root | inset | knob = track−2b−2i | track | content box | rest offset = b + i | lands |
| - | - | - | - | - | - | - | - |
| 1 | 16px | 6 | 18 | 32 | 30 | **7** | whole px at every DPR |
| 0.875 | 14px | ceil(5.25) = 6 | 14 | 28 | 26 | **7** | whole px at every DPR (was 6; 6.125 pre-#1143) |
| 1.15 | 18.4px | ceil(6.9) = 7 | 21 | ceil(36.8) = 37 | 35 | **8** | whole px at every DPR (was 8; 8.06 pre-#1143) |
| 1.25 | 20px | ceil(7.5) = 8 | 22 | 40 | 38 | **9** | whole px at every DPR (was **8.5**, the residual — #1684) |

So Law 1's guarantee now reads: every line BOX and every `--spacing-*` LENGTH is a whole CSS pixel at
every font-scale; at scale 1 both are integers by authorship; and a centred child whose size the vault
derives from its container lands whole at every scale too. **The residual CLASS survives**, narrowed to
where the repair does not reach: a centred child whose size is NOT ours to derive (intrinsic content, a
third-party box, a user-owned continuous multiplier) still halves whatever difference it happens to
produce, and that stays Law 2/3/4 territory — the runtime `off-grid-transform` / `promoted-layer-offset`
backstops, not a token the vault can retune. So does an element's ABSOLUTE landing, which is its
ancestors': #1684's reported 0.484 device px was this control's 0.5 plus ~0.984 inherited from the
settings row stack, and only the first half was the primitive's to fix. The pins are
`tests/ui/tokens/index.test.ts` (every snapped spacing token belted on BOTH arms and integer at the 16px
root) and `tests/ui/primitives/switch/switch.ct.tsx` (the four rows above, measured from the rendered
boxes, plus the rest landing in whole DEVICE px at both pointer classes and both rest positions).

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

### 3b. The belt: `round(up, <rem>, 1px)` in the emitted value

The generated `theme.css` emits every snapped leading as `round(up, 1.4375rem, 1px)` — identity at
scale 1 (authored integer), integer at EVERY `--font-scale` (the continuous multiplier from §2.1).
`round()` is the one usable platform primitive (Chromium 117+/FF 118+/Safari 15.4+;
`line-height-step` has zero support). The belt lives in the TOKEN VALUE so every consumer — the
Tailwind `leading-*` utilities, tiers.css's `--orb-tier-*-leading` indirection, `lh`-unit
arithmetic (`.orb-lines-N`) — inherits it from one home.

**The rounding STRATEGY is `up`, and that is a second invariant, not a detail (#1160, measured
2026-09-05).** The belt shipped with `round()`'s default `nearest`, which keeps the box integer but
may shrink it by up to half a pixel while the paired font size scales continuously — so the RESOLVED
ratio can fall below the ratified leading floor (§6's `LEADING_FLOOR` = `leading.label / text.label`
\= 16/13 ≈ 1.2308) at font scales the authored value cannot see. Measured on `settings:appearance --appearance-preset reading` (`--font-scale` 1.25, root 20px): `text.micro` resolved 13.125px while
`round(0.8125rem, 1px)` resolved **16px** — ratio **1.219**, four live `tight-leading` findings on
the setting-row gloss. `nearest` broke `leading.label` on `text.label` too, whose authored ratio IS
the floor exactly, so half a pixel of slack in either direction is below it. `up` never shrinks the
box, so the resolved ratio is always ≥ the AUTHORED ratio at every stop of the slider; and because
ARM T already proves every snapped token is authored integer at the 16px root, `up` remains the
identity at the default scale. The only resolved box that moves at the audited 1.25 arm is
`leading.micro`, 16px → 17px.

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
3. **Bare `text-*` with no leading class** (~18 live code sites; boxes currently decided by
   preflight's inherited 1.5 → 19.5/22.5px, fractional TODAY): each gains its voice's leading
   (`leading-body`/`leading-label`/`leading-label-relaxed`). SVG text classes (`charts/meter`
   ×3) take a reasoned `@orb-gate-ignore` (line-height is inert in SVG); the markdown
   nested-selector inline-code site keeps parent-box semantics with a reasoned marker.

`tailwind-merge` must learn the two new leading members (`packages/ui/src/lib/class-merge.ts`
`CUSTOM_CLASS_GROUPS.leading`) or a voice override keeps BOTH classes and the winner is stylesheet
order (that file's own warning).

## 4. Rejected alternatives

- **Re-tune unitless ratios only** — no solution exists under the live cross-pairings (§3a); and
  every future pairing re-couples the constraints. Rejected on arithmetic.
- **Move font sizes to make ratios integer** — violates the approved 24/20/16/15/13/10.5
  hierarchy (owner-approved voices with side-eye receipts); still leaves micro coupled. Rejected.
- **Quantize the font-scale slider to quarter steps** ({0.75,1,1.25,1.5}) — guts a shipped 15-stop
  control to 4 stops to avoid a one-line belt; and STILL leaves spacing fractional at 1.25
  (0.375rem×20 = 7.5px), so it buys less than it costs. Rejected; the belt covers the whole range.
- **`round()` at each consuming declaration** instead of in the token value — N spellings of the
  belt, every new consumer a chance to forget it; the token value is the one home. Rejected.
- **Author leadings in `orb.cssValues`** (the vendor extension) — the value would be spelled twice
  (the dimension for arithmetic, the `round()` string for CSS) with no contract check binding
  them; `orb.output: snapped` keeps one authored value. Rejected.
- **Px-denominated leadings** — would not track `--font-scale` (root-rem scaling), so text scales
  and boxes don't: overlap at 1.5×. Rejected.
- **A declared pairing table in tokens.json** (`orb.leadingPairs`) reconciled against the tree —
  considered for two-sidedness, but the consuming sites ARE the contract (the brief's rule: derive
  from consuming sites, never a hand-list), the gate's discovery arm + blindness tripwire achieve
  two-sidedness, and the ramp floor derives from the tokens directly (§6). Rejected as decoration.

## 5. Part B — the `integer-line-boxes` gate

**Legacy design record.** The descriptor fields and coupled sites below record the original gate design;
current final-policy authoring follows `tooling/src/verify/gates/GATE-AUTHORING.md`. A conversion must preserve
the four arms and their evidence while replacing the archived mechanisms documented in
`docs/history/gate-authoring-legacy-2026-09-13.md`.

`tooling/src/verify/gates/integer-line-boxes.ts` (scaffold `pnpm gate:new`), `scopeSafety:
"whole-project"`, `fsBacked: true` (reads `tokens.json` + the CSS homes off disk), `run`-arm over
the shared project. Four arms:

- **ARM T (token arithmetic):** parse `packages/ui/src/tokens/tokens.json`; every `leading.*`
  except `none` must be a dimension carrying `orb.output: snapped` whose resolved px at the 16px
  root is an integer; `leading.none` must be exactly the number 1. A fractional authored leading is
  RED at `pnpm check` — the owner's "make a gate so it can't happen".
- **ARM P (pairing census):** ride the neutral static-class walker
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
- **ARM C (CSS homes):** read every committed `.css` under `packages/ui/src` +
  `packages/client/src` (glob-derived, no hand-list): a `line-height:` declaration must resolve to
  the leading vocabulary (`var(--leading-*)` / the tiers.css `--orb-tier-*-leading` indirection,
  which itself must alias `var(--leading-*)`); a `--leading-*:` definition outside generated
  theme.css is RED. Typed exemption row (why + stale arm): the reading-surface rule
  (`packages/client/src/styles/globals.css` `var(--reading-line-height)`) — the §2.4 residual.
- **ARM B (blindness):** zero walker roots, zero CSS files, or zero leading tokens → RED tripwire
  (real-tree anchor `packages/ui/src/lib/class-merge.ts`, the sibling's anchor, outside every
  conformance example's path); plus a distinct-pairing floor (found pairings below the known
  population → RED "census blind, not clean").

Historical coupled sites per `docs/history/gate-authoring-legacy-2026-09-13.md` §2: descriptor with ≥1
`mustFlag`/`mustPass` per arm (fractional token fixture, unpaired text fixture, banned-vocab fixture,
marker-honoured pass, SVG-marker pass); the retired anti-drift planter suite's `__g_` fixture (gone with the legacy
runtime, #2176 Phase F); the Core-Enforcement-Active-Gates row + the registered-gates count; the gate int test
`tests/tooling/verify/gates/integer-line-boxes.int.test.ts`. Comment posture: the pairing arm is
AST-side (comment-safe via the walker); ARM C routes CSS text through `blankCssComments`.
Ratification: two receipts — a planted real-tree violation REDs `pnpm check:structure`, the clean
tree GREENs with a non-trivial scan denominator. Current final policies use the guide's declared proof,
family and coordinated-production surfaces rather than the archived manual count and `writeFixtures()` route.

## 6. Instrument coherence (ramp.ts — read-only fence, routed)

`tooling/src/ui-audit/lib/ramp.ts:21` derives `LEADING_FLOOR = Number(TOKENS["leading.label"].value)`.
After this change that expression is `Number("round(1rem, 1px)")` = **NaN — every `tight-leading`
comparison silently fails open** (a blinded instrument, the degraded-instrument-fixes-NOW class).
The coherent re-derivation, staying ramp-bound exactly as the file's own comment demands ("ours is
ramp-bound so ratified label-voice text stays legal"):

```ts
export const LEADING_FLOOR = SNAPPED_LENGTH_BASE_PX["leading.label"] / (Number.parseFloat(TOKENS["text.label"].value) * REM_PX);
```

\= 16/13 ≈ 1.2308 (the new smallest ratified pairing ratio; `leading.micro` on micro is 1.2381,
above it). `TEXT_MICRO_PX` and `RAMP_FONT_FACES` are unaffected (their tokens keep numeric/list
values). `LEADING_FLOOR_EPSILON`'s Chrome-truncation rationale still holds for NON-token
line-heights the walker meets (reading surface, inherited ratios) — it must NOT shrink on the
strength of integer tokens alone. This edit is cb-font-honesty's fence: routed through the
orchestrator, not made by this lane.

## 7. Test plan and value-changing sweep

- **Red-first:** the BEFORE probe receipt exists (22/25 off-grid, scratchpad `fuzz2-config.txt`);
  AFTER runs the same probe against the isolated stage (`--dirty`), target ≈ 0 off-grid on the
  list panel, plus the DPR-1 screenshot pair.
- **Gate:** conformance (mustFlag/mustPass), `check-gates.int` fixture, planted real-tree
  violation → RED → removed (two ratify receipts).
- **Freshness:** `pnpm --filter @orb/ui tokens:build` regenerated artifacts committed together;
  `tests/ui/tokens` suite.
- **Behavioral tier:** `tests/ui/density-tier.suite.ct.tsx` (computed-voice pins),
  `tests/ui/lib/class-merge.test.ts` (new leading members), `touch-target-floor.suite.ct.tsx`,
  plus every CT the literal grep finds (16.25/20.15/23.25/13.125/21.6/16.4062/1.55/1.35/
  `leading-tight`/`leading-body` across `tests/**`) — run what the grep names, report counts.
- **Types:** `node scripts/ts7.cjs --noEmit -p tsconfig.json` AND per-package `pnpm typecheck`
  (the only program that sees `.ct.tsx`); scoped biome on touched files; `pnpm check:structure`
  read from reports (sibling in-flight reds attributed).
- **Design-audit baseline:** config currently carries six findings; this change must not add any.
  If `tight-leading` rows shift, that is reported with numbers (§6), never tuned away.

## 8. Forks stated (defaults declared, work continues)

1. **Files outside the named fence that the outcome forces** — ui variant re-pairs (~25 files),
   `class-merge.ts` group extension, `token-contract.ts` outputRole extension. Default: proceed,
   every file named in the report (the brief's own §3c sweep is unreachable without them).
2. **ramp.ts** (§6) — the exact diff is stated here; the lane does not touch it. Without it the
   tight-leading arm is blinded the moment tokens land: route in the same era.
3. **Sibling premise:** cb-variant-axis's kernel suites and cb-font-honesty's ramp derivation both
   read surfaces this change moves; orchestrator notified via back-channel before landing.

Memory lessons applied: `gate-authoring-hub`, `whole-project-arms-need-scope-self-guard`,
`gate-authoring-three-new-traps`, `merge-floor-owes-the-literal-pinning-cts`,
`tailwind-merge-custom-token-override`, `degraded-instrument-fixes-now`,
`instruments-lie-verify-the-verifier`.

## 9. Law 2 — rest-state transform identity

**The law.** At REST an element must not carry a transform whose raster cannot land on the device-pixel
grid. Two failure shapes: a resting SCALE resamples every glyph and edge under it for the element's whole
life, and a resting TRANSLATION that lands the box between device pixels offsets the same raster. A
transform belongs to MOTION — a state variant or a `@keyframes` stop — never to rest.

**The gate-vs-runtime decision, on the doctrine's own axis.** The axis is not new here: it is the one
`ops/walker/census-tier.ts` states verbatim — *"THE QUESTION IS NOT 'is this value legal' (source-side
gates … already prove the AUTHORED value is a token). It is 'did the RESOLVED pixel match'."* Law 2 splits
across it, so it gets BOTH halves:

- **Authorship-provable → a gate.** `tooling/src/verify/gates/rest-transform-grid.ts`. A rest-state
  `scale-*` other than `scale-100` is unprovable-by-construction: whatever the layout does, a non-identity
  scale resamples. Nothing else on the enforcement ladder judges it — `no-arbitrary-tw-values`'
  `SCOPED_UTILITY_RE` names `translate(-x|-y|-z)?` and omits `scale` (verified at mint), so an arbitrary
  `scale-[1.02]` was legal everywhere. ARM C carries the same claim into stylesheets: a
  `transform`/`translate`/`scale` declaration outside `@keyframes` whose value carries a fractional px
  length or a percentage.
- **Resolved-only → a runtime rule.** `off-grid-transform` in ui-audit. Whether a legal token translate
  LANDS on the grid is the product of the live root font-size (§2.1's continuous `--font-scale` slider),
  the element's own box and the DPR — none of which authorship can see. §2's own residual sentence already
  said so: *"at `--font-scale` values with a non-integer root, `--spacing-*` offsets … are fractional
  regardless of line boxes — full-grid alignment at those scales is Law 2/3/4 territory."*

**What REST means, mechanically.** A class token is rest when EVERY variant prefix is a non-state one
(breakpoint, container query, polarity, media feature, pseudo-element, structural position). `hover:`,
`active:`, `data-*:`, `group-*:`, `aria-*:`, `peer-*:`, `starting:` and any unrecognised prefix are MOTION
and are skipped. The conservative direction is deliberate: a missed state prefix costs coverage the ARM B
census floor still sees, while a mis-classified state prefix would red legitimate motion (the live
`active:scale-95` press idiom).

**The sweep at mint (the tree is FIXED, not parked).** Every transform-family token in
`packages/{ui,client}/src` plus every CSS `transform`/`translate`/`scale` declaration was censused. The
live rest-state population is `rotate-45` (the overlay-arrow diamond — a rotation, no text, out of Law 2's
translate/scale scope), `before:`/`after:` percentage translates on `content:''` hit-area pseudos, two
`[transform:translateX(var(--drawer-swipe-movement-x))]`-class token indirections, and the
`translate-y-0/1/2` spacing-scale steps. Every fractional-px landing in CSS (`translate: ±2.5px`, the
waystone drift/sway/gust keyframes) is inside `@keyframes` — an animating stop, not a rest landing. **Zero
live violations: the gate is born green.**

**Declared limits, each a `mustPass` row.** A fractional-px arbitrary TRANSLATE is already RED under
`no-arbitrary-tw-values`; a PERCENTAGE translate is a runtime fraction of the element's own box and is
unprovable from a class string (the live `before:-translate-x-1/2` centring idiom); a `var()`/`calc()`
indirection carries the token's own contract. All three land at resolved-pixel time on `off-grid-transform`.

## 10. Law 3 — promoted-layer grid alignment

**The law.** `backdrop-filter`, `will-change` and 3D-promoted layers rasterize their subtree ONCE and
composite it, which disables the browser's per-paint baseline snapping. A promoted layer's own offset is
therefore inherited by every glyph and edge inside it, so that offset must be an integer number of device
pixels.

**Decision: RUNTIME, with no authorship half at all.** A layer's offset is decided by layout — its
ancestors' box model, the resolved spacing steps, the live root font-size. There is no authored value to
judge, so a gate here would be a wish with a scanRoot. The rule is `promoted-layer-offset` in ui-audit,
whose subject is the promotion ROOT, not the text inside it: that is where the repair lands, and filing it
once against the layer instead of N times against its descendants is what keeps a single fix from being
buried under its own blast radius.

**The three promotion shapes and only those.** `backdrop-filter` (incl. the `-webkit-` alias),
`will-change` other than `auto`, and a 3D context (`transform-style: preserve-3d`, or a computed transform
that resolves to `matrix3d`). `filter` was considered and left out: it is not one of the three the law
names, and widening the promotion vocabulary is a separate measurement.

## 11. Law 4 — the runtime off-grid-text backstop

**The law.** Text painted inside a promotion context lands wherever its layer landed. That is the founding
defect verbatim (§1): 22 of 25 config-panel text elements off-grid under the panel's `backdrop-filter`,
where the fraction is resampled rather than corrected. Law 1 fixed the ARITHMETIC that produced most of
those fractions; the backstop is what sees the ones it did not — measured after Law 1 landed: seven
horizontal (`leftFrac`) residuals on the config list panel, a class Law 1's vertical line-box reasoning
never touched.

**Decision: RUNTIME.** Same reason as Law 3, plus the one that makes the backstop necessary at all: it must
fire on ANY surface at ANY scale, including scales no authored value can be checked against (12 of the
slider's 15 stops produce a non-integer root).

**Population semantics** (`docs/design/983-984-ui-audit-population-semantics.md` is the contract):

| reason | disposition | why |
| - | - | - |
| no promoting ancestor | EXCLUDED `snapped` | the browser re-snaps that baseline every paint — a measurement proving INAPPLICABILITY, so the verdict survives (the census-tier polarity ruling, one property over) |
| inside the reading surface | EXCLUDED `readingSurface` | the typed mirror of the `integer-line-boxes` ARM C row (below) |
| non-finite rect / unusable DPR | WITHHELD `unmeasurable` | the instrument could not judge — fails loud, never a clean pass |

**The reading-surface exemption is MIRRORED, never re-decided.** The `integer-line-boxes` gate exempts
`packages/client/src/styles/globals.css::var(--reading-line-height)`; that declaration sits on
`[data-slot="message-bubble"]`, so the same user-owned continuous multiplier (`appearance.readingLineHeight`
1.2–2.2) decides every text landing inside the bubble. `tooling/src/ui-audit/lib/checks-grid.ts`'s
`GRID_EXEMPTIONS` carries the selector, the `why` and the SAME end condition (it ends when the reading rule
gains its own `round()` belt at the consuming declaration), and interpolates the selector into the walker
so it is spelled exactly once across the Node verdict layer and the in-page census. **Two-sidedness at
runtime is the ACCOUNTING, not a stale arm:** #987 requires the exclusion to be counted and printed, so an
audit of a surface with bubbles and a zero `readingSurface` count is a visible instrument problem.

**The DPR matrix.** Every fraction is normalized to DEVICE pixels IN THE PAGE
(`value * devicePixelRatio - round(value * devicePixelRatio)`), which is what makes one Node-side epsilon
correct at every arm: a CSS half-pixel is a real off-grid landing at DPR 1 and a perfectly crisp one at
DPR 2. `design-audit` has no `--dpr` flag and this program does not add one; the 1 / 1.25 / 2 arms are
taken by a scratch playwright probe that sets `deviceScaleFactor` per arm, and pinned permanently in
`tests/tooling/ui-audit/lib/checks-grid.test.ts`.

## 12. Laws 2–4 coupled sites

- Gate: `tooling/src/verify/gates/rest-transform-grid.ts` and its `Core-Enforcement-Active-Gates.md` row.
  The original registered-gate count and the `__g_resttransform` fixture in the retired anti-drift planter suite
  are legacy design history; current final-policy coupled sites
  and proof ownership follow `tooling/src/verify/gates/GATE-AUTHORING.md` §§2 and 5.
- Instrument: `tooling/src/ui-audit/ops/walker/census-grid.ts` (post-cohort, after `census-tier`) ·
  `ops/walker.ts`'s composition · `ops/walker/returns.ts` · `contract/samples-grid.ts` ·
  `contract/samples-populations.ts` (the `RelationalSamples` + accounting join) · `contract/rules.ts` (three
  rule ids) · `lib/checks-grid.ts` · `lib/collect.ts` (rung 4, `authoredDecisionKey`) · `lib/evidence.ts`'s
  `RELATIONAL_SAMPLE_FAMILIES` mapped-type record — which is the enforcer that made the census countable
  rather than silently uncounted.
- Proofs: `tests/tooling/ui-audit/lib/checks-grid.test.ts` (the `design-audit-rule-proof` fires/silent rows
  for all three rules, plus the DPR matrix).
