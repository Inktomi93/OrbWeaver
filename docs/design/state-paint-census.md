---
kind: design
status: archived
updated: 2026-09-04
---

# The state-paint census — one predicate, one forcing pass, three ex-blind sites

Tasks #22 (Base-UI data-attribute state paint) and #24 (escaped-selector fix). Lane cb-state-paint.

## The defect class

Base UI (the app's only interactive-primitive vendor) expresses interactive state as JS-driven
`data-*` attributes, never as CSS `:hover`/`:active` (<https://base-ui.com/react/handbook/styling> — the
full mechanism catalogue was independently re-derived and verified 2026-09-01). Three design-audit
walker sites scan stylesheet TEXT for the literal `:hover` and therefore cannot see that paint:

1. `tooling/src/ui-audit/ops/hover-walker.ts:53` — the `hover-contrast` prefilter. Verified live:
   14 files under `packages/{ui,client}/src` carry `data-(highlighted|pressed|selected|current|active)`
   paint variants, including `packages/ui/src/lib/popup-surface.ts:22` (ITEM_ROW:
   `data-highlighted:bg-accent data-highlighted:text-accent-foreground`) and
   `packages/ui/src/primitives/menu/variants.ts:34` (itemBase, the same full fg+bg pair). Those texts
   publish `excluded:{noHoverPaint}` — a measurement-shaped claim that is FALSE.
2. `tooling/src/ui-audit/ops/walker/census-decor.ts:200-203` — the identical `/:hover/i` selectorText
   scan in `animated-img-hover`. Zero live blast radius today; blind to the first
   state-attribute-driven img transform anyone authors.
3. `tooling/src/ui-audit/ops/walker/census-glow.ts` — one static computed read, zero state forcing,
   while the doctrine its own check states (`lib/checks-decor.ts:182`: the sanctioned glow rides
   "selected/active carriers only") gates glow on exactly the states the census never enters.
   Verified live: `data-selected:shadow-glow` (1 site) and `hover:shadow*` (3 sites) exist in
   `packages/client/src` — state-gated glow is a live idiom, not a hypothetical.

Plus the shared escaped-selector bug (#24): `HOVER_PSEUDO_RE = /:hover(?![-\w])/gi`
(hover-walker.ts:42) matches the `:hover` INSIDE a Tailwind escaped class name
(`.dark\:hover\:bg-neutral-700:hover` — the following `\` is not in `[-\w]`), and the strip mangles
the selector into one `querySelectorAll` throws on. Measured on the isolated stage (`config`):
25 unparseable → `noHoverPaintUnproven=58`, exit 2. The same unescaped-vs-escaped confusion sits in
every `indexOf(":hover")` in that file (lines 53/152/156) and in census-decor's `/:hover/i`.

## Architecture (chosen)

**ONE new walker segment, `ops/walker/state-paint.ts`, composed into BOTH page programs** (the main
walk `COLLECT_SAMPLES_JS`, inserted after `WALKER_RESOLVE`; and the hover pass `HOVER_CENSUS_JS`,
inserted after `WALKER_RESOLVE`, before `HOVER_CENSUS`). Order is load-bearing for `var`
initialization (ops/walker.ts header); function declarations hoist across segments. It carries:

- **The escape-aware `:hover` predicate** — `(?<!\\):hover(?![-\w])` — as the ONE test-and-strip
  home consumed by hover-walker (prefilter, compound split, strip) and census-decor (img scan).
- **The classified Base-UI state-attribute vocabulary** — one array, one comment per
  inclusion/exclusion (classification table below), plus the derived matchers: a top-level
  (paren-depth-0, unescaped-`[`) attribute-selector finder that returns `{attr, value|null}` for
  presence and exact-`=` forms and refuses other operators by name, and the Tailwind class-variant
  regex census-decor's class arm uses.
- **The selector machinery moved out of hover-walker** (top-level list split, compound split, join)
  so both mechanisms parse pairs through one parser and hover-walker stays under the 450 cap.
- **The glow-layer vocabulary moved out of census-glow** (`PSEUDOS`, `isDedicatedGlowLayer`,
  inset tolerance) plus `stateGlowRowsOf(el, stateSuffix)` — the one builder for
  GlowShadowInput/RadialGlowInput-shaped rows read under a forced state.

**The forcing rides the EXISTING forced-state pass** (ops/hover.ts + hover-walker.ts) — one census,
one candidate index space, one verify, one join contract (contract/samples-hover.ts), extended:

- The stylesheet collection keeps a rule when its selector carries interaction-state paint by EITHER
  mechanism AND its block sets `color`/`background-color` (contrast pairs) — and now ALSO when it
  sets `box-shadow`/`text-shadow`/a radial `background-image` (glow pairs; site 3's forced arm).
- Attribute pairs mirror hover pairs: split at the last compound carrying the top-level state
  attribute; subject = that compound's element, painted = the selector with the attribute selector
  stripped, resolved at rest. A painted element already matching the full stated selector at rest is
  `excluded: alreadyInState` (the rest-state rules already judge that paint).
- **Attribute forcing is in-page and synchronous** — record prior value, `setAttribute`, read
  members (and glow rows) via the same `getComputedStyle` machinery, restore prior value, assert
  the restore, all in ONE page task (React/Base UI cannot interleave; a MutationObserver reaction
  lands in a later microtask and is caught by the pass-final `hoverVerify`, which re-reads EVERY
  candidate's rest key — attribute candidates share that verification for free because they share
  the candidate array). Zero CDP round trips.
- Hover groups keep the CDP `CSS.forcePseudoState` flow unchanged; both read paths now also return
  the glow rows of their glow members, which ops/hover.ts folds into `samples.shadowGlows` /
  `samples.radialGlows` with the state spelled in the selector (`…[data-selected]::before`,
  `…:hover`), so `checkGlowShadow`/`checkRadialGlow` judge them with zero check changes and the
  sanctioned-layer discipline (`isDedicatedGlowLayer`) evaluated under the forced state.
- Attribute candidates route through the SAME `transitionCoversPaint` split (`itemBase` carries
  `transition-colors`; a t≈0 identical pair is `excluded: noHoverChangeButTransitioned`, never
  proof of no change) — committed in 288498604, reused as-is.
- **Polarity:** pseudo-element-painted pairs (Base UI's own `data-highlighted:before:bg-*` reference
  idiom — `resolveBackdrop` walks ancestors only, ops/walker/resolve.ts:201, and cannot read a
  pseudo's background) are WITHHELD by name (`pseudoElementPaint`), never silently unparseable and
  never judged against a wrong backdrop. Non-`=` attribute operators → `complexStateSelector`
  withheld. A state test of EITHER mechanism reachable only inside `:is()`/`:where()` is the compiled
  group-variant shape — `.cls:is(:where(.group)[data-checked] *)` and `.cls:is(:where(.group):hover *)`
  — and it has a two-step history that the ruling's own idiom explains: **the ruling survives, its
  INPUT changed.**

  - **Withheld, because unforcible (#1073).** Forcing the element the compound names would not engage
    the rule, so the pass published a FALSE `noHoverChange` exclusion — a measurement claim about a
    rule it never held. The `:hover` half of this bullet had been PROSE-ONLY until then: the attribute
    scanner tracked functional-pseudo depth from birth, the `:hover` side answered one "anywhere"
    boolean, and every `group-hover:` rule in the product was measured against the wrong subject.
    `stateHoverScan` gave both halves the same depth guard and the shape became
    `withheld(complexStateSelector)`.
  - **Judged, because the anchor is rest-resolvable (#1084).** The subject the rule names is a real
    selector inside the functional pseudo (`:where(.group)`, or a named `:where(.group\/row)`).
    `ops/walker/group-variant.ts` derives it, the pass resolves `painted.closest(anchor)` and forces
    THAT — over CDP for `:hover`, by `setAttribute` for the attribute twin, whose subject resolution is
    identical. `complexStateSelector` is retired for this shape on BOTH mechanisms.
  - **Still withheld: what the derivation refuses.** Only `<anchorCompound><stateTest> *` is accepted —
    ONE compound, ONE state test, a DESCENDANT combinator. The sibling form (`peer-hover:` compiles to
    `:is(:where(.peer):hover ~ *)`) has no `closest()` answer; a multi-compound argument names an
    anchor the pass cannot address; two state-bearing pseudos are two subjects it can only hold one of.
    Each keeps `withheld(complexStateSelector)`, and refusing them is what makes the acceptances
    trustworthy. Non-`=` attribute operators stay withheld for the same reason: the forcer cannot
    produce the value.

  All four directions are pinned in `tests/tooling/ui-audit/ops/hover-walker.int.test.ts`. Bare-attribute-first descendant
  pairs whose subject cannot be located at rest → `unresolvableStateSubject`. `noHoverPaint` keeps
  its key (pinned by tests/tooling/ui-audit/index.int.test.ts) and its claim becomes TRUE: excluded
  only when NEITHER mechanism paints the text and the scan was whole
  (`sheetsUnreadable===0 && unparseableSelectors===0`, the existing `paintProven` gate).

### The attribute classification (made once, here and in the segment's comments)

IN = a state of the control that user interaction (pointer, keyboard, selection, input) drives, whose
paint the app shows while the page structure is otherwise unchanged. OUT = lifecycle / positioning /
mid-animation attributes whose presence accompanies a structural change or a transition frame.

- IN: `data-highlighted` (the :hover/rove analogue), `data-pressed` (:active analogue),
  `data-selected`, `data-checked`, `data-indeterminate`, `data-active`, `data-current`,
  `data-dragging`, `data-scrubbing`, `data-placeholder`, `data-filled`, `data-focused`,
  `data-valid`, `data-invalid`, `data-dirty`, `data-touched`, `data-readonly`, `data-required`.
  (Entries with zero live rules cost nothing at runtime — the census only acts on rules that exist;
  the owner's standing ruling is "we don't build things just for what we have today".)
- OUT: `data-unchecked` (the REST arm of checked — present by default, judged at rest),
  `data-disabled` (WCAG 1.4.3 inactive-exempt; judged at rest on genuinely disabled controls),
  `data-open`/`data-closed`/`data-popup-open`/`data-nested*`/`data-has-submenu-open`
  (popup lifecycle — the state accompanies a mounted popup the forced attribute alone does not
  produce), `data-starting-style`/`data-ending-style` (mid-transition frames — reading one is the
  exact `getAnimations()` race the aspect check already guards), `data-side`/`data-align`/
  `data-orientation`/`data-anchor-hidden`/`data-uncentered`/`data-activation-direction`
  (positioning), `data-instant`, `data-swiping`/`data-swipe-*`, `data-visible`, `data-complete`,
  `data-expanded` (accompanies an expanded panel), `data-multiple`, `data-focusable`,
  `data-list-empty`/`data-empty`, `data-trigger-disabled`, `data-transitioning`/`data-previous`.

## Rejected alternatives

- **Broaden the prefilter only** (match `[data-*]` without forcing): selects subjects the pass never
  measures — a census publishing candidates it cannot judge. Actively wrong; ruled out by the brief
  and by the polarity law (`excluded` must be a measurement).
- **A separate attribute pass beside the hover pass**: duplicates the census/group/verify/join
  apparatus whose first shipped defect (the `as number[]` seam, samples-hover.ts:241-249) exists
  precisely because the boundary is subtle; one candidate space means the existing pass-final verify
  covers attribute restoration for free. Extend, never duplicate.
- **A new rule id (`state-contrast`)**: fenced off (the orchestrator owns the registry denominator);
  also wrong on the merits — the mechanism differs, the judged property (the paint pair under an
  interaction state) is the same, and population accounting is keyed by rule id (checks-hover.ts
  header states this exact reason for not folding into `contrast`).
- **CDP `forcePseudoState`-style forcing for attributes**: no such CDP door exists for attributes,
  and none is needed — `setAttribute` is faithful (Base UI sets exactly that attribute) and free.
- **Forcing BOTH arms of toggle states (`data-unchecked`)**: inverts a state the rest walk already
  covers from the other side; adds mutation risk for zero coverage.
- **Media-condition-aware rule collection + coarse-pointer attribute census**: real coverage
  (attribute states exist on touch), but it changes the pass's not-applicable arm and the collection
  semantics for the hover mechanism too; deferred as a STATED limit (hover.ts header) rather than
  smuggled in. The `no-hover-media` refusal stays visible on the RESULT line.
- **glow: publish a withheld count instead of forcing**: the forced arm costs near zero (glow rows
  are read while a subject is already held) and the state-gated glow idiom is live
  (`data-selected:shadow-glow`); a withhold would be "declare the limit" where the work is in reach.

## Coupled sites (enumerated before building)

- `tooling/src/ui-audit/ops/walker/state-paint.ts` — NEW segment.
- `tooling/src/ui-audit/ops/walker.ts` — additive import + two composition inserts (segment order:
  after RESOLVE, before CENSUS_DECOR/CENSUS_GLOW).
- `tooling/src/ui-audit/ops/hover-walker.ts` — escape fix via shared predicate; attr pairs; glow
  pairs; readAttr; counters. Selector machinery moves OUT (450-cap headroom).
- `tooling/src/ui-audit/ops/hover.ts` — compose the segment; drive attr groups (evaluate, validated);
  fold glow rows; new withheld/excluded reasons; STATE-ATTR print line; header truth-repair.
- `tooling/src/ui-audit/ops/walker/census-decor.ts` — img scan predicate swap (both arms).
- `tooling/src/ui-audit/ops/walker/census-glow.ts` — vocabulary moves OUT; header states the
  pseudo-backdrop limit and where the forced arm lives.
- `tooling/src/ui-audit/contract/samples-hover.ts` — `stateAttr` on rest/input rows; group rows gain
  the attribute arm; read-return gains glow rows; counters.
- `tooling/src/ui-audit/lib/checks-hover.ts` — message names the attribute state instead of "while
  the pointer is on it" when `stateAttr` is present.
- NOT moved: `contract/samples.ts` (at 449/450 — GlowShadowInput/RadialGlowInput already fit),
  `ops/run.ts` (machine line unchanged; hoverPass artifact object unchanged), rule registry,
  `lib/checks-decor.ts` verdict logic, `lib/checks-structure.ts` (extended img samples ride the
  existing shape), core.ts (its now-partially-superseded regexes are inert page vars).
- Tests: NEW `tests/tooling/ui-audit/ops/walker/state-paint.int.test.ts` (mirror path); existing
  pins that must keep passing: `tests/tooling/ui-audit/index.int.test.ts` (hover section incl.
  `excluded["noHoverPaint"]`), `tests/tooling/ui-audit/ops/walker/census-glow.int.test.ts`,
  `tests/tooling/ui-audit/index.test.ts` (untouched).

## Test plan (two directions everywhere; red-first via cp/mv against unmodified source)

state-paint.int.test.ts fixtures, real CLI over file:// (the census-glow harness pattern):

1. **Escape pin (#24)**: a stylesheet whose failing hover rule is an escaped Tailwind-style class
   (`.dark\:hover\:bg-x:hover`) → new: `hover-selectors-unparseable=0`, the finding fires, the
   population is `excluded:{noHoverPaint}`-proven. OLD source: unparseable>0, `noHoverPaintUnproven`
   withheld, no finding (red-first receipt).
2. **Attribute census fires**: `[data-highlighted]` pair below the floor → `hover-contrast` finding
   naming the state; twin above the floor silent with `judged>0`; untouched paragraph
   `excluded:{noHoverPaint}`. OLD source: no finding, candidates excluded (red-first receipt).
3. **alreadyInState**: an element carrying the attribute at rest is excluded by that name and its
   paint judged by the rest family (no double-file).
4. **Restore poison control**: a fixture MutationObserver re-adds the attribute after the pass
   removes it → `notRestored>0`, the candidate is WITHHELD, no finding published from the stuck
   state. This is the planted control proving the pass-final verify is load-bearing for the
   attribute arm (an inline-only restore check would read clean here).
5. **Valued selector** (`[data-selected="true"]`, the live cmdk form,
   packages/ui/src/primitives/command/variants.ts:46): forced with the value, judged.
6. **Glow under state**: `[data-selected]::before` chromatic glow in a non-house layering → forced
   read emits it and `glow-shadow` fires with the state in the selector; the house-form twin under
   the same state is silent (`isDedicatedGlowLayer` under force); a `:hover`-gated element glow
   fires through the CDP arm. OLD source: all silent (red-first receipt).
7. **Pseudo-element paint**: a `:hover::after` color rule → withheld `pseudoElementPaint` (named),
   unparseable stays 0.

Floor: scoped biome · `node scripts/ts7.cjs --noEmit -p tsconfig.json` · `pnpm test:scoped`
(state-paint.int, cli.int, census-glow\.int, index) `--maxWorkers=4` · `pnpm check:structure` (json
verdict). Live acceptance: `/`=1, `config`=4, `settings:appearance`=14 hold (or a new REAL finding
is reported, never tuned away); isolated stage `pnpm snap config --dirty --design-audit` before/after — the
escape fix should collapse `noHoverPaintUnproven=58`.

## Forks / walls / stated limits

- **RESOLVED FORK — the CTA hover glow (owner RATIFIED 2026-09-01, in-lane)**: the forced-glow arm's
  first live finding was the primary-CTA `hover:shadow-cta-glow` element glow
  (`packages/ui/src/primitives/button/variants.ts:40`), whose token
  (`packages/ui/src/tokens/tokens.json` `shadow.cta-glow`) documents itself as the deliberate
  rationed Ember glow. Ratified exemption MECHANISM (never a name list): a forced-state ELEMENT glow
  whose computed `box-shadow` equals the value `--shadow-cta-glow` resolves to on that element —
  taken via a probe node beside the element (scoped token overrides resolve identically) with
  Tailwind's `rgba(0, 0, 0, 0) 0px 0px 0px 0px` unset-layer placeholders normalized away
  (`matchesCtaGlowToken`, ops/walker/state-paint.ts; cache keyed PER ELEMENT and the probe carries the element's own raw token text — warm-leg F1 fix, pinned by the two-scope currentColor twins after the raw-keyed first cut falsely fired on the second scope). The ratification's premise was RE-MEASURED
  fresh on this tree (scratchpad `compose-receipt.mjs`): under CDP-forced hover+focus-visible the
  computed box-shadow serializes the FOCUS RING pair first and the glow layers after — they COMPOSE,
  nothing clobbered, re-confirming the SKILL.md 2026-09-01 retraction. Two-direction pins in
  state-paint.int.test.ts (`#gcta` silent, `#gcta-near` — the token plus one smuggled layer —
  fires), plus a neutered live run proving `#gcta`'s silence is carried by the exemption.
  `checks-decor.ts`'s doctrine message updated to the measured truth.
- **WALL (pre-declared)**: `data-selected:bg-primary/10` on the ratified list-row idiom (#485) is
  alpha paint; `resolveBackdrop` composites translucent layers so the math is sound, but if the
  forced census floods subjects/findings across every list surface, STOP and report counts +
  propose an exemption MECHANISM (never a name list). Checked at live acceptance.
- **Stated limit — pseudo-element backdrops**: Base UI's reference idiom paints item hover via
  `::before`; `resolveBackdrop` cannot read a pseudo background (resolve.ts:201). Our own usage
  paints on the element (verified: ITEM_ROW/itemBase set `bg-accent` directly); pseudo-painted
  pairs are withheld by name, so the limit is visible in every run that hits it.
- **Stated limit — coarse pointers**: the `no-hover-media` early return now also withholds the
  attribute census (named in the hover.ts header); media-aware collection is the future unlock.

Memory lessons consulted (by filename): `transition-property-fence-unfailable.md` (negative CSS
assertions need planted controls — drives the two-direction posture here),
`empty-population-vs-broken-probe.md` (honest-empty vs broken discrimination — the
`paintProven`/withheld polarity), `write-probe-owes-a-witness.md` (a probe whose payload equals the
default is un-failable — why `alreadyInState` is excluded rather than force-read),
`instruments-lie-verify-the-verifier.md` / `oklch-kills-rgb-regex-probes.md` (via checks-decor
history already encoded in the tree).
