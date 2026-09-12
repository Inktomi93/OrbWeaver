---
kind: design
status: active
updated: 2026-09-12
---

# CSS family ownership — declaration-level provenance wall

This is the phase-1 design for #951's remaining internal-responsibility wall. The existing gate proves
the six declaration homes and their closed grammar, but its producer arm is still a second, weaker class
evaluator: it grants authority from local composer spellings, walks values with its own recursion, and
mixes source-terminal discovery with CSS policy in a 1,959-line module
(`tooling/src/verify/gates/css-family-ownership.ts:270-799`). The dirty lane already planted the right
counterexamples. The implementation below preserves those controls and replaces the duplicate evaluator
with the repaired #961 neutral substrate.

The source doctrine remains the six-home ruling in
`docs/reviews/stickler/2026-08-30-css-census-doctrine-and-enforcement.md:811-981`; this lane does not
change the census, home ownership, CSS source order, or product CSS. The cold #951 comment is the behavioral
specification for the seven dispatcher-level counterexamples. The repaired substrate's own boundary is
recorded in `docs/design/961-static-class-provenance-repair.md`: consumers choose a real terminal, while
the substrate resolves only the value that reaches it.

## 1. Chosen architecture — terminal carriers over one neutral evaluator

Ownership begins only at syntax that can put a hook on a rendered element:

- JSX `class` / `className`, including statically resolved `...props` fields;
- calls whose callee has declaration provenance to a canonical class composer, including a transparent
  function declaration, function expression, block arrow, or expression arrow that RETURNS the canonical
  composer's result;
- DOM-backed `classList.add/remove/replace/toggle` calls and DOM-backed `className` assignments, proven
  from `lib.dom.d.ts` declarations rather than receiver property spelling;
- JSX `data-slot` / `data-shell-*`, including statically resolved JSX spreads.

Each terminal is handed to `evaluateStaticClassExpression`, `evaluateStaticClassProperties`, or
`evaluateStaticObjectProperties`. Those APIs preserve producer anchors through aliases, re-exports,
arrays, object overwrite order, spreads, templates, joins, variants, and canonical forwarding wrappers
(`tooling/src/verify/lib/static-class-expression.ts`). The ownership gate only tokenizes the returned
class values and records their source package. It does not rediscover values or composer identity.

This closes the confirmed misses without making spellings authoritative:

- wrapper calls work because repaired #961 admits only returned canonical-composer values;
- spread arguments to DOMTokenList mutators work because the terminal evaluator unwraps spread/array
  carriers;
- inert `{ className: ... }` objects stay inert because object fields are evaluated only when a proven JSX
  spread terminal requests them;
- unrelated `{ classList: { add() {} } }` receivers stay inert because the call is not DOMTokenList-backed;
- attribute selector values are skipped as one lexical unit before class tokens are scanned;
- every `.shell-*` / `[data-shell-*]` selector hook must have a proven client terminal, so a legal prefix
  cannot launder an invented name.

## 2. Module boundaries

The current gate exceeds the lane's explicit 450-line ceiling, so the repair also separates its existing
responsibilities without changing policy:

- `tooling/src/verify/gates/css-family-ownership.ts` remains the auto-discovered descriptor and proof
  catalog only;
- `tooling/src/verify/lib/css-family-source-provenance.ts` owns terminal selection, DOM type proof, and
  translation of neutral evaluator results into UI/client hook owners;
- `tooling/src/verify/lib/css-family-selector-provenance.ts` owns selector tokenization, shell-root grammar,
  and the written-hook check;
- `tooling/src/verify/lib/css-family-census.ts` owns stylesheet parsing and declaration census;
- `tooling/src/verify/lib/css-family-policy.ts` owns the six-home policy reports and gate orchestration;
- shared CSS-family records/constants live in a small contract module when more than one of those modules
  needs them.

Helpers do not live in `tooling/src/verify/gates/`: that directory is executable descriptor discovery
(`tooling/src/verify/lib/loader.ts:82`), so placing ordinary modules there would create counterfeit gates.
Every resulting TypeScript module stays below 450 lines.

## 3. Rejected alternatives

- **Keep the local evaluator and patch seven branches.** Rejected: #961 exists specifically to prevent
  consumers from each inventing a subtly different class language. The gate's current local resolver and
  recursion (`tooling/src/verify/gates/css-family-ownership.ts:270-609`) already drifted on wrappers,
  spreads, and inert object fields.
- **Use `walkStaticClassExpressions` over every source file.** Rejected: its broad discovery API includes
  object `className` properties by design. #951 needs declaration-level ownership only at proven rendering
  terminals, so it must call the exact-terminal APIs.
