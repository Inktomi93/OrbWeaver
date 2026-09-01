---
kind: design
status: active
updated: 2026-09-01
---

# Integer line boxes — the crisp type scale (Law 1 of the crispness doctrine)

> Owner rulings 2026-09-01, verbatim intent: "i want everything crisp at all times regardless of
> device or orientation" · "wouldnt it be better to make a gate so it cant happen?" · "we fix the
> scale to work properly we havent shipped yet". This document is the design for (A) the re-authored
> type/leading scale, (B) the `integer-line-boxes` gate, (C) the `round()` belt. Laws 2–4 of the
> doctrine (transform landings, promoted-layer offsets, the audit backstop) are explicitly out of
> scope here.

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

**Residual, stated honestly:** at `--font-scale` values with a non-integer root, `--spacing-*`
offsets (0.125rem/0.375rem steps) are fractional regardless of line boxes — full-grid alignment at
those scales is Law 2/3/4 territory. What Law 1 guarantees: every line BOX is integer at every
font-scale (the belt), and at the default scale 1 the entire type scale is integer by authorship.

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

### 3b. The belt: `round(<rem>, 1px)` in the emitted value

The generated `theme.css` emits every snapped leading as `round(1.4375rem, 1px)` — identity at
scale 1 (authored integer), integer at EVERY `--font-scale` (the continuous multiplier from §2.1).
`round()` is the one usable platform primitive (Chromium 117+/FF 118+/Safari 15.4+;
`line-height-step` has zero support). The belt lives in the TOKEN VALUE so every consumer — the
Tailwind `leading-*` utilities, tiers.css's `--orb-tier-*-leading` indirection, `lh`-unit
arithmetic (`.orb-lines-N`) — inherits it from one home.

Mechanism: a new `orb.output` role **`snapped`** in the vault contract
(`packages/ui/token-contract.ts` `outputSchema` + a `snapped ⇒ dimension` diagnostic), rendered by
`tokens.build.ts` (`renderPortableToken`) as `round(${amount}${unit}, 1px)`. This is the house
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
3. **Bare `text-*` with no leading class** (\~18 live code sites; boxes currently decided by
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

Coupled sites per GATE-AUTHORING §2: descriptor with ≥1 `mustFlag`/`mustPass` per arm (fractional
token fixture, unpaired text fixture, banned-vocab fixture, marker-honoured pass, SVG-marker pass);
`tests/tooling/check-gates.int.test.ts` `writeFixtures()` `__g_` fixture; the
Core-Enforcement-Active-Gates row + the registered-gates count; the gate int test
`tests/tooling/verify/gates/integer-line-boxes.int.test.ts`. Comment posture: the pairing arm is
AST-side (comment-safe via the walker); ARM C routes CSS text through `blankCssComments`.
Ratification: two receipts — a planted real-tree violation REDs `pnpm check:structure`, the clean
tree GREENs with a non-trivial scan denominator.

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

1. **Files outside the named fence that the outcome forces** — ui variant re-pairs (\~25 files),
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