- **Trust `className`, `classList`, `cn`, or `shell-*` spellings.** Rejected: every spelling has a confirmed
  inert counterfeit. Compiler declaration provenance and an actual client terminal are the boundary.
- **Require provenance only for the first shell root token.** Rejected: an invented shell descendant would
  still pass beneath a real `.shell-grid`; every structural hook is checked independently.
- **Add suppressions for opaque shapes.** Rejected: no blanket suppression is legal here. Unsupported
  runtime values remain explicitly outside the static guarantee and may be elevated only by a concrete,
  reviewed terminal shape.

## 4. Coupled-site inventory

The implementation touches these coupled sites and no product CSS:

1. prerequisite substrate commits `397e805f5` and repair `0952cc462`, including their focused evaluator
   test and test-baseline manifest row;
2. the gate descriptor/proof catalog;
3. the extracted census, selector, source-provenance, policy, and shared-contract modules;
4. this durable design, replacing the lane-root scratch dotfile;
5. the gate-conformance path that executes every `mustFlag` / `mustPass` fixture through the real
   dispatcher; and
6. tooling typecheck plus scoped lint/format/diff for the changed files.

The active-gate registry row already names `css-family-ownership`; loader discovery already finds the
descriptor. No registry, package export, product census expectation, or authored CSS change is required.

## 5. Red-first and verification plan

Before the behavior change, run the real conformance dispatcher against the dirty descriptor and retain
the failures for all four refutation families:

1. canonical block/function wrappers are false-red;
2. a spread DOMTokenList argument is missed;
3. inert `className` / counterfeit `classList` shapes are false-owned;
4. selector attribute text is false-tokenized and invented shell names are accepted.

Permanent controls retain both polarities: the counterfeit is a `mustFlag` case where false ownership
would hide a CSS violation, while the corresponding legitimate carrier is a `mustPass` case. After the
repair, run the focused substrate test, the focused gate proofs, the gate on the real tree, and tooling
typecheck. Then run only scoped lint, format, and diff checks. This lane explicitly does not run
`check:structure`, `verify --full`, or a repo-wide barrier.

The planted-control rule here also follows the prior tooling lesson in
`rollout_summaries/2026-08-22T00-31-31-CdVc-orbweaver_tooling_plan_and_frame_drop_proof_audit.md`:
a zero-result instrument is credible only after a planted defect proves the failure path can bite.

## 6. Forks and declared limits

There is no owner-sacred fork and no prose/persona/push decision. The strictness choice is already decided
by #951: every shell structural hook needs a client writer, not merely a namespace-shaped spelling.

The wall is static and declaration-level. It does not claim runtime proof for arbitrary higher-order
components, render-prop factories, reflective DOM calls, mutable class accumulators, or values behind
unresolved runtime spreads. Those shapes remain opaque rather than being guessed clean. The lane also does
not revisit the already-accepted six-home census or migrate product CSS.

## 7. The declaration-census mint ledger (moved here 2026-09-12, #2181)

**WHY THIS PROSE IS HERE AND NOT IN THE CODE.** `lib/css-family-census.ts` carried
`EXPECTED_DECLARATION_CENSUS` (five per-sheet declaration counts), `EXPECTED_DECLARATION_TOTAL` (1029)
and, hanging off them, ~140 lines annotating every delta since the #938 baseline — what was minted, what
measurement forced it, and what it must never become. `exception-authority-census.md:178` rules those
counts out: *"the five per-file declaration counts and aggregate total are current-population counts and
retire."* The counts retire; **the reasoning does not**, because nobody can reconstruct it from the
stylesheets. It is moved here verbatim, grouped by the constant it annotated, before the constants are
deleted.

**It is a HISTORY, not an oracle.** Nothing reads these numbers any more. Each heading records the count
the sheet carried when the ratchet retired, so a later reader can date a delta; a sheet's count today is
whatever `check:structure` prints on the gate's own scan line, which is the denominator the gate always
meant to use.

**WHAT SURVIVED THE RETIREMENT, and it is not an endorsement.**
`EXPECTED_DIRECT_THEME_DECLARATIONS = 203` stays, because the same ruling classes it as *generated-output
parity* rather than a current-population count. On the tree it is still a hand-copied literal compared
against a parsed count — the same SHAPE as the three ratchets `css-var-defined` retired the same day,
under a different word. Whether it must be DERIVED from the generator's input (tokens.json → the emitted
`@theme` block) to earn the name is an open ruling, escalated 2026-09-12 and deliberately not decided by
the lane that wrote this section. Its survival here records the ruling's boundary, not agreement with it.

**Two transcription corrections, stated because a moved comment is where a silent edit hides.** A
continuation line beginning "+8 on the sheet total above" was re-joined to the bullet it belongs to (the
lift read it as a new delta), and one directional phrase — "the #1362 row below" — is re-spelled by name,
since it pointed the wrong way in the source too. No other word changed: the lift asserted an identical
word count on both sides (1919).

### theme.css (generated) — 312

- +2 over the #938 baseline: leading.micro + leading.label-relaxed (docs/design/integer-line-boxes.md).

- +1 more: --color-accolade, the polarity-aware distinction ink minted 2026-09-01 when the seed ink-duty audit measured the crown gold as TEXT at 1.41-1.71:1 on the light seed (tokens.json color.accolade; the mark token color.highlight stays background-only).

- +1 more (2026-09-02, #1120): --dimension-device-pixel, the DPR-1 grid quantum the shell's panel tracks round to (tokens.json dimension.device-pixel; a viewport-derived clamp resolves 307.1875 and takes the promoted panel layer off the grid). It is a round() STEP, never a width or a spacing.

- +6 (2026-09-02, #1109 + #1145): `--spacing-switch-track-height` + `--spacing-switch-inset` (the switch knob is now proportional AND inset on four sides — three direct tokens + their three fine-pointer arms with `--spacing-switch-thumb`, which gained its pointer arm) and `--reading-measure-prose` (the ruled 47ch prose measure; `--reading-measure` stays the transcript's 75ch).

- +2 more (2026-09-02, #1110): the `--color-selection-quiet` PAIR — the opaque, polarity-aware ground a bulk-default selection control paints when it is ON, and the mark on it. Minted because the first cut (`bg-foreground/55` + `text-background`) forced an INVERTED ink whose ground is the control's own fill, which `seed-theme-ink-contrast` can only judge against the eight surface GROUNDS — 48 findings, unpassable by tuning. A `-foreground` pair is the shape that census can read (tokens.json).

- +1 (2026-09-02, #1204): `--dimension-shell-content-floor` — the chat-width dial's floor derived from the Geist reading measure (650 + 40 gutter + 48 flat insets = 738px) instead of the pre-Geist 680px literal.

- +5 (2026-09-04): the density-selected fixed grid cell — `width.cell-fixed` + `width.cell-fixed-compact` (2 direct @theme, tokens.json) and `--orb-grid-cell-fixed` with its comfortable/compact density aliases (3 rules), so Grid `cellFixed` reads one density-selected track instead of a raw minmax literal (tests/ui/tokens/index.test.ts pins the pair; `cellShelf` keeps its independent 8.5rem track).

- +1 (2026-09-05, D159): `--color-input-border` — the opaque FORM-CONTROL edge. `--color-border` is an 8%-alpha decorative hairline measuring 1.19-1.32:1 around every input, select trigger and textarea, and WCAG 1.4.11's 3:1 governs a control's boundary while saying nothing about a divider; raising the shared token would have moved 72 consumers to satisfy a floor binding on a dozen. One `light-dark()` token, both arms measured floor-and-ceiling per seed (tokens.json color.input-border).

- −2 (2026-09-06, #1684): `--spacing-switch-thumb`'s two arms — see the note on EXPECTED_DIRECT_THEME_DECLARATIONS below.

- +8 (2026-09-07, #1868): the FIELD TYPE STEP, minted pointer-conditional — `text.field` / `text.field-dense` and their paired `leading.*`, four tokens each emitting a base (coarse) declaration and an `@media (pointer: fine)` arm. iOS Safari zooms the viewport in when a control under 16px takes focus and never zooms back out, so the platform floor is 16px at coarse; the fine arms are the design's own 15px/13px steps. The arm rides `$extensions["orb.pointerFine"]`, the `spacing.touch-target` mechanism (§4b axis 3: a capability is baked into the TOKEN so the call site carries no variant) — which is what let the interim `@media (any-pointer: coarse)` blocks in ui globals.css AND tiers.css both be DELETED in the same commit rather than left as a second home for one platform fact. NOT an arm on `text.body`: `[data-slot="message-bubble"]` reads that for transcript prose, and a coarse arm there would enlarge all reading prose on touch and collide with `--reading-body-scale`.

### ui globals.css — 190

- +2 (2026-09-02, #1128): `--scroll-fade-depth` / `--scroll-fade-floor` on `.scroll-fade-y`. The block -axis fade ramped to ZERO alpha over 10% of the pane and measured two live buttons at 1.75:1 at the shipped 1280x800 default; a bounded band plus an alpha floor needs two locals, and they deliberately mint no `--fade-*` family (that one is generated — see LOCAL_FADE_STOP_RE below).

- +1 (2026-09-07, #1868): the coarse-pointer 16px FIELD FLOOR — one `font-size: var(--text-title)` on `[data-slot="input-root"|"textarea-root"|"select-trigger"]` inside `@media (any-pointer: coarse)`. iOS Safari zooms the viewport on focus for any control under 16px and never zooms back out, and every field in the app computed 15px (`--text-body`) or 13px (`--text-label`). This is the UN-TIERED half of a two-home floor; the TIERED half is the `--orb-tier-field-size` pair in tiers.css below, and the split is SPECIFICITY, not duplication (the tier map is unlayered at (0,2,0) and must keep out-ranking this (0,1,0) rule so a tier can still retune itself). It mints no family and no token: `--text-title` is the existing 1rem step. It is CSS rather than a utility on FIELD_CONTROL because Base UI's own spelling, `any-pointer-coarse:text-base`, imports TAILWIND's default scale — `no-raw-typography-in-features` reds it, correctly.

- +1 (2026-09-07, #1869): the drawer's bottom safe-area clearance — one `padding-bottom` on `[data-slot="drawer-content"]`. A Drawer portals to a SIBLING of `.shell-grid`, so the frame's own four-edge insets structurally cannot reach it, and the phone's modal presentation IS this component. CSS rather than a variant because `env()` has no token utility spelling and an arbitrary `pb-[env(…)]` is gate-RED; this tier owns primitive-wide treatments where CSS itself is the mechanism.

### tiers.css — 47

- +2 (2026-09-04): `[data-density="comfortable"]` / `[data-density="compact"]` each set `--orb-grid-cell-fixed` to its density alias — the tier map is where the density selection lives.

- +2 (2026-09-07, #1868): the coarse-pointer arm of the FIELD FLOOR — `--orb-tier-field-size` and `--orb-tier-field-leading` re-pointed at the `--text-title`/`--leading-title` step under `@media (any-pointer: coarse)`. It is HERE and not only in ui globals.css because this file is unlayered by design: `[data-surface-tier] [data-slot="input-root"]` at (0,2,0) out-ranks both the primitive's utility default AND the (0,1,0) un-tiered floor, so a field inside ANY `<Surface>` — every LIST pane search box, every settings field — would otherwise have kept its 13px/15px step and gone on zooming iOS on focus. Two declarations because the tier map always maps size and leading as a pair. No family minted: both values are existing generated tokens.

### client globals.css — 127

- +1 (2026-09-02, #1120): the collapsed panel's `backdrop-filter: none`. A section that declares a pane "unavailable" still renders it collapsed (owner decision H3 / arm L-b), and the off-screen box was keeping the most expensive paint primitive in the browser for a box that blurs nothing.

- +7 more (2026-09-02, #1154): the pane's glass moved off `.shell-panel` onto a `.shell-panel::before` fill layer, so the pane's TEXT is no longer inside a promoted layer (integer-line-boxes.md Law 3/4). One 2-declaration rule became two rules of 1 + 8 — `background-color: transparent` on the pane, and on the carrier the five that GENERATE it (`content`/`position`/`inset`/`z-index`/`pointer-events`, the grain overlay's own shape one screen down), the two glass declarations, and `box-shadow: inherit` so the pane's elevation highlight is not blurred away by the carrier's backdrop-filter.

- +6 more (2026-09-02, #1173): `.shell-main`'s reading-surface glass took the SAME carrier move, one surface over — it promotes and it contains the reading column's text (Law 3/4), and only escaped #1154's own measurement because the audited arm carries no wallpaper. One 2-declaration rule became two rules of 1 + 7: `background: none` on the pane, and on the carrier the five that GENERATE it plus the two glass declarations. No `box-shadow: inherit` on this one — `.shell-main` authors no elevation and clips nothing, so the pane rule's shadow clause has no subject here (stated at the rule).

- +2 (2026-09-05, #1362): `.orb-chat-track`'s two margin declarations — the room's ONE horizontal track stopped centring with `mx-auto`, whose halving of an ODD remainder landed the track (and every `backdrop-filter` layer inside it) on a half pixel. Measured on the isolated stage: content pane 893px, track 768px, margin 62.5 — `left -0.500 device px` on FOUR promoted layers at once (`composer`, `swipe-strip`, two `message-bubble`s) plus the `off-grid-text` their glyphs inherit. The replacement is `margin-inline-start: round(down, …, 1px)` + `margin-inline-end: auto`, the horizontal twin of Law 1's leading belt (integer-line-boxes.md §3b / Law 3). Same Law 3/4 family as the #1154 and #1173 rows above.

### shell.css — 353

- +2 (2026-09-02, #1154): the band's separator moved from `border-block-end` to two composed box-shadow stops (`--shell-band-rule` / `--shell-band-ember` + the `box-shadow` that reads them), so the 48px band stops being a 47px CONTENT box that lands every occupant on a half pixel. The ramp / floating-context overrides are one declaration each before and after — they now answer their own stop, not the property.

- +6 (2026-09-05, #1316): the panel FLIP's END-PINNED COUNTER. `.shell-main` RESIZES rather than translates, so its single counter-translate is the right distance only for START-aligned content; the topbar TRAIL is pinned to the end edge (delta zero) and the FLIP was throwing it a full track outside the viewport and sweeping it back. Two `from`-only keyframes (1 declaration each) + the two `data-list-flip` counter rules + the two `data-list-settle` counter rules. The mobile-block cancels widen existing selector lists and mint no declaration.

- +6 (2026-09-06, #1646): the FLIP's THIRD counter, for the CENTRED class — `[data-slot=message-row]`'s honest delta is HALF the track (`.shell-main` resizes; a centred child moves by half of what a start-aligned one does), so it takes its own pair of `from`-only keyframes at `calc(track / 2)`, its own two `data-list-flip` counter rules and its two `data-list-settle` twins — the exact #1316 shape one alignment class over. The mobile cancel again widens a selector list and mints nothing.

- +2 (2026-09-07, #1868): the DEVICE INSETS became the grid's on all four edges — `padding-block-start: env(safe-area-inset-top)` and `padding-inline: env(…-left) env(…-right)` replacing the lone `padding-inline-start`. `viewport-fit=cover` makes notch/Island/home-indicator avoidance OURS, and three of the four edges were unkept: TOP was invisible in a browser tab (Safari's own chrome sits there) but real in the `display: standalone` PWA, where the 48px topbar rendered under the status bar and the Island; END was unkept in landscape. Paying them on the GRID rather than per region is what preserves the D66 A1 chrome-row horizon, and `box-sizing: border-box` means the block padding comes out of the existing `100dvh` rather than adding to it. The topbar's own `max(--spacing-block, env(…-right))` collapsed back to a plain `padding-inline` in the same commit (that was the single-region half of this job, now double-counting), so the net is +2 and not +3.

- +2 more (2026-09-07, #1869): the frame's BOTTOM inset — `padding-block-end: env(safe-area-max-inset-bottom, …)` on `.shell-grid`, refunded to 0 inside the one mobile arm where the tab bar's grid row already carries it. #1868 left the bottom edge to that row and said so, which was true on a phone and left a real hole above 48rem, where there is no bottom row at all: on a wide viewport with a home indicator the content column, both panes and the rail all ran under it. It cannot be a second viewport `@media` — paint law §4.4 grants shell.css exactly one and it is already spent.

### the five-sheet TOTAL — 1029

- −2 (2026-09-06, #1684): `--spacing-switch-thumb`'s base and `@media (pointer: fine)` arms. The Switch knob became a token-driven calc of the other three dimensions (`track-height − 2×border − 2×inset`) so the centred block gap is an EVEN difference by construction and the resting thumb lands on a whole device pixel at every `--font-scale` — the vault token had no consumer left and is retired in packages/ui/src/tokens/removed.json. Same family as the #1362 row under client globals.css: a half-pixel landing repaired at the length that produces it (docs/design/integer-line-boxes.md §2, amended there).

- +13 (2026-09-07, #1868 + #1869): 8 theme (the four pointer-conditional field tokens, base + fine arm each) and 4 shell (the four-edge device insets, then #1869's bottom pay/refund pair), 1 ui globals (#1869's drawer clearance). ui globals and tiers are NET ZERO — each briefly carried an `@media (any-pointer: coarse)` block while the floor was being built in CSS, and both were deleted when the token layer took the capability; that is the shape §4b axis 3 asks for and the reason the two CSS homes do not appear in this delta at all. Each half is annotated at its own sheet above.

### `EXPECTED_DIRECT_THEME_DECLARATIONS` — 203 (SURVIVES this retirement — see the note above)

- +4 (2026-09-07, #1868): the four field tokens' BASE declarations. Their `pointer: fine` arms live in a generated @media block, which is a themeRule and not a direct @theme declaration — hence +4 here against +8 on the sheet total above.
