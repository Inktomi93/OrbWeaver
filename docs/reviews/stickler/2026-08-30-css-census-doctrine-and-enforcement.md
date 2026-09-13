---
kind: review
status: active
updated: 2026-09-01
---

# stickler — the CSS tier: full census, doctrine, game plan, doc reconciliation, and an enforcement probe sweep

**Lane:** cb-css-census · **Issues:** #918 (the census) · #919 (D150's false clause) · #921 (the gate gap, filed
mid-run off this lane's planted control) · **Base:** `28d526c99` (main tip; the #914 merge + catalog commits).
**Scope as dispatched, then extended twice by the owner:** (1) read the 3,169 authored CSS lines in full;
(2) produce the doctrine, the game plan, and the doc reconciliation; (3) probe every enforcer that touches CSS
or Tailwind. All four deliverables are below.

**Historical outcome at base `28d526c99`: 13 confirmed findings (severity ceiling P1), 1 refuted premise,
3 probe artifacts caught in the instruments, and a doctrine + game plan + ready-to-apply doc text.** The
original census changed no CSS. The addendum corrected F8 with exact Tailwind 4.3.3 compiler evidence and
added the token-contract/generator and single-merge/cascade findings; its full API receipts live in
`2026-08-31-tailwind-style-dictionary-dtcg-api-audit.md`.

## Current-state reconciliation — 2026-08-31

This report is both evidence and a repair ledger. Numeric selector, colour, motion, layer, and rendered
measurements below remain evidence against base `28d526c99`; they are not silently re-labelled as HEAD
measurements. Current main has five sanctioned stylesheets totalling **3,174 lines** (309 + 831 + 160 + 699 +
1,175). The sixth sanctioned CSS home is `tokens.json`, not a sixth stylesheet. Current status:

- **Done:** #919 (doctrine/D150), #921 (closed six-home inventory), #936 (DTCG contract), and measured defects
  \#937–#940.
- **Integrated and grouped-barrier graduated:** #949–#952, #954–#957, #959, #961, #965, and #966. #966 has
  hoisted four repeated per-gate scans into shared pass indexes; this report does not claim its entire
  110-gate inventory migrated.
- **Integrated and grouped-barrier graduated:** #950 implements browser cascade provenance from the
  revision-pinned official DevTools frontend SDK proof.
- **Post-graduation trust repairs:** #972 proved 413 previously opaque `tv` observations in each static
  ownership gate, leaving 508 genuinely runtime-assembled observations and a zero `cva` population. #975
  repaired the live cascade denominator and same-revision DevTools closure. #976 made design-audit's settled
  subject and requested/resolved/actual theme evidence exact. #977 made motion-audit's requested/applied/actual
  browser environment fail loud on a viewport-only mobile counterfeit. #953 then consumed all three: the rated
  appearance matrix, its R1–R7 route floors, and the dead/empty CSS blocking floor graduated at `78788014d`,
  which empties this plan's OPEN and REPORTED-BUT-UNREAD categories. #962 alone remains deferred and live.

The 2026-08-31 graduation receipt is deliberately split rather than rerunning five minutes of unchanged
code for generated line offsets: one full `pnpm check` made 16/17 static stages green, including 242/242
structural gates over 6,337 files, 965/965 CSS declarations, Biome, ESLint, all type tiers, dependency-
cruiser, Knip, docs, and catalog. Its sole red was five moved line numbers in the generated caught-failure
population after a four-line suppression-removal helper. Regeneration then made `ledgers:fresh` green at
2,202 test files and 421 caught sites with zero unproven. Focused affected tooling was 64/64, the rendered
worst-art matrix 21/21, and the official-SDK cascade matrix 3/3.

\#949 now owns the one class-list merge and bounded `__orb.css` loser→winner replay. It does **not** explain
the browser cascade. #950 is the separate browser tier: official `CSSMatchedStyles.propertyState` supplies
`Active`/`Overloaded`; raw-CDP inference, source mutation, UI scraping, and a local cascade evaluator are
rejected. #965 bounded the shared static provenance collection at 1,195 owners, 1,583 sources, 1,745
evaluators, 68,517 dispatched nodes, and 2,331 root evaluations in 19.3s with 3.48 GB max RSS; its focused
suite passed 42/42. The semantic population governed by #956 remains 68 non-utility class identities plus
112 data-selector identities. Those current semantic counts are not interchangeable with the historical
7,189-file textual reach sweep.

\#976's old 500ms walk preceded settings/theme settlement at about 690ms, so 285 walked subjects could falsely
certify 381 settled subjects: `381/285 = 1.337`, below the old 1.5x heuristic. The replacement is an exact
identity-preserving equation: every Light, Mocha, and default run accounts for 381 settled subjects as 363
walked/judged plus 18 explicit document-head skips, with zero inaccessible, added, detached, mutated, or
unaccounted subjects. A continuous same-count replacement plant exits 2 on the mutation/revision ceiling; an
equal-count non-replacing twin exits 0. Requested/resolved/root theme identity and each walked subject's
computed `color-scheme` agree: Light has 363 light-polarity subjects, Mocha and default have 363 dark-polarity
subjects, and an unknown request is `INSTRUMENT ERROR`.

\#977 derives Snap, design-audit, and motion-audit's mobile choice from one shared full-device contract. The
live identity is requested/applied/actual iPhone 14 Pro Max, viewport and inner viewport 430x740, screen
430x932, coarse pointer, no hover, one touch point, DPR 3, mobile true, and zero mismatches. Normal and
reduced-motion fixture twins retain nonzero subjects and frames; the same 430x740 viewport without the device
fingerprint exits 2. A 100ms live run's two subjects/seven frames honestly classified the accepted #824
collapsible height animation; it is not a physical-device-jank finding, and #977 adds no matrix loop.

---

## 0. Method, and the three times my own instruments lied

Everything in the original census below was measured on the base session's tree and browser. Current-state
annotations are dated explicitly; unannotated counts remain base-`28d526c99` evidence. Three method notes belong
up front because they are the difference between a receipt and a guess.

**The environment was verified, not assumed.** `:5173`'s vite process started `Sun Aug 30 22:06:59 2026`;
HEAD committed `21:59:11`; the newest of the five CSS files last changed `21:32:32`. The server is NEWER than
every commit it serves, so the long-lived-vite corrupt-graph hazard does not apply and every rendered receipt
below is against the current source. My worktree's five CSS files are byte-identical to the main checkout
(`diff -q` ×5, all silent).

**I withdrew a control before using it.** My first planted probe was `packages/ui/src/primitives/__probe/zz-cbcss.css`.
`git check-ignore -v` returned `.gitignore:108 **/__probe*` — the path is gitignored, and a gitignored path
makes an fs-walking gate's verdict environment-dependent, so it was the wrong control. I deleted it and
re-planted at non-ignored paths. A control you cannot trust is worse than no control.

**Three of my own probes returned a clean-looking wrong answer, and all three were caught by cross-check:**

1. A luminance probe regexed `rgb(...)` out of `getComputedStyle().color`. Chromium returns `oklch(...)`
   verbatim, so every ratio came back `null` — a silent zero that reads exactly like "nothing to see".
   Fixed by painting each token to a 1×1 canvas and reading the PIXEL. (This is the repo's own recorded
   `oklch-kills-rgb-regex-probes` lesson; I re-derived it the hard way.)
2. A CSSOM probe searched `selectorText` for the literal `z-\(--z-sticky\)` and returned `null`, which
   would have supported a *wrong* conclusion ("Tailwind emitted no rule"). Chromium normalises the escape
   differently. A second probe that tokenised selectors the way `@orb/kit/dead-css` does proved the rule
   DOES exist. The corrected finding is stronger than the wrong one would have been.
3. I truncated my own dangling-variable sweep with `| head -60` and briefly concluded a real finding was
   absent. The full output had it two lines past the cut. Filter with the tool's flags, never a pipe.

**Historical instruments used:** full reads of all five files (3,169 lines, every line, no grep-hunting); a
comment-stripped selector extractor (312 style-rule selectors, 308 queryable) driven against **seven live
surfaces**; five targeted in-page computed-style probes; a canvas pixel-luminance probe; a node probe of the
house `cn()`; a repo-wide dangling-custom-property sweep; two planted gate controls (one caught, one not) run
through a full `pnpm check:structure`.

---

# PART 1 — FINDINGS

Ranked by consequence. Every one is reproduced or directly evidenced in this session.

---

## F1 (P2 — fixed and cold-confirmed as #937) — `data-density` did not reach portalled overlays, so compact users received comfortable overlay spacing

`packages/client/src/features/app-shell/surfaces/shell.css:80` · `packages/client/src/features/app-shell/surfaces/app-shell.tsx:249,385`

**Defect.** `[data-density="compact"]` re-points the four spacing intent tokens, and the shell stamps
`data-density` on `.shell-grid`. Every portalled overlay renders into `data-slot="portal-root"`, which is a
**SIBLING of `.shell-grid`** inside `<ThemeScope>` — outside the attribute's subtree. The tokens therefore
resolve at the `@theme` floor for the entire overlay layer.

**Failure scenario.** User sets Density → Compact. The app tightens. Every dialog, alert dialog, menu,
popover, select popup, tooltip and toast stays at comfortable spacing. The preference silently half-applies,
and the two halves sit on screen at once whenever a menu is open over a compact list.

**Evidence (measured, live, `/` at `--wide`, `--appearance '{"density":"compact"}'`, command modal open):**

```
gridDensityAttr: "compact"
grid:   { field: 0.25rem,  row: 0.375rem, block: 0.5rem,  section: 1rem   }   ← compact
dialog: { field: 0.375rem, row: 0.5rem,   block: 0.75rem, section: 1.5rem }   ← the @theme floor
scopeIsAncestorOfPortal: true      portalInsideGrid: false      scopeDensityAttr: null
```

`reports/stickler/scratch/cbcss-p3-compactmodal.log`. The `scope`/`portal` rows read identically to
`dialog`, so the gap begins at ThemeScope, not at the popup.

**Why `scopeDensityAttr` is null.** `ThemeScope` stamps `data-density` only from `clampThemeTokens`'s output
(`theme-scope.tsx:68`), and `resolveThemeScopeTokens` passes `tokens: {}` for a seed or absent theme
(`resolve-theme-scope-tokens.ts:52,56`). So the ThemeScope div carries the attribute **only when a CUSTOM
theme declares its own density** — never from the user's appearance preference.

**Law violated.** `shell.css:74`'s own text: *"Density: compact tightens the four spacing intent tokens
**app-wide**."* It does not.

**This is not new with the #866 hoist.** The old `.shell-grid[data-density="compact"]` had the identical
gap. #866 fixed the inert-stamper half and left this one.

**Precedent that this class is already recognised here:** `client/styles/globals.css:156-157` solves exactly
this shape for modals with a sibling combinator — `.shell-grid[data-has-bg-image] ~ [data-slot="portal-root"] [data-slot="dialog-popup"]` — and its comment says why: *"`DialogPopup` portals to the themed portal root,
which app-shell.tsx renders as a SIBLING of `.shell-grid` … a descendant selector matches nothing in the app."*
Someone paid for this lesson once, on one axis, and the density axis did not inherit it.

**Original safe remediation.** Stamp the resolved density on the element that is the
common ancestor of BOTH the grid and the portal root — `<ThemeScope>` already accepts one. `app-shell.tsx:151`
already computes `density`; today it reaches only `.shell-grid`. Passing the same value to `ThemeScope`
covers the whole tree with one write and no second source of truth. **Rendered receipt owed:** the same probe
above, asserting the dialog resolves 0.25/0.375/0.5/1rem under compact and the comfortable floor under
comfortable.

**Resolution (2026-08-31).** `c3fb373b2` passes the viewer's resolved density through the root ThemeScope,
whose grid and portal root are siblings, and removes the duplicate grid-only stamp. Cold review then found
card overrides could smuggle viewer-sacred density into nested ThemeScopes. `80eb7ca0c` projected every chat
attribution seam through `cardEmbeddableSubset`; a second cold review found greeting and hero/Own-look seams,
and `99e16df97` projected those shared boundaries too. Final cold verification accounted for all 10
ThemeScope mounts across 1,235 TS/TSX files, passed 42/42 focused unit/security tests, and reused byte-identical
serialized 3/3 rendered receipts. Palette/prose survives; density-only cards do not claim Own look; the only
unprojected paths are the trusted viewer-theme editor and card-owner Look authoring preview. #937 is closed;
\#935/#953 retain future consumer-provenance enforcement rather than overstating this current-path proof.

**Sibling-topology reconciliation (#960, closed 2026-08-31).** The same grid/portal sibling boundary also
split custom-theme colorization: the root token arm was provider-less, but the custom-theme override selected
only `.shell-grid`, so Dialog/Drawer descendants kept uncolorized scope values. `adc537db9` pairs grid and
portal-root descendants under one declaration-identical arm while retaining the provider-less root arm.
Independent technical review passed 20/20 focused structure/unit checks and serialized 3/3 Chromium; a
1,323-TSX AST census covered 53 ThemeScope, 29 DialogPopup, and 11 DrawerPopup mounts. Independent side-eye
confirmed real Dialog and You Drawer off→on→off values, same-node identity, nested-scope isolation,
selected-theme custom CSS following the token, and byte-identical seed behavior. #935/#953 must generalize
this from individual repaired axes into the complete Appearance carrier matrix.

---

## F2 (P2 — fixed and cold-confirmed as #938) — `[data-density]` was a one-way switch, so #866's live density preview was inert in one direction

`packages/client/src/features/app-shell/surfaces/shell.css:80-85` · `packages/client/src/features/app-shell/components/appearance-sizing-section.tsx:80-98`

**Defect.** There is a `[data-density="compact"]` rule and **no `[data-density="comfortable"]` rule**.
Custom properties inherit, so a descendant stamped `comfortable` inside a `compact` ancestor keeps the
compact values: the attribute cannot express "back to the floor".

**Failure scenario.** A user whose saved density is **compact** opens Configuration → Appearance → Sizing and
moves the Density segment to **Comfortable**. `DensityPreview` renders its box with
`data-density="comfortable"` (`appearance-sizing-section.tsx:85`) inside the compact shell grid. **The preview
does not change.** The whole point of #866 §7.8 — *"density carries the LIVE mini-preview reading the DRAFT
value"*, the owner-acked "seen, not read" rebuild — is dead in that direction. The comfortable→compact
direction works, which is exactly why it reads as working.

**Evidence (measured, live, with a positive control in the same run):**

```
gridDensityAttr: "compact"
grid                                              { field 0.25rem, row 0.375rem, block 0.5rem, section 1rem }
child[data-density=comfortable] INSIDE the grid   { field 0.25rem, row 0.375rem, block 0.5rem, section 1rem }  ← inert
child[data-density=compact]     INSIDE the grid   { field 0.25rem, row 0.375rem, block 0.5rem, section 1rem }
sibling[data-density=comfortable] OUTSIDE grid    { field 0.375rem, row 0.5rem, block 0.75rem, section 1.5rem } ← CONTROL: the rule exists and the probe works
sibling[data-density=compact]     OUTSIDE grid    { field 0.25rem, row 0.375rem, block 0.5rem, section 1rem }   ← CONTROL: compact resolves
```

`reports/stickler/scratch/cbcss-p6-compact.log` (synthetic elements appended, read, removed in one evaluate).

The preview's visible spacing IS driven by those four tokens — `p-block` (:84), `gap="row"` (:87), `p-field`
/ `gap="field"` (:90) — so the inertness is user-visible, not theoretical.

**Law touched.** `shell.css:75-79`: *"one definition, two consumers, zero mirrored numbers (the owner's
derive-never-mirror rider)."* The second consumer works in one direction only.

**Why the obvious fix is wrong, and what the fork is.** Adding `[data-density="comfortable"] { --spacing-field:
0.375rem; … }` would MIRROR four numbers out of `theme.css`, which is the exact thing the #866 rider forbids,
and would rot the moment a token moves. Two honest arms, both needing an owner call:

- **Arm A (recommended) — make the axis symmetric with a derived floor.** Introduce private aliases in
  `theme.css` (generated, so no mirroring): `--spacing-field-base` etc., have `@theme`'s
  `--spacing-field` read `var(--spacing-field-base)`, and let `[data-density="comfortable"]` restate the
  ALIAS rather than a literal. Cost: a generator change + a token-shape change; blast radius is the
  token vault, so it lands alone with a `tokens:build` regen and a full rendered pass.
- **Arm B — take the preview off the inheriting axis.** Have `DensityPreview` render its own two spacing
  values from the token map in TS (it is an ornament, `aria-hidden`), and drop the attribute from it. Cost:
  one component; but it re-introduces a second home for "what compact means", which is the thing #866
  ruled against.

**Owner ruling and resolution 2026-08-31: Arm A.** The axis is symmetric and derives both arms from the
canonical values; the preview stays on the real density contract. #938 waited for #936, then landed against
the new structured-value emitter at `f9dff3bb3`; it did not add indirection to the deprecated generator and
migrate it twice. Arm B remains rejected as a second preview-only definition. Cold detached verification
passed 232/232 rendered CT, 92/92 focused Vitest, 8/8 ownership-gate integration, both typecheck tiers, and
the 278-entry/187-target/19-`cssValues` contract.

---

## F3 (P2 — fixed and cold-confirmed as #939) — the chart ramp was not polarity-aware, so every chart series measured below the WCAG 1.4.11 3:1 floor on the Light seed

`packages/ui/src/styles/theme.css:47-51` (generated) ← `packages/ui/src/tokens/tokens.json` · consumers `packages/ui/src/charts/chart/use-chart-theme.ts:36,39`, `packages/ui/src/charts/bar-list/option.ts:27`, `packages/ui/src/charts/heatmap/option.ts:4`

**Defect.** `--color-chart-1..5` are single fixed values and the `[data-theme="light"]` block overrides none
of them. `--color-track-1..6` — the same categorical-fill problem, on the same surfaces — were converted to
`light-dark()` at #697 for precisely this reason. The chart ramp never got the treatment.

**Evidence (measured on the Light seed by canvas pixel read; the track ramp is the positive control):**

| token | sRGB | vs `--color-card` | vs `--color-surface-raised` | vs `--color-sidebar` |
| - | - | - | - | - |
| chart-1 | 247,127,32 | **2.58** | **2.37** | **2.29** |
| chart-2 | 64,177,183 | **2.53** | **2.31** | **2.24** |
| chart-3 | 164,134,215 | **2.97** | **2.72** | **2.64** |
| chart-4 | 148,185,109 | **2.20** | **2.01** | **1.95** |
| chart-5 | 222,130,106 | **2.76** | **2.53** | **2.45** |
| track-1 | 49,127,56 | 4.90 | 4.49 | 4.35 |
| track-2 | 56,116,173 | 4.85 | 4.44 | 4.30 |
| track-3 | 137,108,5 | 4.91 | 4.50 | 4.36 |
| track-4 | 136,93,167 | 4.96 | 4.55 | 4.40 |
| track-5 | 176,84,87 | 4.87 | 4.46 | 4.32 |
| track-6 | 5,125,130 | 4.86 | 4.45 | 4.31 |

`reports/stickler/scratch/cbcss-p8-light.log` (`snap / --wide --theme Light`; surfaces measured
card `255,253,251`, surface-raised `245,243,240`, sidebar `243,239,236`).

**Every chart step fails 3:1 against all three light chrome surfaces. Every track step clears it.** The
1.95–2.97 band is the same band #697's own note records for the track ramp before its fix
(*"at mid-L these steps rendered 1.89–2.65:1 against the LIGHT panel (sidebar/surface-raised)"* — `tokens.json:174`).

**Declared limit.** I measured the TOKENS against the palette's own chrome surfaces, not a rendered chart on
a specific backing. Whether a given chart paints its series over `card` or over `background` is per-chart. But
all three light surfaces fail, and #697 accepted exactly this framing as sufficient for the sibling ramp, so
the asymmetry is the finding and the fix is already ratified in kind.

**Safe remediation.** Give `color.chart-1..5` the same `light-dark(<light-arm>, <dark-arm>)` shape
`color.track-*` carries, dark arm byte-identical (the sacred dark rooms do not move, D144(d)), light arm
darkened to clear 3:1 against sidebar/surface-raised. Edit `tokens.json`, run
`pnpm --filter @orb/ui tokens:build`. **Regression pin:** extend
`tests/ui/content/theme-scope/palette-contrast.suite.test.ts` — it already sweeps every value-set per
polarity, so the chart ramp joins the sweep it should always have been in.

**Resolution (2026-08-31).** #939 landed on main as `c45d39ac7` plus the CT typing follow-up
`fd31bf645`. The static seed ramp now emits polarity-aware `light-dark()` values with byte-identical dark
arms, while a carried custom ThemeScope derives five concrete fills against its actual composited
base/card/raised/sidebar hosts instead of inheriting a seed arm across the polarity pivot. The boundary
rejects contextual/system/CSS-wide colours only where deterministic derivation is required, retains the
general safe-colour contract elsewhere, and preserves valid sibling overrides when one field is dropped.
Cold verification confirmed 55/55 focused Vitest and 7/7 rendered CT: five distinct real ECharts fills,
five canvas-pixel matches, zero unresolved values, and minimum contrast at least 3:1. The permanent matrix
now covers every seed/polarity host plus accepted named/numeric/alpha/extreme-gamut custom inputs and carries
its own planted failing chart colour. #939 is closed; the grouped CSS-train barrier remains the one shared
repo-wide pass.

---

## F4 (P2 — fixed and cold-confirmed as #940) — `z-(--z-sticky)` named a token that did not exist, so the modals' sticky header shipped with `z-index: auto`; and `no-raw-z-index` advertised names the theme never defined

`packages/client/src/features/app-shell/components/modal-host.tsx:73` · `packages/client/src/features/chat/lib/message-row-backing.ts:222` (cites it as "the house recipe") · `tooling/src/verify/gates/no-raw-z-index.ts:48`

**Defect.** `theme.css:167-173` defines exactly seven z tokens: `base · raised · overlay · modal · popover ·
toast · tooltip`. There is no `--z-sticky` and no `--z-dropdown`. `modal-host.tsx:73` writes
`z-(--z-sticky)`; Tailwind dutifully emits `.z-\(--z-sticky\) { z-index: var(--z-sticky) }`; the property is
never defined, so the `var()` substitution is invalid at computed-value time and **the entire declaration is
dropped.**

**Failure scenario.** Every house modal's sticky header (`.shell-modal-header`, `sticky top-0`, the "You"
sheet / settings / any `ModalHost` consumer) establishes no stacking order. It is opaque (`bg-card`), which
is what has hidden this — but any positioned descendant in the modal body with a z-index paints over the
header as the body scrolls under it, and the header cannot win because it has no z-index to win with.

**Evidence (live, modal open, with a positive control in the same evaluate):**

```
modalHeaderFound:   true
modalHeaderClass:   "shell-modal-header sticky top-0 z-(--z-sticky) shrink-0 bg-card"
modalHeaderPosition: "sticky"
modalHeaderZ:        "auto"            ← the declaration is void
CONTROL  z-(--z-raised) resolves to:  "10"   ← the arbitrary-variable SYNTAX is fine; the TOKEN is missing
scrimZ: "39"
```

`reports/stickler/scratch/cbcss-p9-sticky.log`.

**Repo-wide sweep — this is the only instance.** A dangling-custom-property sweep over
`packages/{ui,client}/src` (1,590 files, 230 definitions, 196 references) returns 23 unmatched references.
Twenty-two are legitimate: Base UI's own runtime-set properties (`--anchor-width`, `--available-height/width`,
`--collapsible-panel-height`, `--accordion-panel-height`, `--drawer-*`, `--toast-swipe-movement-*`,
`--active-tab-*`, `--transform-origin`), deliberate `var()` FALLBACK seams documented in the CSS
(`--font-scale`, `--orb-skeleton-sweep-base/-crest`), two mock-CSS quotations inside comments (`--raised`,
`--fg` in `context-rail.tsx`) and three regex artifacts from template-literal prefixes. **`--z-sticky` is the
one real hit.** The session scratch output previously cited here is absent from the workspace, Git index,
and path history; the counts are retained as census evidence, not as a reusable artifact.

**The second half is the gate's.** `no-raw-z-index.ts:48`'s message reads: *"use a semantic z-index token
(z-modal, z-popover, z-tooltip, z-overlay, z-toast, **z-dropdown, z-sticky**)."* Two of the seven names it
advertises have never existed. The gate bans a raw `z-N`; it does not check that the token you substitute
resolves. An author following the gate's own advice lands this defect — which is what happened.

**Safe remediation.** Either mint `z.sticky` in `tokens.json` (with a `$description` stating where it sits in
the stack) and regenerate, or repoint `modal-host.tsx:73` to `z-(--z-raised)` and correct
`message-row-backing.ts:222`'s comment. **Either way, correct the gate message so it names only tokens that
exist**, and see G-NEW-2 in the game plan for the gate that makes this class impossible.

**Resolution (2026-08-31).** Current precedent proved `z.raised` is already the sticky in-surface chrome
stratum, so #940 rejected a duplicate token and repointed ModalHost in `20d810344`. The same commit corrected
the coupled comment and made `no-raw-z-index` reject unknown semantic z variables and set-equality check its
seven recommendations against the live vault. Cold review then found exported class recipes escaped the
carrier fence; `a8a60ce20` widened the self-identifying `z-(--z-*)` arm to all production string literals
while preserving the narrower ambiguity fence for raw numeric utilities. Independent cold verification
confirmed 6 red/5 green controls, 7/7 vault parity, a nonzero 812-TS/770-TSX inventory, and a reporter-active
2/2 CT proving computed `z-index: 10`, real overlap, and hit-test victory. #940 is closed.

---

## F5 (P2 — doc) — `client-architecture-lockdown.md` §4, the authoritative paint law, justifies its central exception with a mechanism the code documents as DELETED

`docs/architecture/core/client-architecture-lockdown.md:105` and `:107`

This is the finding that changes the reconciliation, and it inverts the premise I was dispatched with.

**§4:105 (the WHY that grants shell.css its exception) currently reads:**

> **WHY shell.css is the exception (the owner ruling, verified against the file):** it is a LAYOUT ENGINE, not
> skinnable values — `grid-template-columns: var(--rail-w) var(--list-track) minmax(0,1fr) var(--context-track)`
> with `transition: grid-template-columns var(--shell-motion) var(--shell-ease)` (an ANIMATED dynamic-track
> grid), the collapse/overlay zero-width track math, the co-motion vars `--shell-motion`/`--shell-ease` (grid +
> panel slide + dismiss scrim MUST share one duration/curve or they shear — `shell.css:12-13,18,249,341,394`),
> the mobile single-column collapse (`:361`), specificity-ordered elevation ramps.

**Every cited anchor is dead:**

- `transition: grid-template-columns …` **does not exist.** `shell.css:21-22` says so explicitly: *"NO
  `transition: grid-template-columns` here — see 'THE PANEL PUSH IS A FLIP' below. The track resizes in ONE
  frame and the visible motion is a compositor-only counter-translate."* It was removed because transitioning
  a layout property scored 0.2774 of layout instability on a single panel dock (measured, `shell.css:215-233`).
- `shell.css:12-13` is `--list-track: 0px; --context-track: 0px;` — the co-motion vars are at `:15-16`.
- `:249` is prose inside a comment. `:341` is prose inside a comment. `:394` is `flex: 1 1 auto` on
  `.shell-rail-spacer`. `:361` (cited as "the mobile single-column collapse") is
  `inset-block: var(--spacing-field)` — the mobile `@media` is at `:982`.

**Why this is worse than a stale line number.** A law's justification citing a deleted mechanism means the
reason we grant the exception is no longer the reason the exception is right. A cold agent who checks the
citation finds nothing, and the honest conclusions available to it are "this law is dead" or "shell.css should
be simplified because its stated purpose is gone" — the latter would delete the FLIP.

**The current, re-derived WHY is different in kind, and stronger.** shell.css is not an *animated grid*; it is
a **layout ALGEBRA plus a compositor-only motion mechanism that exists specifically to keep layout out of the
animation**. Its irreducible content today:

- the four-track grid whose track widths are computed CSS (`--pane-deficit`, `--pane-squeeze-list-share`,
  `--both-docked-list-track`, `--content-primacy-deficit` — `shell.css:181-203`), including a
  `--content-primacy-deficit` **rendered as an element's inline-size so JS can observe real CSS resolution
  without duplicating it** (`:205-213`, read by `useShellLayout`). No token can express that; no `tv()`
  variant can either. It is arithmetic over the viewport, and CSS is the only place it can run.
- the FLIP: three `@keyframes` + the attribute grammar that makes a 272px track resize score ZERO recorded
  layout shift (`:215-277`), and its reduced-motion twin that holds the same corner statically (`:279-304`).
- the co-motion vars `--shell-motion`/`--shell-ease`, read by the track animation, the panel slide and the
  dismiss scrim so they cannot desync (`:15-16`, `:270`, `:487`, `:964`).
- the ONE viewport `@media` that reflows the same DOM into a bottom tab bar (`:982`).
- specificity-ordered elevation, using `:where()` to zero attribute specificity so later glass and
  bg-image rules win on their own merits (`:88-117`).

**Replacement text is in PART 6 §C-1.** The exception survives; its stated condition changed. (House idiom:
*the ruling survives — its INPUT changed.*)

**§4:107's RECONCILIATION paragraph is stale in both halves:** it says
`features/settings/surfaces/settings-shell.css` *"exists today"* (it does not — `git ls-files '*.css'` returns
exactly five authored files plus `playwright/index.css`) and asks someone to *"amend the north-star phrasing on
promotion"* (already done — see F6).

---

## F6 (P3 — premise refuted) — the north-star's rule 2 is NOT stale; §4 is. Two other live docs already carry the current truth

**I was dispatched with: "`ui-cohesion-north-star.md` §0 rule 2 is KNOWN-STALE … That is an outstanding TODO
sitting inside live law. Close it." It is already closed.**

`docs/architecture/proposed/ui-cohesion-north-star.md:94-98` reads, today:

> 2. **Hand-written CSS is legal in exactly ONE file:** `client/src/features/app-shell/surfaces/shell.css`
>    (the shell tier, the one sanctioned painter). … **(This is the FEATURE-tier rule; the reconciled
>    whole-repo CSS-homes table — including the styles-tier hand-written files — is
>    `client-architecture-lockdown.md` §4. `settings-shell.css` dissolved at M6.3.)**

Both amendments §4 asks for are present. `Core-Enforcement-Active-Gates.md:198` independently agrees:
*"`settings-shell.css` was the last offender, dissolved into `client/styles/globals.css` at M6.3."*

**The real finding underneath.** `ui-cohesion-north-star.md` carries `status: active` in its own frontmatter
while `docs/architecture/proposed/INDEX.md:37` lists it as **SUPERSEDED**. A doc that is simultaneously active
and superseded is a doc nobody can cite safely — and this one is cited by D66 as the UI program. That
contradiction is a live-law defect in its own right. See PART 6 §C-4.

---

## F7 (P3 — product fix and prevention integrated as #954/#961) — the `birdie` arm of the `dark` custom-variant was dead and the enforcing test was one-directional

`packages/ui/src/styles/globals.css:69-71`

**Defect.** The line reads:

```css
@custom-variant dark (&:not([data-theme="light"], [data-theme="light"] *, [data-theme="birdie"], [data-theme="birdie"] *));
```

and its comment says the exclusion list is *"currently `light` and `birdie` (the default-character pack's one
daylight palette)"*.

**`birdie` is gone.** `packages/ui/src/tokens/themes/` contains exactly `light.json` and `mocha.json`.
`git log --name-status` shows `birdie.json` and nine sibling character-pack palettes **deleted at
`68ee9389f`** ("feat(theme): the theme doors — promote/seed-from, the card-embeddable partition, curated
picker"). `theme.css` generates blocks only for `light` and `mocha`. Nothing in the tree can stamp
`data-theme="birdie"`: `appearance-boot-hint.ts:80-81` states *"The `[data-theme]` names the ui package
actually generates a palette block for — anything else stamps nothing"*, derived from
`Object.keys(SEED_THEME_VALUE_SETS)`.

**Why no gate caught it.** `tests/ui/styles/css-structure.suite.test.ts:93-101` asserts that every LIGHT seed
value-set appears in the variant line. It does not assert the converse — that every name in the variant line
is a live seed. The rule is one-directional, so a name can outlive its palette forever.

**The latent half, which matters more than the dead arm.** The `dark` variant is enumerated over
`[data-theme]` NAMES. A **custom** theme sets no `data-theme` at all — `live-token-resolver.ts:12-13`:
*"a CUSTOM theme sets no `[data-theme]` at all — its palette rides `<ThemeScope>`'s INLINE custom properties."*
So a user-authored LIGHT palette matches the `:not(...)` and every `dark:` utility would resolve as DARK on it,
while `light-dark()` tokens on the same page correctly resolve LIGHT (the clamp derives `color-scheme` from the
base's L — `clamp.ts:188 colorSchemeFor`). **Two polarity mechanisms that can disagree.**

**Consequence today: zero.** There are **no `dark:` utilities in the tree.** Positive control in the same
sweep: 31 files contain `hover:`; `dark:` returns four hits, all non-utilities (a JS object key in
`code-editor.tsx:99`, the token name `--color-sky-cloud-dark`, the comment itself, and a shiki theme key).
The variant is a floor with no consumers.

**Recommendation (pre-launch, no-legacy):** **DELETE the `@custom-variant dark` line.** The house has ONE
polarity mechanism — `light-dark()` selected by `color-scheme`, which the clamp derives for every palette
including customs — and a second mechanism keyed on an enumerated attribute is structurally unable to agree
with it. Keeping an unused, unfixable second mechanism is the "leave the old one beside the new" shape the
constitution bans. Doctrine clause + enforcement in PART 4 §4.6 and PART 5 step 2.4.

**Implementation reconciliation (2026-08-31).** `214fa1200` deleted the product variant and preserved the
single `color-scheme`/`light-dark()` runtime path; exact ThemeScope CT passed 26/26. Cold verification refused
the prevention claim: the first gate caught only 3/10 live carrier shapes, missed aliased/member composers,
local and cross-file values, arrays/objects/templates, and incorrectly declared incremental safety. #954 is
therefore still open. The rejected replacement also exposed a packaging error: a 1,191-line TypeScript
expression interpreter was hidden inside one polarity rule whose live finding population is zero. That
interpreter is justified only as shared infrastructure for #951/#949/#955/#956, so #961 owns one
policy-neutral static-class provenance substrate, split below the tooling file-length wall with no blanket
lint suppressions. `397e805f5` landed that substrate, but frontier cold review refuted it on three P1
semantics: a wrapper returning unrelated prose inherits composer authority; a namespace import through a
local re-export disappears with zero opaque/unresolved accounting; and object spread evaluation returns
overwritten or stale values instead of respecting later-spread uncertainty. The report is
`2026-08-31-961-static-class-provenance.md`. `0952cc462` repaired all three from planted reds: composer
wrappers require return-position ownership, local namespace re-exports resolve, and object spreads use
last-write-wins with honest opacity for unknown overwrites. The focused suite is 17/17 and the real
ContextToggle plus `data-has-bg-image` probes remain exact. `6740e6705` makes #954 a thin Oxide-tokenizing
consumer with 13 red/5 green contract controls and 4 focused integration tests; all 22 focused arms pass on
the integrated substrate. #951/#954/#961 now wait together for the grouped CSS-train review/barrier. Live #951
integration added one bounded neutral surface to that announced contract: an exact object-property query
over JSX/object spreads, so selector-writer gates can resolve spread-supplied `data-*` properties without
misclassifying their values as class tokens or building a second resolver. The substrate must use
whole-project declaration provenance and may tokenize with Oxide only after semantic carrier resolution;
raw-source Oxide scanning also tokenizes prose and is not a correctness gate. #951/#954/#961 passed the
grouped barrier in the 242/242 structural graduation receipt.

**Selector-writer closure (#956, grouped barrier passed).** `5a9a9ada3` turns the census's manually traced
68 authored non-utility class identities and 112 data-selector identities into a dedicated semantic gate.
Writers come from JSX attributes/spreads, declaration-proven DOM `setAttribute`/`toggleAttribute`, exact
HAST element properties, #951/#961 class provenance, manifest-plus-installed Base UI state/value contracts,
and a two-way Streamdown contract. Exact-value selectors require matching static/type-literal evidence; an
arbitrary nonempty writer does not satisfy them, and mutating that rule makes the permanent `birdie` control
fail. Focused proof is 18/18 with tooling ts7, scoped Biome, and loader discovery at 240 active gates at
integration. #965 subsequently moved the collector onto the existing shared visit and profiled the real tree
at 1,195 owners, 1,583 sources, 1,745 evaluators, 68,517 dispatched nodes, 2,331 root evaluations, 19.3s wall,
and 3.48 GB max RSS; 42/42 focused tests passed. The grouped 242/242 barrier passed.

---

## F8 (P2 — enforcement, corrected 2026-08-31) — the merge test proves its configured rows, not the complete Tailwind compiler-emitted namespace set

`tests/ui/lib/class-merge.test.ts:106-107` · `packages/ui/src/lib/class-merge.ts:78-84`

**Defect.** The pin's docstring reads:

> One row per REGISTERED namespace; **a namespace registered without a row here is caught by the count
> assertion in the completeness test below**, so a new registration cannot land unproven.

There is no count assertion. The only `.length` expectation in the file is `tokens.length > 0` (`:120`), a
per-row non-emptiness guard. Nothing binds `REGISTERED_NAMESPACES` to `class-merge.ts`'s `THEME`/`CLASS_GROUPS`
keys in either direction.

This is the constitution's own *"a prose-only boundary is not a placement — it's a wish"* (§2.3), inside the
file whose entire reason for existing is that an unregistered namespace fails silently.

**The original probe correctly found missing merge behavior but overclaimed which token prefixes produce
named utilities.** Exact Tailwind 4.3.3 compilation over the generated theme is the authority, not a guess
from custom-property names. It produced named utilities for 14 families: color, spacing, radius, aspect,
shadow, blur, border width, font family, text size, leading, tracking, container, width, and easing.
`aspect`, `blur`, and `ease` are the three compiler-positive families the current merger misses.

Measured with the real `cn()` and exact compiler candidates:

```
OK (last wins)                     spacing/gap        cn("gap-block","gap-tight")            => "gap-tight"
OK (last wins)                     radius             cn("rounded-card","rounded-inset")     => "rounded-inset"
OK (last wins)                     container/max-w    cn("max-w-cq-sm","max-w-cq-lg")        => "max-w-cq-lg"
OK (last wins)                     width/w            cn("w-dialog-sm","w-dialog-lg")        => "w-dialog-lg"
OK (last wins)                     type size          cn("text-title","text-body")           => "text-body"
OK (last wins)                     leading            cn("leading-title","leading-body")     => "leading-body"
OK (both survive, as intended)     colour vs size     cn("text-title","text-muted-foreground") => both
OK (last wins)                     colour vs colour   cn("text-muted-foreground","text-foreground") => "text-foreground"
OK (last wins)                     shadow             cn("shadow-overlay","shadow-glow")     => "shadow-glow"
OK (last wins)                     font               cn("font-sans","font-mono")            => "font-mono"
!! BOTH SURVIVED — order-dependent  aspect            cn("aspect-portrait","aspect-banner")       => both
!! BOTH SURVIVED — order-dependent  blur              cn("blur-strength","blur-fill-chrome")     => both
!! BOTH SURVIVED — order-dependent  easing            cn("ease-out-expo","ease-linear")           => both
```

(The `tracking` row in my probe compared a class with itself — a bad test row of mine, not a finding.)

**The registered namespaces all resolve correctly — the controls pass.** Six probed prefixes — `dimension`,
`immersive`, `reading`, `fade`, `z`, and `motion` — emit no named utilities in Tailwind 4.3.3 and must not be
registered merely because a token prefix exists. The valid arbitrary-variable forms such as
`w-(--dimension-rail)` and `z-(--z-raised)` already merge through Tailwind's core groups. The original
recommendation to register bare dimension/z was false and is withdrawn.

**Live exposure today is small and I checked it rather than assuming.** `aspect-portrait` appears at three
call sites (`media-tile-grid/variants.ts:39`, `avatar/variants.ts:36,49`) and `aspect-banner` only as an inline
`aspectRatio: var(--aspect-banner)`, so no aspect-vs-aspect stack exists yet. Blur/easing need the same live-
usage review when the fix lands. The important prevention claim is broader: a token-name inventory cannot
tell us whether Tailwind emits a utility family.

**Resolution (#949 integrated; grouped barrier passed).** Orb now registers only aspect/blur/ease, derives the governed
set from stable Tailwind compilation plus production Oxide roots, disables TV's internal merge, and routes
ordinary and slot results through the sole configured Orb merger. The bounded dev/test `__orb.css` receipt
uses occurrence-aware replay through that exact merger; it does not copy tailwind-merge's classifier. Focused
proof passed 7/7 compiler parity, 107/107 merge/token tests, 65/65 dependency-cruiser tests, 42/42 Button and
Avatar CT, and a 3,409-module production build with no trace implementation strings. The grouped 242/242
barrier passed.

**Historical remediation prescription.** Register only aspect/blur/ease, then plant a compiler-derived positive/negative matrix
for the exact pinned Tailwind version. Assert set equality between compiler-positive custom families, the
Orb merger configuration, and the per-family later-wins controls. A new token prefix joins only when the
compiler proves its actual utility surface; a Tailwind upgrade must re-prove the matrix.

---

## F9 (P3 — historical enforcement gap; #921 closed) — the old feature-only proxy and its two filesystem bypasses are gone

`tooling/src/verify/gates/feature-css-files.ts:16`

**Defect.** §4's table is introduced as *"The full sanctioned-CSS-homes list — anything not on it is RED."*
The gate that would make that true scans `packages/client/src/features/**/*.css` and nothing else.

**Evidence — both directions, one full `pnpm check:structure` run (exit 1, `scanned 6281/6281`):**

- **CAUGHT:** `packages/client/src/features/chat/zz-cbcss-probe.css` →
  `✗ feature-css-files (1)` *"a `.css` file under features/*\* outside the §4 sanctioned allowlist"\*, plus a
  bonus `client-structure` stray-file RED. The gate bites where it claims to.
- **NOT CAUGHT:** `packages/ui/src/primitives/zz-cbcss-probe.css` → **zero findings from the entire
  structure battery.** `pnpm exec biome check` on it: *"Checked 1 file … No fixes applied."*

Both probes were removed; `git status --short` is empty.

**So a new hand-written stylesheet anywhere in `packages/ui/src/**` or in `packages/client/src/{components,
routes,lib,state,styles}/**` lands with no enforcement at all** — `no-raw-color-in-css` and
`motion-token-purity` would read it, but only for colour and motion literals; nothing objects to its
existence.

**Original remediation shape (landed at `9b0e6debb`, 2026-08-31).** Encode the
**TABLE as a closed set of literal paths**, not a directory glob. A glob is a proxy for the rule; the list of
six is the rule. The closed-set form also gets a stale-arm for free — a listed path that stops existing REDs —
which is exactly how the retired `feature-css-files` handled its own allowlist row. Commit `9b0e6debb`
deleted that gate and introduced `sanctioned-css-homes` with the six literal paths, package-wide CSS scan,
missing-home arm, and planted extra-file controls.

**Cold verification refuted completion before lifecycle close.** Two unsupported filesystem shapes remained:

1. Required homes use existence rather than regular-file identity, so replacing any required `.css` or
   `tokens.json` path with a directory reports clean.
2. The package CSS glob uses dot-skipping defaults, so `.extra.css` and `.hidden/extra.css` paths escape.

**Follow-up landed at `fee25f89b` (2026-08-31).** The gate now walks the package trees itself so dotfiles and
dot-directories are inventory members, excludes only the exact generated `dist` and `node_modules`
directories, and requires every sanctioned home to be a regular file. Permanent controls plant both escaped
dot-path shapes and a directory at a required path; the full gate-conformance suite passed 8/8. The legacy
ignored `.ds-preview-*` CSS/font bundle that the repaired inventory exposed was deleted rather than granted a
seventh home.

**Cold verification confirmed the combined train and #921 closed on 2026-08-31.** Focused conformance passed
6 `mustFlag` and 3 `mustPass` arms; independent probes exercised every required home as missing and as a
directory, both former `.ds-preview-*` locations, package-root and approved-root extras, dot paths, and exact
versus near generated-directory names. The original feature-only and first-review failure evidence above is
retained as history; neither describes HEAD after `fee25f89b`.

---

## F10 (P3) — nobody asks whether a resolved rule's VALUE resolves, or which of two resolved classes won; the two dead-class instruments are correct and structurally cannot answer either

`tooling/src/snap/ops/dead-css.ts` · `packages/client/src/lib/motion-dead-class-flagger.ts` · `packages/kit/src/dead-css/index.ts`

The orchestrator asked me to verify this characterisation by probing rather than by reading. I did, and the
result is sharper than either of our priors.

**What the pair actually covers, verified in-page.** I re-implemented snap's scan faithfully inside the live
page with the modal open (same tokenizer regex `\.((?:\\.|[A-Za-z0-9_-])+)`, same marker tables, same
visibility predicate) and asked it directly about the F4 defect:

```
modalOpen: true      headerIsVisibleToTheScan: true      headerInsideAriaHiddenOrInert: false
zStickyInUsedVisible: true       zStickyInUsedAll: true
zStickyInDefined:     true       zRaisedInDefined: true
deadVisibleCount: 0    deadAllCount: 0
```

…and the same snap run reported `deadcss=0 emptycss=0` on its RESULT line.

**Both instruments are RIGHT.** Tailwind DID emit `.z-\(--z-sticky\) { z-index: var(--z-sticky) }`, so the
class is not dead (mode 1 correctly clean) and the rule has one declaration, so it is not empty (mode 2
correctly clean). The page is genuinely clean by both definitions. **And the pixel is still wrong** — the
header computes `z-index: auto`.

**So the uncovered question is a third one, and it has two shapes:**

| # | question | who asks it | live instance found |
| - | - | - | - |
| 1 | does this class resolve to a rule? | `deadcss` + the `[css]` flagger | (none) |
| 2 | did every declaration in that rule survive parsing? | `emptycss` | (none) |
| 3a | **does the rule's VALUE resolve, or is the declaration voided by an undefined `var()`?** | **nobody** | **F4 — `z-(--z-sticky)`** |
| 3b | **which of two resolved, valid classes won the merge?** | **nobody** | four latent axes (F8) |

3a and 3b are the same family: the class resolved, the outcome is wrong. The emitted class string is not the
truth; the resolved computed style is.

**Enforcement answer, split by cost.** They do NOT need the same tier:

- **3a is STATIC and cheap.** Every `var(--x)` in the six homes, and every `<util>-(--x)` arbitrary-variable
  class in `packages/{ui,client}/src`, must name a property that is DEFINED — by the generated token map, by
  an authored CSS declaration, by a documented `var(--x, fallback)`, or by a declared allowlist of
  library-set runtime properties. The original session prototype took 1,590 files, returned 23 candidates
  and one real hit, but its claimed scratch file is absent from the workspace, Git index, and path history.
  \#952 rebuilt the implementation from current source. The committed Base UI v1.7.0 API tables declare
  43 unique properties across 17 components; an independent 1,594-source-file intersection finds exactly 13
  used by Orb today: accordion panel height, active-tab left/width, anchor width, available height/width,
  collapsible panel height, drawer snap/swipe x/y, toast swipe x/y, and transform origin. Cross-check those
  tables against exact installed `@base-ui/react@1.7.0` source/types and exact reference sites; example-local
  variables are not vendor ownership. `681d38afb` now enforces the contract over 1,587 sources, 225
  definitions, and 751 references; derives 49 Base UI docs, 43 properties, 13 live properties, and 19
  executable memberships; and stale-arms six exact CSSProperties-backed runtime writers by property and
  producer path. Focused conformance, the real-tree gate, TypeScript, Biome, ESLint, and dependency-cruiser
  are green; the grouped CSS-train barrier remains deferred by policy. **This gate would have caught F4 at
  authoring time.**
- **3b has two tiers.** The class-merge decision is recoverable without a browser: after disabling TV's
  earlier merge, record one ordered input at Orb's `cn()` and use occurrence-aware suffix/pair replay through
  that exact configured merger to identify loser/winner chains (F13). The namespace contract is compiler-
  derived per F8. The **final cascade** still needs a browser because a valid merged utility can lose to an
  unlayered rule, specificity, source order, inline style, inheritance, or custom-property resolution. That
  second tier is a bounded browser/CT computed-and-matched-style matrix, not an assertion at every call site.
  \#950's architecture is now proven: a revision-matched official DevTools frontend SDK reports
  `CSSMatchedStyles.propertyState` as `Active`/`Overloaded`. Raw-CDP inference, mutation, UI scraping, and a
  local cascade evaluator are rejected. #950 graduated the grouped CSS train; #975 subsequently made a null
  SDK classification a skipped row rather than a mislabeled declaration while keeping an ordinary zero
  classified-declaration population fail loud.

**The flagger's own audit (asked for specifically):**

- **It is DEV-ONLY** (`motion-dead-class-flagger.ts:1`, the `[css]` arm of the dev-only motion flagger pack).
  So it protects the developer loop, not the shipped build. A prod-only regression in this class has no
  watcher at all. That boundary belongs written down — doctrine §4.7.
- **Its confirm-before-report contract is live and exercised in both directions.** `:174` states the rule
  (*"a miss against the cache is a CANDIDATE, never a finding: one fresh CSSOM read confirms it"*) and
  `:179 confirmDead` is the function that does it, called from `:209 scanBatch`. The #852 fix (a cached
  `defined` set could flag a LIVE class while Base UI's React-19-hoisted `<style precedence>` rules landed
  mid-drain) has permanent late-defined-silent and never-defined-reported CT controls. The initial
  `motionFlaggersSettled()` promise is the first-drain barrier; #953 must await it before its first checkpoint
  and then reset checkpoint evidence. Only styles injected after that settlement require a new per-drain
  marker/barrier.
- **Nothing consumes its output as a verdict.** It reports through the shared console ring. snap captures
  console and its verdict posture is `console-errors` (always red) with warnings red only under
  `--strict-console`; a `[css]` line is a warning. So it is the third category exactly: **neither enforced nor
  absent — reported and unread by every floor.** Doctrine §4.7 names that category.
- **The architecture is the positive example and should be cited as such.** `@orb/kit/dead-css` owns the
  definition — `CLASS_SELECTOR_TOKEN_PATTERN`, `CLASS_TOKEN_ESCAPE_PATTERN`, `DEAD_CSS_MARKER_EXACT`,
  `DEAD_CSS_MARKER_PREFIXES` — and its two consumers differ only on the DOM half. snap serialises the regex
  SOURCE into the page (`dead-css.ts:49`) rather than re-typing it, with a comment naming that hand-copy as
  *"the one thing most likely to drift."* Two definitions would file two bugs; there is one.

---

## F11 (P4) — three comments state a mechanism that is off by one element or names a deleted thing

All three are the D141 class the census was commissioned to find. None changes behaviour; all three would
mis-teach the next reader.

**(a) `packages/client/src/styles/globals.css:461-463`** — *"ThemeScope (app-shell.tsx) declares
`--color-border` inline **on `.shell-grid`**, which would shadow an html-only override for every descendant."*
ThemeScope declares its inline vars on **its own div** (`data-slot="theme-scope"`), which is an ANCESTOR of
`.shell-grid` — and it declares nothing at all unless a CUSTOM theme is active. Measured live under the Light
seed with colorization on: `scopeInlineStyle: ""`, `scopeHasInlineBorder: false`, `gridHasInlineBorder: false`,
`gridInlineStyle: "--width-shell-content: clamp(680px, 60dvw, 100dvw);"`, `scopeIsAncestorOfGrid: true`
(`reports/stickler/scratch/cbcss-p7-light.log`). **The duplicated rule is still REQUIRED** —
`THEME_SCOPE_EMIT_VARS` includes `--color-border` and `--color-sidebar-border` (`clamp.ts:142-143`), so a
custom theme's inline value on the ancestor would beat an html-level rule for the whole subtree. The code is
right; the sentence names the wrong element and omits the condition. The correct anatomy is already stated one
file over at `live-token-resolver.ts:12-13`.

**(b) `packages/client/src/features/app-shell/surfaces/shell.css:463`** — the `.shell-panel`
`container-type` note ends *"Body descendants are unaffected — the region container is nearer, and so is
`.ctx-tab-strip`."* `.ctx-tab-strip` was deleted by #860 **today** (`shell.css:609-613` is its tombstone) and
has no rule anywhere in the tree. **The argument survives**: `RegionAnchor` wraps every region body in a named
`<Container name={region}>` (`region-anchor.tsx:24`), and a named container still serves unnamed
`@container` queries — so one nearer container remains. Only the example is dead.

**(c) `playwright/index.css:16`** (adjacent scope, the CT harness partner of the five) — its stated reason for
importing shell.css is *"e.g. the CONTEXT tab strip's `.ctx-tab-strip` @container label-collapse
(context-tabs-panel.tsx). Without it a shell-component CT shows a DIFFERENT strip than prod (labels never
collapse)."* Same deletion. The IMPORT is still correct — shell.css carries plenty of live chrome and the
bundle-order argument in the paragraph above it stands — but the cited justification is gone, and
`context-tabs-panel.tsx:13`'s own header already says so (*"`.ctx-tab-strip` are gone"*).

**Also noted for the #860 residue sweep, not a defect:**
`tooling/src/verify/gates/context-definition-shape.ts:37` still lists `ctx-tab-strip` in
`SHELL_CHROME_CLASSES`. It bans a feature from painting a class that no longer has a rule — harmless, and its
conformance fixtures still pass, but it is a coupled site whenever #860's residue is swept.

**Resolution (2026-08-31).** #957 graduated the grouped CSS barrier. Commit `aa8cf0d53` corrected the ThemeScope
carrier anatomy, removed the deleted `.ctx-tab-strip` guidance from shell and Playwright, and reconciled the
coupled gate residue. No current code comment should be inferred from the historical examples above.

---

## F12 (P1, added 2026-08-31; fixed and frontier-confirmed as #936) — the value vault was DTCG-shaped but nonconformant, and its generator could not consume conformant values

`packages/ui/src/tokens/tokens.json` contains 178 base tokens. The exact conformance views are:

- 146 fail the official direct JSON-schema shapes;
- 148 fail direct normative conformance after the two comma-packed `fontFamily` CSS lists are included;
- 163 fail end to end after 15 legal alias spellings resolve to invalid literal color strings;
- only 14 numbers and one cubic bezier conform end to end.

The direct failures are 60 literal colors, 67 dimensions, eight durations, five shadows, six values with the
nonexistent `$type: "string"`, and two font stacks. The 80 Light/Mocha seed colors are also nonconformant and
sit outside the 178 base count. Style Dictionary 5.5.0 flips DTCG mode when it sees `$value`/`$type` but does
not validate the stable value shapes, so the existing green build proves parsing rather than conformance.

The emitter is not migration-ready either: `tokens.build.ts` treats every array as a cubic bezier and every
other value with `String(value)`, so conformant color/dimension/duration/shadow objects become
`[object Object]`. It uses deprecated `exportPlatform()` and manually walks the token tree instead of
`getPlatformTokens().allTokens`. A source-only conversion would therefore corrupt `theme.css`.

**Required architecture.** Pin/hash the official 2025.10 Format and Resolver schemas; validate them through
direct Ajv/ajv-formats dev dependencies; add local semantic checks for font members, aliases, inherited
typing, and strict Orb extensions; migrate the source, seed value sets, bounded resolver manifest, and
type-directed modern emitter atomically by family. Four dynamic shadows and the other concrete outputs that
depend on `var()`/relative color/`clamp()` cannot be portable DTCG. They remain in the same strict JSON under
`$extensions["orb.cssValues"]`, a validated raw-output map with no `$value`, custom `$type`,
private recipe language, or seventh source file.

**Non-regression boundary.** The migration may not flatten or narrow generated seed blocks, ThemeScope
custom overrides, carried room/speaker palettes, derived polarity/`color-scheme`, runtime surface/shadow
formulas, pointer-fine behavior, or the trusted owner's separately validated end-of-head custom CSS. Capture
byte and computed/rendered goldens first; every family lands red-first with exact output coverage.

**Resolution (2026-08-31).** #936 landed as `0ba9b094d`, then cold review refused closure four times rather
than accepting a nominal green. `22a7ae04a` made nonportable output placement explicit (`theme|root`, no
default) and proved both emitter arms. `01905d6b2` separated synthetic fs conformance from the real Git
ratchet, covered exact CSS target identity against same-count swaps, and made Light/Mocha seed membership
exact before generation. Final frontier review confirmed 178 unique targets, 272 scanned entries, 44/44
adversarial checks, byte-identical generated CSS/TS artifacts, exact Hearth/Light/Mocha Resolver pairing,
arbitrary custom-theme preservation, and zero retired extension terminology. #936 is closed.
Full package/API receipts and the migration inventory are in
`2026-08-31-tailwind-style-dictionary-dtcg-api-audit.md`; the durable build order is
`../../architecture/proposed/token-contract-program.md`.

---

## F13 (P2, added 2026-08-31) — TV merges before Orb can observe conflicts, and the browser alone knows the cascade winner

Orb's `tv` factory currently enables tailwind-variants' internal merge. Component candidates can therefore
be discarded before the exported `cn()` front door sees them, making a complete `__orb` loser/winner receipt
impossible. Neither tailwind-variants 3.2.2 nor tailwind-merge 3.6.0 exposes a decision callback;
`experimentalParseClassName` reports syntax, not class-group classification or the winner. A live probe
proved `createTV({twMerge:false})` preserves normal and slot candidates.

The bounded solution is one merge: disable TV's internal merge, join and record candidates at `cn()`, then
identify each loser/winner chain by occurrence-aware suffix/pair replay through the exact configured merger.
Do not copy tailwind-merge's private class-group engine. Structurally restrict `createTV` to this front-door
file because the package keeps module-global merge configuration state.

That still cannot explain why a browser declaration won. Layer, specificity, source order, inline styles,
inheritance, and custom-property resolution belong to the live CSSOM. The original raw-CDP prescription was
refuted: protocol matched styles do not expose the declaration activity verdict. #950 therefore embeds a
revision-matched, path-closed official DevTools frontend SDK and asks
`CSSMatchedStyles.propertyState` for `Active`/`Overloaded`; raw CDP matched-style data is transport input,
not a safe cascade oracle. #975 repaired the same-revision closure to 479 resources / 9,853,687 bytes by
following literal `import.meta.resolve()` edges and exercising the official formatter API so both transitive
formatter-worker assets are observed; the closure remains hash/license/revision verified. Planted controls cover layer,
specificity, inline, inheritance, custom-property fallback/cycle/undefined, animation, transition, and a
losing declaration. An empty trace is `INSTRUMENT ERROR`, never clean. `snap --dead-css` remains
complementary: it answers whether a class/rule exists, not which valid declaration won.

**Current status.** #949 and #950 are grouped-barrier graduated. #975 (`3bc35e338`) treats a null
`propertyState(property)` as a legitimate unclassified SDK row, preserves classified rows in a mixed
population, and keeps an ordinary zero classified-declaration population at `INSTRUMENT ERROR`; only
`allowComputedDefault` is an explicit zero exception. Vite rules with blank URLs recover repository
provenance through the stylesheet's authoritative `data-vite-dev-id` header. The six live queries returned
structured nonzero cascade results with four repository declarations, 1,891 requests, zero failed requests,
zero unexpected requests, and zero page errors.

---

# PART 2 — THE PER-FILE CENSUS (a verdict for every rule group)

**Historical base census.** All 3,169 lines were read end to end. 312 style-rule selectors were extracted comment-stripped
(`reports/stickler/scratch/cbcss-selectors.mjs`), 308 queryable, driven against **seven live surfaces** —
home (defaults), home (`--wide`, maximal appearance), a chat room (maximal + full motion), a chat room
(`--wide`, Light theme, ramp elevation, compact, grain, justify, glass), a chat room (`--wide`, maximal,
context tab), characters (maximal), config (compact), presets (`--wide`, maximal). Every class name and
data-attribute was independently swept against 7,189 source/test/doc files
(`reports/stickler/scratch/cbcss-reach.mjs`).

**Historical textual result:** the sweep found no orphan selectors. Every class and every `data-*` key the
five files selected on had a textual source writer. That was not semantic provenance. Current #956 governs
68 non-utility class identities and 112 data-selector identities through semantic JSX/DOM/HAST/static-
provenance/vendor evidence. The 106 selectors that matched nothing on any drive were state-gated
(hover · overlay panel mode · an open modal or menu · streaming · reduced motion · a loading skeleton · a
wallpaper · the media grid · the boot veil), each with its writer named below.

## 2.1 `packages/ui/src/styles/theme.css` (historical 285; current 309) — **SOURCE CONTRACT MIGRATED AND ENFORCED (#936)**

| rule group | verdict | reason |
| - | - | - |
| `@theme` block, the full vault (`:4-183` at baseline) | historical defect fixed | #936 migrated the source/emitter atomically and cold-confirmed 178 exact targets, 272 entries, 44/44 adversarial checks, and byte-identical generated artifacts |
| `@media (pointer: fine) { :root { … } }` (`:185-193`) | correct-as-is | the D62-P1 pointer-conditional control floor, emitted at the TOKEN layer so no feature branches. Later in source than `@theme`'s `:root`, same specificity ⇒ wins when it matches |
| `:root { color-scheme: dark }` (`:195-197`) | correct-as-is | the base polarity the `light-dark()` arms select on |
| `[data-theme="light"]` (`:199-241`), `[data-theme="mocha"]` (`:243-285`) | correct-as-is | generated per D71; each self-complete and carrying its own `color-scheme` |
| the intent family (`destructive/success/warning/info` ± foregrounds) and `--color-track-1..6` declared ONCE as `light-dark()`, never re-stated per theme | correct-as-is | D71 clause (3); this is the mechanism F3 says the chart ramp should join |
| `--color-chart-1..5` polarity-aware, with carried-theme concrete derivation | **FIXED (#939)** | static seeds use `light-dark()` with byte-identical dark arms; custom ThemeScopes emit five host-judged concrete fills. Cold CT proved five real ECharts fills at ≥3:1 |
| `--color-reading-plate-foreground` and `--color-sidebar-accent-foreground` | **FIXED (#969), FRAMEBUFFER MARGIN REPAIRED (#883)** | portable semantic pairs live at the token home; custom ThemeScopes solve each actual host. WCAG remains 4.5 while Orb-owned neutral derivation aims at 4.6 capped by the anchor's attainable endpoint. Mocha `muted-foreground` is the sole seed retune (L 0.720→0.731); generated base token output is byte-identical |
| `--color-sheen`, `--color-highlight` + foreground, `--color-sky-*` not overridden per theme | correct-as-is | deliberate polarity-FIXED values; `sheen` is used only at 0.02–0.04 alpha as a gradient foot, and the globals comment says so verbatim |

**Token definitions:** 161 `--color-*:` declaration lines here vs **4** in `client/styles/globals.css` and 0
elsewhere. (The dispatch survey's 144/4 used a different regex; the ratio and the conclusion are identical.)

## 2.2 `packages/ui/src/styles/globals.css` (historical 961; current 831) — **BASE VERDICTS PRESERVED; DARK VARIANT REMOVED (#954)**

Structure: `@import tailwindcss / theme.css / tiers.css`, then 24 deliberately UNLAYERED rule groups. The
unlayered posture is the whole mechanism (Tailwind v4 emits utilities into `@layer utilities`; unlayered beats
layered regardless of specificity) and is stated in the file header.

| rule group | lines | verdict |
| - | - | - |
| reduced-motion floor (`@media` + `[data-reduced-motion="true"]`), `transition-property: none` | 24-52 | correct-as-is — the `none` spelling is load-bearing (measured: 1,063 transitionstart events → 0), and each `!important` carries its own line-adjacent `biome-ignore` with a real reason |
| `:root { font-size: calc(100% * var(--font-scale, 1)) }` | 56-58 | correct-as-is — on `:root`, so it reaches portals too; #937 has since moved density's carrier to the shared ThemeScope for the same reach guarantee |
| `@custom-variant dark (…)` | 69-71 at baseline | **REMOVED (#954)**; prevention is integrated/in Review with #961 and awaits the grouped barrier |
| empty-state decoration aura + its positioning pair | 82-93 | correct-as-is; state-gated (an empty state must be on screen) |
| `[data-slot="empty-state-title"][data-title-step="focal"]` | 105-108 | correct-as-is; the unlayered-on-purpose note was itself repaired by a 2026-08-21 side-eye and now states the truth |
| CTA / media-cell / active-tab gradient rings (3 groups) | 115-146 | correct-as-is — a mirrored recipe with per-site alphas, cross-referenced in both directions; this is presence-mirroring, not duplication |
| separator fade mask | 150-153 | correct-as-is |
| date-input UA pseudo-element tints (`::-webkit-datetime-edit`, `::-webkit-calendar-picker-indicator`) | 164-179 | correct-as-is — Tailwind cannot address a UA pseudo-element; both carry measured receipts |
| `[data-slot="art-bleed"]` | 204-209 | correct-as-is |
| `.scroll-fade-x` / `.scroll-fade-y` families | 217-255 | correct-as-is; both declare their own 0% defaults, which is what shields a nested scroller from an ancestor's inherited stop |
| `[data-slot="menu-popup"]` scroll-shadow background recipe | 272-289 | correct-as-is |
| media-grid spotlight (`@media (pointer: fine)` + reduced-motion) | 294-315 | correct-as-is |
| `::selection`, scrollbar (`:root` colour + `*` width) | 317-329 | correct-as-is |
| `.orb-lines-2` | 339-341 | correct-as-is (`text/variants.ts:182`) |
| skeleton shimmer + its two named override seams | 346-390 | correct-as-is — the "defaults are var() FALLBACKS, not declarations" note is the load-bearing part and is accurate |
| indeterminate hairline (owns its own containing block + clip) | 415-442 | correct-as-is |
| `.orb-skip-offscreen` | 457-460 | correct-as-is (`command/variants.ts:21,46`) |
| typing dots + stream caret + word reveal | 472-550 | correct-as-is; the 5-deep caret selector is CT-pinned by tagName |
| `[data-streamdown="code-block"] { content-visibility: visible !important }` | 573-576 | **correct-as-is, verified against the installed vendor** — streamdown\@2.5.0's dist still emits `"data-streamdown":"code-block", style:{contentVisibility:"auto", containIntrinsicSize:"auto …` |
| settings flash anchor + `--lit` | 593-601 | correct-as-is (`config-scroll-spy.ts:11,12`) |
| the waystone family (33 groups: 12 `@keyframes`, the layer classes, two `@container` size gates, two reduced-motion arms) | 627-894 | correct-as-is — every class traced to `charts/meter/waystone*.{ts,tsx}`; `.orb-ws-gust-b` correctly sits AFTER `.orb-ws-gust` so its delay survives the shorthand reset |
| `.orb-weave-glow` + the WebSpinner group | 902-961 | correct-as-is |

## 2.3 `packages/ui/src/styles/tiers.css` (historical 140; current 160) — **SYMMETRIC DENSITY CONTRACT (#938)**

The historical tier structure was correct. #938 subsequently made compact and comfortable symmetric through
the structured token emitter without adding a preview-only definition. All ten `--orb-tier-*` privates are
declared in both tier blocks and all ten are consumed. The custom-property
indirection (rather than the spec's illustrative paired rules) is correct and its stated reason is right:
identical-specificity rules would resolve a NESTED surface by source order, and inheritance resolves it by
proximity in both directions. `[data-slot="list-row-subtitle"][data-subtitle-step="label"]` (`:113`) is the
only rule not scoped to `[data-surface-tier]`; it ties on specificity with `:105` and wins on source order,
and being unscoped is correct — it is a readability FLOOR that should also hold outside a Surface.

## 2.4 `packages/client/src/styles/globals.css` (historical 590; current 696) — **BASE VERDICTS PRESERVED; COMMENT FIXED (#957)**

| rule group | lines | verdict |
| - | - | - |
| `:root` / `body` / `html,body { overflow: clip }` / `#root { isolation: isolate }` | 13-34 | correct-as-is — the background on both `:root` and `body` is the standard canvas-propagation belt-and-braces, not a duplicate |
| `.orb-weave-shimmer` | 37-48 | correct-as-is (`lib/weave-glyph.tsx:53`) |
| the glass block: 8 selectors under `@media (width > 48rem) + @supports` | 75-177 | correct-as-is — the width scoping is the ORDER-PROOF form of the #135 mobile-perf ruling and is sync-enforced |
| the two over-art polarity floors (#237 panes, #623 modal slots) | 104-109, 156-162 | correct-as-is — #623's sibling-combinator anatomy is the precedent F1 should have inherited |
| reduced-transparency arm (drives the two fill knobs, never `revert`) | 203-221 | correct-as-is — the `revert`-drops-to-UA-default trap is documented and avoided |
| `prefers-contrast: more` (grain drop · per-side edges · the alpha arm in its own negated query) | 304-345 | correct-as-is — mutually exclusive by CONDITION, not by source order; test-enforced |
| prose/wordmark text-shadow | 349-366 | correct-as-is |
| the reading measure + reading typography + justify/hyphens pair | 414-439 | correct-as-is |
| `[data-has-bg-image] [data-slot^="message-metadata-"]` | 455-457 | correct-as-is — the prefix keying is deliberate so a new datum slot inherits the guarantee |
| **the 4 stray `--color-*` definitions** | 464-471 | **CORRECT OUTSIDE THE VAULT — see below** |
| grain texture (3 rules incl. the in-grid suppression) | 486-518 | correct-as-is — the "one grain layer per pixel" narrowing is correct and CT-pinned |
| `.shell-grid[data-elevation="glow"] [data-slot="surface-root"] > :first-child` | 524-530 | correct-as-is; verified live at `--wide` with glow (`cardRootGlow: 1`). Shares F1's grid-scoping, but weakly — a portalled Surface sits inside a popup that already carries `--shadow-overlay` |
| message-list edge fade + the art opt-out | 553-570 | correct-as-is |
| avatar hairline over art | 574-578 | correct-as-is |
| `.orb-echo-track` | 695-699 | correct-as-is — the track remains a selector mechanism; the deleted `.orb-echo-box` duplicated skin-owned inline geometry now shared by the bubble and column (`message-row-variants.ts`) |
| the ThemeScope comment at `:461-463` | 461-463 at baseline | **FIXED (#957, integrated/in Review)** |

### The four stray `--color-*` definitions — VERDICT: correct outside the vault, and the duplication is required

They are lines **465, 466, 469, 470**: two names (`--color-border`, `--color-sidebar-border`) declared twice,
under `html[data-theme-colorization]` and again under `html[data-theme-colorization] .shell-grid`.

**They are not token DEFINITIONS. They are runtime RE-TINTS of two existing tokens**, derived by `color-mix`
from `--color-primary` + the surface's own foreground, gated on a per-user appearance flag. `tokens.build.ts`
emits STATIC per-palette value-sets from JSON; D71 forbids hand-authoring a `[data-theme]` block; and the
vault has no mechanism for "mix token A with token B under a data attribute". **The vault physically cannot
express this, and both partners of the mix are tokens — no literal is introduced.** `no-raw-color-in-css`
scans this file and passes them, correctly.

**The duplication across the two rules is required, and I verified the reason rather than trusting the
comment.** `THEME_SCOPE_EMIT_VARS` (`clamp.ts:142-143`) includes both names, so under a CUSTOM theme
`<ThemeScope>` carries them as INLINE custom properties on an ancestor of `.shell-grid`; an inline declaration
beats a value inherited from an `html`-level rule, so the grid-scoped twin is what makes the flag work inside
the shell, while the html-level one covers portalled Dialog/AlertDialog. Only the comment's ELEMENT name is
wrong (F11a).

## 2.5 `packages/client/src/features/app-shell/surfaces/shell.css` (historical 1,193; current 1,175) — **BASE VERDICTS PRESERVED; LISTED DEFECTS FIXED**

| rule group | lines | verdict |
| - | - | - |
| `.shell-grid` base: tracks, co-motion vars, `100vh`→`100dvh` fallback pair, `overflow: clip`, `isolation`, safe-area | 4-34 | correct-as-is; the duplicate-`height` biome-ignore is line-adjacent with a real reason |
| bg-image arms (transparent grid, `.shell-main` halo, the two text-shadow opt-outs, the chats empty-state plate + its `@supports` twin, the non-chats reading backing) | 37-72 | correct-as-is |
| density arms | 80-85 at baseline | **FIXED (#937/#938):** the shared ThemeScope carries viewer density across grid and portals; compact and comfortable now resolve symmetrically from the canonical structured token output |
| elevation `ramp` (6 rules) + `glow` (1) | 87-117 | correct-as-is; the `:where()` specificity-zeroing is deliberate and correct. Verified live: `cardRootGlow: 1` under maximal at `--wide` |
| the docked-track algebra + the #242 conditional squeeze + the primacy sentinel | 119-213 | correct-as-is — this is the irreducible layout ALGEBRA that justifies the file's existence (see F5) |
| the FLIP (3 `@keyframes` + 3 rules) and the reduced-motion SETTLE (2 rules) | 215-304 | correct-as-is |
| the rail: 12 groups incl. the brand chrome-row cell, the active ember box/glow/gradient trio, the two `display:none` desktop arms | 306-445 | correct-as-is |
| the panels: 20 groups (mode geometry, overlay sheet elevation, the context ember binding, the `:empty` and `:has()` band collapses, the bracket padding opt-out) | 447-639 | correct-as-is; every `:has()` chain traced to a live slot writer |
| `.shell-main` + the topbar family (identity arms, title floor, divider, icon-button floor) | 641-712, 837-854 | correct-as-is. Checked and CLEARED: the wide identity's fallback title carries no `.shell-topbar-title` class (`shell-topbar.tsx:153`), so neither the 6ch floor nor the yield rule reaches it — correctly, because `title` there is the SECTION label, not the artifact name, so it is not the duplicate the yield rule exists to remove, and a flex item with no `min-w-0` cannot collapse to 0 anyway |
| the identity YIELD (`:is()` + `:has()` on a band heading) and the hero-echo yield | 714-772 | correct-as-is; the `:has()` form is what keeps a heading-less band (Presets) from losing its topbar title |
| `@container shell-main (max-width: 30rem)` shed block | 774-835 | correct-as-is. Checked and CLEARED: the two chip selectors inside it are UNSCOPED, which looks like over-reach — but the context panel is a SIBLING of `.shell-main` in the DOM, so `@container shell-main` structurally cannot reach the band's own copy of the same chips. The at-rule is the fence |
| the view-transition scope (`:root { view-transition-name: none }` + the named content pane) | 856-941 | correct-as-is |
| the notice band (3 rules) | 892-926 | correct-as-is |
| `.shell-scrim`, `.shell-modal-header` | 950-979 | `.shell-modal-header` itself is correct; its CONSUMER carries **F4** |
| the ONE mobile `@media` (18 groups) | 981-1193 | correct-as-is — including the three tombstone comments, which are the good kind (they record a deleted rule and why it must not come back) |
| `:463` `.ctx-tab-strip` citation | 463 at baseline | **FIXED (#957, integrated/in Review)** |

---

# PART 3 — THE COLOUR-VS-GEOMETRY LINE (the #919 deliverable) AND THE §4 TOKEN AUDIT

## 3.1 The falsifiable claim, answered: YES — every colour in shell.css consumes a token

Definition, so the number is reproducible: a **colour-bearing declaration** is one whose property can carry a
colour — `background`, `background-color`, `background-image`, `color`, `border`/`border-*color`,
`border-inline*`/`border-block*`, `box-shadow`, `text-shadow`, `fill`, `stroke`, `outline*`, `scrollbar-color`,
or a `--color-*` definition — counted comment-stripped.

**`shell.css` carries 56 colour-bearing declarations and ZERO hand-picked colour values:**

| class | count | what it is |
| - | - | - |
| direct token | 37 | `var(--color-*)` / `var(--shadow-overlay)` / `var(--shadow-glow)` |
| token-derived | 5 | 4 × `color-mix(in oklab, var(--color-*) N%, transparent)` + 1 multi-line `linear-gradient` over `oklch(from var(--color-primary) …)` / `oklch(from var(--color-sheen) …)` |
| keyword | 13 | `transparent` / `none` |
| `border: 1px solid transparent` | 1 | a placeholder edge for a gradient border-box ring |
| **raw colour literal** | **0** | — |

Verified two ways: the census script (`reports/stickler/scratch/cbcss-colour-census.mjs`) and an independent
literal sweep for `#rrggbb` / `rgb(` / `hsl(` / bare `oklch(<number>` / named CSS colours — whose only hits
were `#242`-style issue numbers inside comments. And it is true **by construction**, not by luck:
`no-raw-color-in-css` scans `packages/{ui,client}/src/**/*.css` and allowlists exactly one raw-colour home,
the generated `theme.css`.

**The same holds for the other three authored files:** ui/globals.css 13 colour-bearing declarations, 0
literals; tiers.css 0 (it is pure type/space/radius); client/globals.css 24, 0 literals.

**So D150's "no colour lands there" is definitively false about the file, and the rule it was reaching for is
definitively true.** Replacement text: PART 6 §C-2.

## 3.2 The line itself, stated so a D-row can be written against it

> **shell.css owns the shell's own STRUCTURAL surfaces — the region fills, seams and elevation treatments
> that ARE the shell's anatomy — and it names every one of them with a token. A COMPONENT's paint never
> lands there.**
>
> Structural, and correctly shell-owned: the grid's own base (`--color-background`/`--color-foreground`), the
> rail and panels' `--color-sidebar` fill + `--color-sidebar-foreground` ink + `--color-sidebar-border`
> hairlines, the chrome-row bottom seams, the topbar's fill and `--color-border` seam, the panel-header ember
> binding, the dismiss scrim's `--color-backdrop`, the whole elevation family (`ramp`'s
> `--color-surface-raised`/`--color-card` ladder with its hairlines dropped; `glow`'s `--shadow-overlay`), the
> overlay sheet's `--shadow-overlay`, the active rail-button's ember fill + glow + gradient edge, and the
> over-art text-shadow/backing arms. **Every one of these is a property of the FRAME, not of anything
> rendered inside it — and a token names each.**
>
> A COMPONENT's paint does not land here, and the tree already obeys that: the context bracket paints its own
> 2px binding on its own root (`context-bracket.tsx`, `border-primary/55`), the claimant paints its own band,
> a card paints from `card/variants.ts`, a bubble from `message-row-variants.ts`.

**The clause that IS falsifiable and DOES fail is the LENGTH half.** §4 says shell.css *"CONSUMES tokens for
every value it uses."* It does not — and the two sub-lists must stay separate, because one is doctrine and one
is a work item.

### 3.2a Deliberately un-tokened, and CORRECT — this is doctrine text, not a backlog

| site | value | why a token is wrong here |
| - | - | - |
| `:23,:25` | `100vh` / `100dvh` | viewport units; the dvh-over-vh pair IS the mechanism |
| `:81-84` | the four compact steps | a token reference inside the block would resolve against the block's own redefinition — the shift-by-one is unspellable in tokens (see 2.5) |
| `:184,:194` | `0.7`, `* 1.5` | ratios (a share of a deficit, a primacy multiplier); the token vault has no ratio namespace and should not grow one for two numbers |
| `:209` | `block-size: 1px` | a hidden measuring sentinel, not paint |
| `:783` | `@container … (max-width: 30rem)` | a container query cannot read a custom property |
| `:982` | `@media (max-width: 48rem)` | an `@media` condition cannot read a custom property. Sync-enforced against `--dimension-shell-breakpoint` and against `client/globals.css`'s complement by `css-structure.suite.test.ts:337` |
| `:59`, `:355`, `:406`, `:433`, `:566` | the per-site alphas (`72%`, `14%`, `55%`, `0.45`, `0.03`) | the house rule the ring recipes state verbatim: *"the per-site alpha (the tuned ring weight) stays here; only the colour is the token's call"* |

### 3.2b Historical off-token residue — fixed and gate-enforced by #955

| sites | value | the token that already exists |
| - | - | - |
| `:316, :336, :468, :472, :555, :664, :977, :1012` (8) | `1px solid` hairlines | `--border-width-control: 1px` |
| `:689` | `height: 1.25rem` (topbar divider) | `--spacing-glyph-sm: 1.25rem` — exact match |
| `:364-366`, `:566`, `:429` | the 2px "hairline-plus" bar/edge and the 1px transparent ring edge | none — an un-tokened step the file names in prose (`:363`) |
| `:439` | `line-height: 1` | none on the `--leading-*` scale |
| `:711` | `min-width: 6ch` | none |
| `:914` | `min(14rem, 30dvh)` | none |
| `:1035` | `gap: 0.125rem` | none — off the bottom of the spacing scale |
| `:47` | `text-shadow: 0 1px 3px …` offsets | none (`--shadow-prose` is a different recipe) |

**Resolution (2026-08-31).** #955 landed as `e07b79b2d` after re-deriving the post-#938 file rather than
copying this baseline table. It resolved 20 non-structural residues: existing `border-width.control` and
`spacing.glyph-sm`; new portable `spacing.micro`, `dimension.shell-accent-edge`, and `leading.none`; and
validated `orb.cssValues` outputs for the 6ch title floor, the `min(14rem, 30dvh)` notice cap, and the
token-coloured shell text shadow. The combined `css-length-tokens` gate makes the residual structural set an
authored, reasoned, count-pinned allowlist and consumes #961's shared static-class provenance rather than
building another evaluator. Focused receipts are 8/8 gate conformance and 51/51 token-contract/index; four
selected browser assertions passed, while their grep-filtered CT wrapper correctly refused a suite verdict
because an unrelated routeTrpc population marker was absent. Final rendered/repo-wide judgment stays with the
grouped train barrier, not an invented green for that wrapper.

**Motion is clean.** Zero raw durations or easings in shell.css; every one is `var(--shell-motion)` /
`var(--motion-*)` / `var(--ease-out-expo)`, which is what `motion-token-purity` enforces over
`packages/{ui,client}/src/**/*.css`.

---

# PART 4 — THE DOCTRINE (deliverable A)

*Proposed home: a NEW `## 4. The paint law` in `client-architecture-lockdown.md`, replacing the current one.
Short enough to read whole; precise enough to settle an argument. Every clause names its enforcer, and where
nothing can enforce it, it says so.*

## 4.1 The one sentence

**Every reusable portable visual VALUE is a conformant DTCG token. A generated value that inherently needs
the CSS runtime is explicit vendor-extension data, never a fake token type. Every component SKIN is a `tv()`
variant. Every LAYOUT is an `@orb/ui` primitive. CSS is written in exactly six places, and features are not
one of them.**

## 4.2 The six homes — a CLOSED set, by path

| # | path | what it is | hand-written? | why it exists |
| - | - | - | - | - |
| 1 | `packages/ui/src/tokens/tokens.json` | THE reusable-value source: conformant DTCG plus `orb.cssValues` for nonportable generated output | **yes — the one source** | one home for portable design decisions and token-output CSS values without private `$type`s or a seventh source |
| 2 | `packages/ui/src/styles/theme.css` | the generated `@theme` block + the generated `[data-theme]` seed value-sets | **NO — generated, DO NOT EDIT** | `tokens.build.ts` from (1) + `tokens/themes/*.json`; freshness test-enforced |
| 3 | `packages/ui/src/styles/globals.css` | ui's ONE css entry: the tailwind/theme/tiers imports + the deliberately UNLAYERED floors | yes — floors only | a floor must beat every layered utility; there is no other way to express that |
| 4 | `packages/ui/src/styles/tiers.css` | the density-tier map: SLOT NAME → token step | yes | a slot name is not token data, so it cannot live in (1) |
| 5 | `packages/client/src/styles/globals.css` | the client's ONE stylesheet: document-level defers + the capability-query surface treatments | yes | `@media`-conditioned surface state (glass, contrast, transparency) is not a token and not a skin |
| 6 | `packages/client/src/features/app-shell/surfaces/shell.css` | **the structural layout engine** (§4.4) | yes — the ONE feature-tier file | §4.4 |
| — | `packages/ui/src/**/variants.ts` | component skins — `tv()` over token utilities | yes (token classes only) | the ONLY styling-variation path |

**A `.css` file at any other path is RED by doctrine.** *(`sanctioned-css-homes` replaced the feature-only
proxy at `9b0e6debb`; follow-up `fee25f89b` closed its cold-found dot-path inventory and wrong-file-kind
bypasses with permanent controls. Cold verification confirmed the combined train and #921 is closed.)*

## 4.3 Where each kind of decision goes

- **A REUSABLE PORTABLE VALUE** (colour, space, size, radius, shadow, duration, easing) → a conformant DTCG
  token/value set in `tokens.json`. **A generated output that depends on CSS runtime semantics** → the same
  file's validated `orb.cssValues` map, with no `$value` or custom `$type`. Mechanism-local CSS
  expressions stay in the matching sanctioned stylesheet with a local WHY/test. Never a feature literal.
  *(Enforcers: `no-color-literals` · `no-raw-color-in-css` · `no-arbitrary-tw-values` ·
  `no-off-token-radius-shadow` · `no-off-token-inline-style` · `motion-token-purity` ·
  `no-raw-spacing-in-features` · `no-raw-typography-in-features` · `no-raw-z-index` ·
  `no-raw-container-widths`.)*
- **A COMPONENT'S LOOK** → its `variants.ts`. Never a `.css` rule, never a `className` on a raw element in a
  feature. *(Enforcers: eslint compose-only keystone · `ui-size-via-variant` · `ui-skin-fragment-purity`.)*
- **A LAYOUT** → `<Stack>/<Row>/<Section>/<Container>` + the container model. Never a viewport `@media` in a
  feature. *(Enforcers: `no-media-queries-in-features` · `no-pointer-variants-in-features` ·
  `no-layout-context-props`.)*
- **A PER-USER APPEARANCE AXIS** (glass, grain, contrast, transparency, colorization, density, elevation,
  wallpaper) → one shared carrier chosen by the descendants that must inherit it, with its consumer rule in
  the responsible sanctioned home. Density's carrier is the shared client ThemeScope so grid and portal
  siblings inherit together; `tiers.css` alone maps surface slots to density token steps; shell.css owns only
  structural shell behavior. Never duplicate an axis on the grid or introduce a per-mode component fork.
- **A SHELL-FRAME PROPERTY** (a region's own fill/seam/elevation, the track algebra, the panel motion) →
  home 6.
- **A THEME** → a token value-set (`tokens/themes/*.json` for a seed; `ThemeScope`'s clamped override for a
  custom one). Never hand-written CSS. *(D71; enforcers: `css-structure.suite.test.ts` + the freshness gate ·
  `theme-override-only-via-scope`.)*

## 4.4 Why shell.css is the one feature-tier exception

**It is a LAYOUT ALGEBRA and a compositor-only motion mechanism — neither of which is a value, and neither of
which any other home can hold.** Specifically:

1. **Track arithmetic that only CSS can evaluate.** `--pane-deficit` is
   `max(0px, <reading floor> − (100dvw − rail − panel − panel-context))`; the both-docked squeeze splits it by
   a share and floors each pane; `--content-primacy-deficit` is rendered as a hidden element's `inline-size`
   so JS can OBSERVE real CSS resolution — root font, clamp, viewport — **without duplicating any of it**.
   A token expresses a value; this is a function of the viewport.
2. **A FLIP, because compositor-only is a CORRECTNESS constraint, not a preference.** Transitioning
   `grid-template-columns` re-ran layout over the whole content subtree every frame and scored 0.2774 of
   layout instability on one panel dock. The replacement resizes the track in ONE frame and cancels it with a
   counter-`translate`, so the shift is not merely small — it is not RECORDED. That needs `@keyframes` and an
   attribute grammar; a `tv()` variant cannot express a transient "from" corner that no resting state holds.
3. **Co-motion vars.** The track animation, the panel slide and the dismiss scrim all read
   `--shell-motion`/`--shell-ease`, so divergence is structurally impossible rather than merely discouraged.
4. **The ONE viewport `@media`** that reflows the same rail DOM into a bottom tab bar.
5. **Specificity-ordered elevation**, using `:where()` to zero attribute specificity so later glass and
   bg-image rules win on their own merits.

**And it consumes a token for every COLOUR it paints — 56 colour-bearing declarations, zero literals, gate-
enforced.** Its geometry is a MIX: tokens where a token exists, and a small declared set of structural
literals that are correctly un-tokened (viewport units, ratios, the two query-condition literals, per-site
alphas). *(§3.2a is the authoritative list; anything not on it wants a token.)*

## 4.5 The two mechanisms that make the cascade predictable, and must not be re-litigated

- **UNLAYERED IS THE MECHANISM.** Tailwind v4 emits every utility into `@layer utilities`; an unlayered rule
  beats any layered rule regardless of specificity. That is what lets `theme.css` and `tiers.css` win over a
  primitive's own utility default, and what makes the floors in home 3 floors. **There are zero `@layer`
  blocks in the authored CSS and there must stay zero.**
- **SOURCE ORDER IS LOAD-BEARING, and production/CT share one front door.**
  `packages/client/src/styles/index.ts` imports shell first and then client globals, whose first import is UI
  globals; both production and Playwright CT import that same entry. Home 5 and home 6 declare overlapping
  selectors at identical specificity, so flipping the order silently changes which wins. #959's
  `playwright-css-topology` recursively derives and closes that graph. `playwright/index.css` adds only the
  tests-only Tailwind source extension; it carries no product import or second product roster. **Never
  "improve" the order; change the law explicitly.**

## 4.6 Polarity has ONE mechanism

`light-dark()` arms selected by `color-scheme`, which the clamp DERIVES from the palette's measured
black-vs-white surface contrast (`surfacePolarity`) so a user-authored light theme resolves the light arms
and native controls follow. **There
is no second polarity mechanism.** A `dark:` variant keyed on enumerated `[data-theme]` names structurally
cannot see a custom theme's derived polarity and is therefore banned. *(Enforcer: delete the
`@custom-variant dark` line, and a one-line lint rule banning a `dark:` prefix in a class string.)*

## 4.7 What enforcement actually covers — say it plainly, including the holes

Three tiers, and a fourth category that is neither:

- **ENFORCED (a run goes red):** `sanctioned-css-homes` owns the exact six-path closed set, including dot
  paths and regular-file identity (#921); the value/token gates include the DTCG contract (#936), custom-
  property definition ownership (#952), family ownership (#951), semantic selector writers (#956),
  polarity (#954), length ownership (#955), and production/CT topology (#959). The compose-only eslint
  keystone still governs `packages/client/src`; the compiler-derived single-merge contract and runtime
  factory seal are integrated under #949.
- **IMPLEMENTED AND TRAIN-GRADUATED:** #949, #951, #952, #954–#957, #959, #961, and #965 passed the grouped
  242/242 structural barrier plus the affected 64/64 tooling and 21/21 rendered matrices.
- **IMPLEMENTED AND TRAIN-GRADUATED:** #950 explains final browser cascade winners across layer,
  specificity, source order, inline style, inheritance, custom-property resolution, animation, and
  transition through the revision-pinned official DevTools frontend SDK, not raw-CDP inference. Focused
  runtime and closure receipts are green; the official-SDK matrix is 3/3 and the grouped barrier passed.
- **POST-GRADUATION PROVENANCE BOUNDARY:** #972 proved 413 `tv` observations in each static ownership gate;
  508 observations remain genuinely runtime-assembled. `cva` has zero package/lockfile/source population, so
  no speculative `cva` grammar was added. #975's live cascade repair is the runtime complement described above.
- **INSTRUMENT TRUST PREREQUISITES FOR #953:** #976 accounts for exactly 381 settled design-audit subjects
  (363 walked/judged + 18 explicit document-head skips) and reports requested/resolved/actual theme polarity;
  \#977 reports requested/applied/actual mobile environment and rejects a same-viewport desktop counterfeit.
  Neither replaces #953's matrix or scenario-floor verdict.
- **NOW A BLOCKING FLOOR (#953):** `snap --dead-css` (`deadcss=`/`emptycss=` on every RESULT line) and its
  dev-only `motion-dead-class-flagger` twin are consumed by the appearance-invariant evaluator — a dead or
  empty identity reddens the cell, and a zero denominator, unreadable sheet, or unsettled flagger drain is
  INSTRUMENT ERROR. They still answer existence/parsing only, not value resolution, class-list merge, or
  browser cascade; those remain #949's and #950's tiers.
- **THE POSITIVE PATTERN, worth generalising past CSS:** `@orb/kit/dead-css` owns the DEFINITION — the
  tokenizer and the marker tables — and its two consumers differ only on the DOM half (which sheets, which
  elements, on what clock). snap serialises the regex SOURCE into the page rather than re-typing it. **Two
  definitions would file two bugs; there is one.** The contrast with `feature-css-files` is not effort — both
  are small — it is that one enforcer encodes the RULE and the other encodes a convenient PROXY for it (a
  directory glob standing in for a six-row table). **A gate that encodes a proxy is green about the wrong
  question.** When you author an enforcer, write down the rule's own vocabulary, then check whether your
  scan is that vocabulary or a shortcut to it.

---

# PART 5 — THE GAME PLAN (deliverable B)

Pre-launch, no-legacy: no shims, no transitional duplicates, no "leave the old beside the new". Sequenced for
CORRECTNESS and merge safety. **Every step that changes a rendered pixel owes a rendered receipt per surface —
pre-launch removes the user risk, not the verification bar.**

### Wave 0 — completed: doctrine landed first

| # | step | blast radius | tier | mech/judgment |
| - | - | - | - | - |
| 0.1–0.5 | **DONE #919/#930:** doctrine, D150, north-star disposition, pointers, and constitution moved as one law train | docs only | prose | cold-confirmed at the final #930 tree; #919 Done |

### Wave 1 — make §4.2's closed set REAL (this is what turns the doctrine from prose into law)

| # | step | blast radius | tier | mech/judgment |
| - | - | - | - | - |
| 1.1 | **#921 — CLOSED:** `feature-css-files` became `sanctioned-css-homes` at `9b0e6debb`; `fee25f89b` made the package inventory dot-path-complete, required regular files, deleted the exposed `.ds-preview-*` seventh home, and planted both controls | 1 gate + its conformance arms | **gate** | full conformance 8/8 green; cold verification independently confirmed 6 red/3 green descriptors plus all required-home and escaped-path probes |
| 1.2 | **#952 / G-NEW-2 `css-var-defined` — IMPLEMENTED, GROUP BARRIER PASSED:** `681d38afb` proves every static `var(--x)` in the product stylesheets and declaration-proven arbitrary-variable class resolves through a generated token, authored declaration, fallback, exact runtime writer, or installed Base UI contract | 1 gate + shared resolver | **gate** | focused real-tree zero findings over 1,587 sources/225 definitions/751 references; 49 Base UI docs/43 properties/13 live/19 executable memberships; six exact CSSProperties writers stale-armed; conformance/type/lint/depcruise and grouped 242/242 barrier green |
| 1.3 | **#940 — CLOSED:** repoint F4 to existing `z-(--z-raised)`, correct the coupled comment, set-equality check the gate's seven-name vocabulary against the vault, reject unknown semantic z vars in JSX and exported recipes, and prove the stacking winner live | 2 product files + gate + CT | code + gate + rendered | `20d810344` + cold-refutation follow-up `a8a60ce20`; independently confirmed |
| 1.4 | **#956 / `css-selector-has-a-writer` — IMPLEMENTED, GROUP BARRIER PASSED:** every authored non-utility class and `data-*` selector identity is reconciled against semantic JSX/DOM/HAST/#951 writers plus exact installed vendor contracts | 1 gate + shared provenance/cache | **gate** | `5a9a9ada3`; focused 18/18, ts7/Biome green, 240 active gates discovered at integration. #965 subsequently bounded the shared collector at 19.3s/3.48 GB; grouped 242/242 barrier green |

### Wave 2 — close the measured defects (each lands alone; each owes a rendered receipt)

| # | step | blast radius | tier | mech/judgment |
| - | - | - | - | - |
| 2.1 | **F1 / #937 — CLOSED:** stamp viewer density on the root ThemeScope, remove the grid duplicate, and project viewer-sacred keys from every current card-sourced nested ThemeScope | root + chat/character shared card boundaries | code + unit/security + rendered + structural census | `c3fb373b2` + two cold-refutation follow-ups `80eb7ca0c`, `99e16df97`; independently confirmed |
| 2.2 | **F2 / #938 — CLOSED:** owner chose symmetric Arm A and it landed after #936's structured-value emitter migration, never against the retired generator | token vault + generator + tiers | code + rendered CT on preview in BOTH directions | `f9dff3bb3`; cold detached verification passed 232/232 rendered CT, 92/92 focused Vitest, 8/8 ownership-gate integration, both typecheck tiers, and the 278-entry/187-target/19-`cssValues` contract |
| 2.3 | **F3 / #939 — CLOSED:** static seeds use polarity-aware chart arms and carried custom ThemeScopes derive five concrete host-safe fills across the accepted deterministic colour domain | token/clamp contract + chart consumers | token/property matrix + real ECharts CT | `c45d39ac7` + `fd31bf645`; cold-confirmed 55/55 focused Vitest and 7/7 CT with five distinct pixel-matched fills at ≥3:1 |
| 2.4 | **F7 / #954 — PRODUCT FIXED; #961 REPAIRED; GROUP BARRIER PASSED:** `214fa1200` deleted the named-theme variant, `6740e6705` made #954 a thin Oxide consumer, and `0952cc462` repaired return-position composer ownership, local namespace re-exports, and object-spread overwrite/opacity semantics from planted reds | repaired #961 provenance library + thin #954 consumer | code + shared tooling + gate + rendered | #961 focused 17/17 plus exact real probes; #954 focused 4/4 plus 13 mustFlag/5 mustPass; grouped 242/242 barrier green |
| 2.5 | **DONE IN #949; GROUP BARRIER PASSED:** compiler-positive aspect/blur/ease registration, exact positive/negative parity, later-wins controls, and sole `createTV` seal | merge front door + tests/gate | compiler/unit/gate | focused compiler 7/7, merge/token 107/107, dependency 65/65, CT 42/42; grouped 242/242 barrier green |
| 2.6 | **§3.2b / #955 — IMPLEMENTED, GROUP BARRIER PASSED:** re-derived all 20 non-structural shell residues, reused existing tokens, added only the missing portable values/runtime outputs, and left the declared structural mechanisms alone | shell + token source/generated artifacts | code + gate + rendered | `e07b79b2d`; focused gate 8/8 and token contract/index 51/51; selected browser assertions 4/4, wrapper no-verdict; grouped 242/242 barrier green |
| 2.7 | **DONE IN #957; GROUP BARRIER PASSED:** repaired the three stale comments and coupled `.ctx-tab-strip` residue | 3 product/harness comments + gate residue | prose + focused gate | integrated at `aa8cf0d53`; grouped 242/242 barrier green |

### Wave 3 — the enforcement the doctrine promised (3.1–3.4 kept; 3.0 deferred, still live)

| # | step | blast radius | tier | mech/judgment |
| - | - | - | - | - |
| 3.0 | **#962 — eliminate file-wide Biome disables. DEFERRED AND STILL LIVE, never a precondition:** the gate work of Waves 3–5 landed and graduated without it, so this row does not block anything; it is scheduled on its own. Census against base `28d526c99`: 70 files carried 74 `biome-ignore-all` directives across six rules; the suppression ratchet explicitly excludes `tests/**`, and a rejected #954 index briefly carried a whole-file complexity bypass. Migrate every directive to an exact line/range or centrally governed, stale-armed path grant; extend governance to tests; plant an index-vs-working-tree control | suppression governance | lint + gate + affected behavioral suites | no baseline/allowlist increase; zero file-wide directives is the contract |
| 3.1 | **#955 / `css-length-tokens` — IMPLEMENTED, GROUP BARRIER PASSED:** the LENGTH twin over shell declarations/queries plus #961-resolved static class carriers; structural rows are reasoned and count-pinned, missing shell fails loud, and populations print | 1 gate + planted integration arms | **gate** | `e07b79b2d`; 8/8 conformance, 51/51 token contract/index, no discovered-ignore list; grouped 242/242 barrier green |
| 3.2 | **DONE #953:** dead/empty CSS is a blocking floor, not a warning report — `tooling/src/snap/ops/appearance-invariants.ts` reddens a cell on any dead/empty identity and calls a zero denominator, an unreadable sheet, or an unsettled flagger drain INSTRUMENT ERROR. Matrix cells compare identities, so a same-count replacement cannot pass; no per-probe hard fail was added | snap contract + scenario floor | **instrument → floor** | `78788014d`; the rated matrix owns cell selection |
| 3.3 | **DONE:** merge-precedence is asserted per AXIS, not per call site — `tests/ui/lib/class-merge.test.ts` derives every `--<namespace>-*` token from `TOKENS` for the seven registered namespaces (spacing/radius/container/width/aspect/blur/ease) and requires each to defeat the core class on its own axis, plus a non-empty-namespace guard so the assertion cannot prove nothing. Bounded by the token vault, not by the app | 1 test file | vitest | a new token cannot silently re-open the defect |
| 3.4 | **DONE:** §4.7 states the residual out loud — after 3.1–3.3 the remaining uncovered class is a runtime-ASSEMBLED class string, which no static tier can read, and its named backstop is the side-eye rendered pass. Every other §4.7 row is now ENFORCED TODAY | prose | **prose + a named sweep** | the clause says out loud that it is prose |

### Wave 4 — make the value source a real contract (#936; blocks token-changing pixel fixes)

| # | step | blast radius | tier | proof obligation |
| - | - | - | - | - |
| 5.0 | **DONE #959; GROUP BARRIER PASSED:** production and Playwright CT share one `@orb/client/styles` front door; `playwright-css-topology` derives its recursive sanctioned graph and keeps the sole tests-only Tailwind source extension explicit | production/CT CSS entry + topology gate | gate + build + rendered CT | gate conformance green, client build green, custom-theme CT 3/3, cascade-order assertion 1/1 |
| 4.1 | **DONE #936:** freeze theme.css/TS/seed outputs, exact 178-target set, ThemeScope/polarity/carried palettes, pointer-fine output, and owner custom-CSS behavior | token/theme matrix | behavioral + rendered goldens | final generated artifacts byte-identical |
| 4.2 | **DONE #936:** pin/hash official 2025.10 Format + Resolver schemas; direct-declare Ajv/ajv-formats; strict schema + alias/font/inheritance/extension validation with planted controls and semantic counts | package + gate | static contract | 272 scanned entries; schema/hash/zero-population failures loud |
| 4.3 | **DONE #936:** partition portable tokens from strict `orb.cssValues`; explicit theme-or-root placement; migrate base + seed families and bounded Resolver composition | canonical token source/value sets | contract + generated parity | 178 exact targets; full identity and seed-set ratchets |
| 4.4 | **DONE #936:** replace deprecated/type-blind generator paths with modern exhaustive token iteration and type/output-role/placement formatters | generator + artifacts | unit + freshness + Vite | both placement arms proven; no unsupported silent fallback |
| 4.5 | **DONE #936:** removed-path + exact-target ratchets, `$deprecated` lifecycle, validated in-file guidance, and retired-language sweep | ledger + guidance + prose | gate + literal/structural sweep | final frontier cold review found zero active defects |

### Wave 5 — make precedence and appearance interactions observable before side-eye (#933/#935)

| # | step | blast radius | tier | proof obligation |
| - | - | - | - | - |
| 5.1 | **GRADUATED #949; EXTENDED #972:** compiler-positive/negative namespace set equality, aspect/blur/ease only, sole `createTV` seal, and 413 declaration-proven `tv` observations in each ownership gate | merge front door + tests/gate | compiler/unit/gate | 508 runtime-assembled observations remain explicit; `cva` population is zero |
| 5.2 | **GRADUATED #949:** one Orb merge plus bounded occurrence-aware loser→final-winner replay at dev/test `__orb.css` | merge instrumentation | unit + instrument controls | duplicate/asymmetric/modifier/arbitrary/custom-family cases; zero population is instrument error |
| 5.3 | **GRADUATED #950; REPAIRED #975:** revision-pinned official DevTools frontend SDK cascade provenance for bounded property/selector queries | Snap/official SDK | rendered instrument | 479-resource / 9,853,687-byte closure; null SDK rows skipped before the denominator; Vite header provenance; six live nonzero queries and planted zero/missing-worker failures |
| 5.4 | **STATIC CARRIER PROGRAM CLOSED #935; RENDERED MATRIX GRADUATED #953:** prove the 41-key Appearance carrier graph and interaction arms across ThemeScope, grid, portals, background layers, message props, and mobile/desktop shell regimes | gate + Snap matrix | static carrier + rendered scenarios | static writer/carrier/consumer closure is enforced; composed visible states and incompatible arms are matrix cells at `78788014d` |
| 5.5 | **GRADUATED #953:** stable Snap measurements are rated floors (contrast, overflow/containment, cascade/merge, density, polarity, scrim/art, mobile geometry) and exploratory matrices remain available. One policy-neutral planner (`tooling/src/_shared/variant-matrix.ts`) feeds Snap, design-audit, and motion-audit; the literal R1–R7 policy has one home at `packages/client/src/lib/appearance-invariant-manifest.ts` and route mode is its only verdict owner | scenario/rating harness | preflight + scenario floor | `78788014d`; cold receipts in `docs/design/953-appearance-invariant-matrix.md`; #976/#977 supply trustworthy theme/subject/mobile inputs; side-eye remains final taste/a11y verification |

### What must land TOGETHER

- **0.1 + 0.2 + 0.4 + 0.5** — the doctrine and every doc that cites it move in one commit, or the tree has two
  paint laws for a window.
- **1.2 + 1.3** — landing the gate before the fix reds the tree; landing the fix without the gate leaves the
  class open.
- **2.5 + 3.3** — registering a namespace without its axis assertion is exactly the unproven landing F8 is about.
- **4.2–4.4** — a strict source without a capable emitter is broken; a capable emitter without a strict
  source preserves the false green. The family migration may use internal commits, but the merged tree never
  exposes only one half.
- **5.1 + 5.2** — disabling TV's merge without the one-front-door receipt changes composition behavior;
  tracing without disabling it is observably incomplete.

### What is a merge-window class (a quiet tree)

- **2.3 / #939** and **2.6 / #955** were serialized as required. #939 is cold-confirmed and closed; #955's
  focused browser assertions passed but its full per-surface judgment remains part of the grouped train
  barrier. Future token/chart or shell-length work keeps the same quiet-tree rule.
- **2.2 / #938 Arm A** landed after #936's emitter migration as required; the historical merge-window rule is
  retained because a future density-output change must not target a generator being replaced in the same train.

### What can land alone, any time

0.3 · 1.1 · 1.4 · 2.1 · 2.4 · 2.7 · 3.4.

---

# PART 6 — HISTORICAL DOC RECONCILIATION (deliverable C): applied by #930/#957

The before/after text below records what the census proposed at base `28d526c99`; it is not a current patch
queue. #930 landed the doctrine/D150/pointer train and closed #919. #957 landed the three comment repairs and
is in Review. Current law lives in the cited law documents, not in this historical patch ledger.

Each item is marked **CONFIDENT — apply as written** or **OWNER FORK**.

## C-1 · `client-architecture-lockdown.md` §4 — REPLACE the section body — **CONFIDENT**

**BEFORE** — the sentence introducing the table (line 94):

> **The default for every reusable portable visual value is a conformant DTCG token; a generated value that
> inherently depends on the CSS runtime is explicit vendor-extension data, never a fake token type; the
> default for every skin is a `tv()` variant;
> features write NEITHER CSS nor raw values.** The full sanctioned-CSS-homes list — anything not on it is RED:

**AFTER:**

> **The default for every reusable portable visual value is a conformant DTCG token; a generated value that
> inherently depends on the CSS runtime is explicit vendor-extension data, never a fake token type; the
> default for every skin is a `tv()` variant; the
> default for every layout is a `@orb/ui` primitive; features write NEITHER CSS nor raw values.** The
> sanctioned-CSS-homes list below is a CLOSED SET, by path — anything not on it is RED.

**BEFORE** — the table is missing `tiers.css`. **AFTER** — insert this row between the `styles/globals.css`
and `variants.ts` rows:

> \| `packages/ui/src/styles/tiers.css` | the density-tier map: SLOT NAME → token step, imported UNLAYERED beside theme.css | yes — a slot name is not token data, so it cannot live in `tokens.json` |

**BEFORE** — the whole WHY paragraph (line 105), quoted in full in F5.

**AFTER:**

> **WHY shell.css is the exception (owner ruling; re-derived against the file 2026-08-30 —
> `docs/reviews/stickler/2026-08-30-css-census-doctrine-and-enforcement.md`).**
> It is a **layout ALGEBRA plus a compositor-only motion mechanism**, and neither is a value any token could
> hold. (1) **Track arithmetic only CSS can evaluate:** `--pane-deficit` is
> `max(0px, --dimension-content-reading-floor − (100dvw − rail − panel − panel-context))`, the both-docked
> squeeze splits it by a share and floors each pane, and `--content-primacy-deficit` is RENDERED as a hidden
> element's `inline-size` so `useShellLayout` can observe real CSS resolution — root font, clamp, viewport —
> without duplicating any of it (`shell.css:178-213`). (2) **The panel push is a FLIP, because
> compositor-only is a CORRECTNESS constraint:** transitioning `grid-template-columns` re-ran layout over the
> whole content subtree every frame and MEASURED 0.2774 of layout instability on one panel dock, so the track
> now resizes in ONE frame and a counter-`translate` cancels it — the shift is not merely small, it is not
> RECORDED (`shell.css:215-277`, with the reduced-motion SETTLE at `:279-304`). **There is deliberately NO
> `transition: grid-template-columns` in the file; an earlier version of this paragraph cited one as the
> justification, and it had already been deleted.** (3) **Co-motion vars** `--shell-motion`/`--shell-ease`
> are read by the track animation, the panel slide and the dismiss scrim, so divergence is structurally
> impossible (`:15-16`, `:270`, `:487`, `:964`). (4) **The ONE viewport `@media`** reflows the same rail DOM
> into a bottom tab bar (`:982`). (5) **Specificity-ordered elevation**, using `:where()` to zero attribute
> specificity so later glass and bg-image rules win on their own merits (`:88-117`).
>
> **And it consumes a TOKEN for every COLOUR it paints: 56 colour-bearing declarations, ZERO raw colour
> literals** (verified two ways 2026-08-30; enforced by `no-raw-color-in-css`, which allowlists the generated
> `theme.css` as the one raw-colour home). Its GEOMETRY is a mix: tokens where one exists, plus a declared set
> of structural literals that are correctly un-tokened — viewport units (`100vh`/`100dvh`), the compact
> density re-point (a token reference there would resolve against the block's own redefinition), ratios
> (`--pane-squeeze-list-share`), the `@media`/`@container` condition literals (a query cannot read a custom
> property; the 48rem literal is sync-enforced against `--dimension-shell-breakpoint` by
> `tests/ui/styles/css-structure.suite.test.ts`), and the per-site alphas the ring recipes own by name.
> **Anything NOT on that list wants a token.**
>
> So the law is: **tokens are the default for all values; `variants.ts` skins components; `@orb/ui`
> primitives lay out; shell.css is the one structural exception; features touch zero CSS.** When a feature
> "needs something special," it is almost always a missing token (→ `tokens.json`) or a missing
> primitive/variant (→ `@orb/ui`) — the gates push it there.

**BEFORE** — the RECONCILIATION paragraph (line 107):

> **RECONCILIATION (north-star §0 rule 2):** "hand-written CSS is legal in exactly ONE file: shell.css" is
> correct read as *feature-tier* CSS — `client/styles/globals.css` and ui's `globals.css` are real
> hand-written files at the styles tier, and `theme.css` is generated. This doc's table is the precise form;
> amend the north-star phrasing on promotion. `features/settings/surfaces/settings-shell.css` exists today —
> a violation of the one-feature-file rule; it dissolves with the settings de-god (M6) and gate G14 then bans
> the class.

**AFTER:**

> **RECONCILIATION — CLOSED 2026-08-30.** "Hand-written CSS is legal in exactly ONE file: shell.css" is
> correct read as *feature-tier* CSS; the table above is the precise whole-repo form. The north-star's §0
> rule 2 already carries that pointer, and `features/settings/surfaces/settings-shell.css` DISSOLVED into
> `client/styles/globals.css` at M6.3 — the sanctioned set is `tokens.json` plus five stylesheets; the CT
> harness sheet `playwright/index.css` is not a seventh product home. G14 is now `sanctioned-css-homes`; it replaced
> `feature-css-files` at `9b0e6debb`; follow-up `fee25f89b` landed its dot-path and regular-file controls and
> deleted the legacy `.ds-preview-*` seventh home. Cold verification confirmed the combined change and #921
> is closed.

**BEFORE** — the enforcement paragraph's opening (line 109) is accurate about eslint (verified:
`files: [CLIENT_SRC]`, ignores `features/app-shell/**`, `state/**`, `lib/weave-glyph.tsx`,
`**/*.test.{ts,tsx}`). **AFTER** — append these sentences to it:

> **UPDATED 2026-08-31: what enforcement does NOT yet prove.** The original feature-only G14 gap was proven
> by planted control and replaced by `sanctioned-css-homes` at `9b0e6debb`, which encodes the table as six
> literal paths and scans package CSS. Cold verification found two filesystem bypasses: a required path could
> be a directory because presence was not regular-file identity, and dotfile/dot-directory CSS was skipped by
> the glob defaults. Follow-up `fee25f89b` closed both with permanent controls; cold verification confirmed
> the combined train and #921 is closed. #940 now checks the semantic z-variable family against the live
> seven-token vault and closed the historical `z-(--z-sticky)` instance. #952 now proves static custom-
> property references resolve through governed ownership, and #949 explains class-list merge losers/winners.
> Final browser cascade attribution is implemented under #950 and remains inside the grouped train barrier.

## C-2 · `Core-Path-Registry.md` D150 — REPLACE the parenthetical — **CONFIDENT, apply as written** (closes #919)

**BEFORE** (inside D150):

> the bracket paints the 2px content↔context binding on its own root from the primary token (shell.css is
> GEOMETRY — no colour lands there, owner 2026-08-30)

**AFTER:**

> the bracket paints the 2px content↔context binding on its own root from the primary token (shell.css owns
> the SHELL'S OWN structural surfaces — region fills, seams, elevation — and a COMPONENT's paint never lands
> there; owner 2026-08-30, restated 2026-08-30 against the file, which carries 56 token-sourced colour
> declarations and zero literals — `docs/reviews/stickler/2026-08-30-css-census-doctrine-and-enforcement.md` §3)

**Why this exact wording.** It preserves the decision D150 was justifying (a bracket-owned concern belongs on
the bracket's root) and replaces the false REASON with the true one. The house idiom applies: *the ruling
survives — its INPUT changed.* The old phrasing was actively dangerous: an agent acting on "no colour lands
there" would strip shell.css's colour and delete the elevation mechanism, whose entire substance is
structural background and shadow changes.

## C-3 · `Core-Path-Registry.md` D150 — **no other change needed.** Verified: D150's remaining clauses (the bracket composition, the rail law, the `.ctx-tab-strip` deletion, the topbar identity yield) all match the tree as read.

## C-4 · `ui-cohesion-north-star.md` — **OWNER FORK** (F6)

The doc's own frontmatter says `status: active`; `docs/architecture/proposed/INDEX.md:37` says **SUPERSEDED**.
D66 cites it as the UI program. One of the two must move. **My recommendation, under the pre-launch
no-legacy posture: DELETE the doc from `proposed/` and move it to `docs/architecture/history/`.** Its own
header says the mechanism era closed, the shell-chrome program closed, the derive program closed and the theme
pipeline landed; what remains open (§6's rollout, §7 per stop, one server-tier item) is Project-1 lifecycle
state, which by D140 does not live in prose. Its §0 ground rules are the only durable content and they are
paraphrases of law that lives elsewhere (rule 1 → D71 + home 2; rule 2 → §4; rule 4 → the compose-only
keystone).

**Arm A (recommended):** move to `../history/`, port §0's six ground rules into §4 as citations, retarget D66.
**Arm B:** keep it, flip the INDEX row to `ACTIVE`, and replace §0 rules 1/2/4 with pointers (§C-5, §C-6).
Either way the contradiction must close; **do not leave both statuses standing.**

## C-5 · `ui-cohesion-north-star.md:94-98` — replace the paraphrase with a pointer — **CONFIDENT (only if Arm B)**

**BEFORE:** the current rule 2 (quoted in F6).
**AFTER:**

> 2. **CSS has SIX homes and features are not one of them.** The closed set, with the WHY for each, is
>    `client-architecture-lockdown.md` §4 — read it there; do not restate it here. The feature-tier
>    consequence, which is what a UI task usually needs: the only hand-written CSS a feature may touch is
>    `client/src/features/app-shell/surfaces/shell.css`, and no task adds a `.css` file.

## C-6 · `ui-cohesion-north-star.md:644` — replace the paraphrase — **CONFIDENT (only if Arm B)**

**BEFORE:** `` `theme.css` only; new hand-CSS only in `shell.css`. ``
**AFTER:** ``token edits go through `tokens.json` + `tokens:build` (D71); no new CSS (`client-architecture-lockdown.md` §4).``

## C-7 · `UI-Architecture-and-Layout.md:350` — the axis-2 row contradicts the tree — **CONFIDENT, apply as written**

**BEFORE:**

> \| **2 — macro structure** | rail+list+content+context desktop ⇄ single-column mobile; panels dock⇄overlay (the §11.1 clamp) | **`@media`** (viewport) | **SHELL only** (~1 file; the sole legal `@media` site) |

**AFTER:**

> \| **2 — macro structure** | rail+list+content+context desktop ⇄ single-column mobile; panels dock⇄overlay (the §11.1 clamp) | **`@media`** (viewport) | **the SHELL tier + the styles tier's exact complement** — `shell.css`'s `@media (max-width: 48rem)` and `client/styles/globals.css`'s `@media (width > 48rem)` glass block are ONE ruling in two order-proof halves (#135), sync-enforced by `tests/ui/styles/css-structure.suite.test.ts`. Never a feature (`no-media-queries-in-features`) |

**Receipt:** the full at-rule inventory across the five files is exactly **one** viewport breakpoint VALUE
(48rem), written in three blocks across two files — plus capability queries (`pointer`,
`prefers-reduced-motion`, `prefers-contrast`, `prefers-reduced-transparency`), three `@container` blocks and
two `@supports`. The current wording would make the glass block a violation; it is not, and its own comment
explains why it must live where it does.

## C-8 · `packages/ui/src/styles/globals.css:69-70` — the comment whose premise died — **CONFIDENT if F7's DELETE is taken; otherwise the text below**

If the `@custom-variant dark` line survives (not recommended), the comment must at minimum stop naming a
palette that no longer exists:

**BEFORE:** ``…It must exclude every light seed value-set (a css-structure test enforces this from the JSON) — currently `light` and `birdie` (the default-character pack's one daylight palette).``
**AFTER:** ``…It must exclude every light seed value-set (a css-structure test enforces this from the JSON, one-directionally — it cannot catch a name here whose palette has been deleted). The live set is `light` alone; `birdie` and nine sibling character-pack palettes were deleted at 68ee9389f. NOTE: a CUSTOM theme sets NO `[data-theme]`, so a user-authored LIGHT palette resolves `dark:` as dark while its `light-dark()` tokens correctly resolve light — two polarity mechanisms that can disagree.``

## C-9 · `tooling/src/verify/gates/no-raw-z-index.ts` — **APPLIED AND STRENGTHENED by #940**

**BEFORE:** `"raw z-N in className — use a semantic z-index token (z-modal, z-popover, z-tooltip, z-overlay, z-toast, z-dropdown, z-sticky). …"`
**AFTER:** ``"raw z-N in className — use a semantic z-index token: z-(--z-base) · z-(--z-raised) · z-(--z-overlay) · z-(--z-modal) · z-(--z-popover) · z-(--z-toast) · z-(--z-tooltip). Those SEVEN are the whole vocabulary (packages/ui/src/tokens/tokens.json `z.*`); a name outside it resolves to an undefined custom property and the z-index declaration is silently dropped. …"``

`20d810344` applied the seven-name vocabulary and parity check; `a8a60ce20` additionally made unknown
semantic z-vars red in exported class recipes after cold verification proved that production shape escaped.

## C-10 · `tests/ui/lib/class-merge.test.ts:106-107` — a docstring claiming an assertion that does not exist — **CONFIDENT, apply as written** (and see game-plan 2.5 for the assertion itself)

**BEFORE:** `*  per REGISTERED namespace; a namespace registered without a row here is caught by the count assertion *  in the completeness test below, so a new registration cannot land unproven.`
**AFTER:** ``*  per REGISTERED namespace. This list and `class-merge.ts`'s own config are asserted SET-EQUAL below, both *  ways, so neither a new registration nor a forgotten one can land unproven.``
*(Apply together with the assertion; the corrected comment without it is the same defect with better prose.)*

## C-11 · docs that mention CSS and are CORRECT — ratify, do not touch

Checked in full and left alone, with the reason each is right:

- **`UI-Density-Law.md:114,125,157,188-191`** — accurate about `tiers.css` (hand-authored, unlayered, the
  reason, and A6 parsing the slot vocabulary at run time so the gate cannot police a stale copy). **RATIFY.**
- **`UI-Theming-and-Content.md:26,28,30`** — accurate about the Tier-A token-override API, Tier-B raw CSS
  confined to the sandboxed iframe, and D71's generated seed blocks. **RATIFY.**
- **`ui-package-design.md:101,110,173,175,180`** — accurate about ui's `styles/` and the generated theme.
  **RATIFY.**
- **`Core-Enforcement-Active-Gates.md:198`** — already carries the CURRENT truth about `settings-shell.css`.
  **RATIFY** (and note it as the doc that was right first).
- **`Core-Path-Registry.md` D71** — accurate; it is the authority §4's home-2 row should cite. **RATIFY.**
- **`UI-Architecture-and-Layout.md:157-158`** — "the Tailwind theme is DERIVED, never hand-authored…
  freshness is machine-enforced". **RATIFY.**

## C-12 · The owner's two rulings, applied

- ***"The design doc is the source of truth and everything references it."*** Applied throughout: C-5, C-6
  and C-7 replace paraphrases with pointers to §4, and §4 gains the `tiers.css` row so it is complete enough
  to BE the pointer target. **Standing recommendation:** §4 is the one home for the CSS stance; every other
  doc cites it.
- ***"No D-number for a rule that belongs in the constitution."*** **The paint law should NOT get a D-row.**
  It is a rule every agent needs on every UI dispatch, and the constitution is injected on every dispatch
  while the ledger is looked up. **Recommendation:** add ONE line to `AGENTS.md` §0.2 (the "shape you're
  working in" block) pointing at §4, and leave §4 as the detail home. Draft line, **CONFIDENT**:

> * **CSS has SIX homes and a feature is not one of them** — the token vault, the generated theme, ui's
>   globals, the density-tier map, the client's globals, and the ONE structural shell file. Every reusable
>   portable VALUE is a conformant DTCG token; nonportable generated values use the vault's validated vendor
>   extension; every component SKIN is a `tv()` variant; every LAYOUT is a `@orb/ui` primitive.
>   The closed set with the WHY for each: `client-architecture-lockdown.md` §4.

D150's repair (C-2) stays a D-row edit because it is a correction to an existing ruling, not a new rule.

---

# PART 7 — THE ENFORCER SWEEP (deliverable D): reach, bite, and blind spot, per enforcer

The original population was derived from the base registry: 233 gate files, 46 mentioning CSS/class/style/
Tailwind/token, and 27 classified as styling enforcers, plus dep-cruiser, Biome, ESLint, Vitest, CT, and the
two dead-class instruments. That count is historical; this reconciliation did not run a fresh classification
and therefore does not invent a current total. Rows below carry dated implementation status where work has
landed. **Historical reach was quoted from source; “bites” was answered by conformance arms or an explicitly
planted control.**

| enforcer | tier | REACH (receipt) | bites? | structurally blind to |
| - | - | - | - | - |
| `feature-css-files` (historical) → `sanctioned-css-homes` at `9b0e6debb` + `fee25f89b` | gate | old: `packages/client/src/features/**/*.css`; current: exact six homes + recursive package CSS inventory including dot paths | old gap reproduced; first commit cold-refuted; follow-up controls 8/8 green and independently confirmed; #921 closed | generated directories are excluded by exact name; symlink semantics remain outside the declared regular-file/path-identity contract |
| `no-raw-color-in-css` | gate | `packages/{ui,client}/src/**/*.css` (`:70`) — the FULL CSS surface | mustFlag+mustPass | non-colour values; a colour whose `var()` chain resolves to nothing |
| `motion-token-purity` | gate | `packages/{ui,client}/src/**/*.css` (`:101`) | mustFlag+mustPass | motion in TS/inline (covered by `no-off-token-inline-style`); `linear`/`0s` legal by design |
| `css-length-tokens` (#955) | gate | `shell.css` declarations/queries + #961-resolved static class carriers across `packages/{client,ui}/src` | 4 mustFlag + 2 mustPass; focused conformance 8/8 | runtime-assembled class strings; declared viewport/query/ratio/measurement mechanics are count-pinned allowances rather than blind skips |
| `css-selector-has-a-writer` (#956) | gate | the five sanctioned stylesheets' 68 non-utility class + 112 data-selector identities against semantic writers and exact vendor contracts | focused 18/18; Base UI manifest/installed 75/75 with zero drift; #965 bounded the shared collector at 19.3s/3.48 GB; grouped 242/242 barrier green | opaque dynamic values cannot satisfy exact/prefix selectors; HAST evidence is limited to exact element records |
| `no-color-literals` | gate | `packages/{client,ui}/src` (`:54`) | mustFlag+mustPass | runtime-ASSEMBLED class strings |
| `no-arbitrary-tw-values` | gate | `packages/{client,ui}/src` (`:110`) | mustFlag+mustPass | token-driven bodies (`var()`/`calc()`) legal by design |
| `no-off-token-radius-shadow` | gate | `packages/{client,ui}/src` (`:121`) | mustFlag+mustPass | `packages/client/src/features/preset/**` structurally excluded (declared) |
| `no-off-token-inline-style` | gate | `packages/{client,ui}/src` (`:192`) | mustFlag+mustPass | DYNAMIC values deliberately not flagged (declared) |
| `no-hover-display-swap` | gate | `packages/{client,ui}/src` (`:188`) | mustFlag+mustPass | runtime-assembled strings; hand-authored CSS (both declared) |
| `no-raw-spacing-in-features` · `no-raw-typography-in-features` · `no-raw-z-index` · `class-token-splice` · `theme-override-only-via-scope` | gate | `/packages/(client\|ui)/src/` (SCOPE_REGEX) | mustFlag+mustPass | historical: `no-raw-z-index` did not check the token existed (F4); #940 now checks semantic z-vars in JSX and exported literals plus 7/7 vault parity. Dynamic substitutions remain outside the exact-literal claim |
| `no-media-queries-in-features` · `no-raw-container-widths` | gate | `{client,ui}/src` minus `features/app-shell/` (`:37-42`) | mustFlag+mustPass | `.css` files (they are not TS) |
| `no-pointer-variants-in-features` | gate | `packages/client/src/features/` (`:87`) | mustFlag+mustPass | `packages/ui/src` (by design — ui is the token layer) |
| `no-raw-interactive-intrinsics` | gate | `packages/client/src/features/**` **and `.tsx` only** (`:80`) | mustFlag+mustPass | `.ts` files that build elements |
| `ui-size-via-variant` | gate | `packages/{client,ui}/src` (`:294`) | mustFlag+mustPass | 12 allowlisted rows (declared) |
| `ui-skin-fragment-purity` · `ui-accname-survives-spread` | gate | `packages/ui/src/` only (`:71`, `:110`) | mustFlag+mustPass | client-tier composition |
| `ui-primitive-structure` | gate | `packages/ui/src/primitives` | 6 mustFlag + 2 mustPass | — |
| `baseui-state-data-attributes` | gate | `UI_SRC` (`:175`) | mustFlag+mustPass | one MEASURED false positive, kept as a written limit (`:203`) |
| `density-tier` | gate | parses `tiers.css` AT RUN TIME so it can never police a stale copy | 1 mustFlag + 2 mustPass | — |
| `over-art-plate-arm` | gate | `scanRoot: () => false` — a whole-project stylesheet arm, ratchet-rowed | mustFlag+mustPass | — |
| `scroll-container-positioned` · `surface-in-a-container` · `no-floorless-control-in-wrap` | gate | `{client,ui}/src` / features surfaces | mustFlag+mustPass | — |
| **#949 compiler parity + `ui-tailwind-variants-runtime-seal`** | compiler/resolve/unit | sole `createTV`, one Orb merge, compiler-positive governed families, production Oxide roots | focused parity 7/7, merge/token 107/107, dependency 65/65 | explains class-list merge only; browser cascade remains #950 |
| **biome `noRestrictedImports`** | lint | bans named `cn`/`cnMerge`/`tv` from `tailwind-variants` repo-wide | rule | same |
| **`suppressions` + Biome file-wide directives (#962)** | gate + lint | current gate governs `packages/*/src`, `tooling/src`, and `scripts`; exhaustive literal census separately covers authored source/tests | current ratchet has both-ways file budgets, but `tests/**` is deliberately outside its reach | 70 files currently carry 74 `biome-ignore-all` directives; test blankets are invisible to the ratchet, and a stale staged blob can differ from the clean working copy. #962 closes both holes and permits no blanket baseline |
| **eslint compose-only keystone** | lint | `files: [CLIENT_SRC]`, ignoring `features/app-shell/**`, `state/**`, `lib/weave-glyph.tsx`, `**/*.test.{ts,tsx}` — §4's description is ACCURATE | rule | `packages/ui/src` (by design — ui IS the painter) |
| `tests/ui/styles/css-structure.suite.test.ts` | vitest | the five authored files, by literal assertion (theme enumeration · the unlayered floor · the light block's `color-scheme` · BLUR_SURFACES sync · the reduce/contrast arms' source order and conditions · the 48rem four-way agreement · the reading-scale `, 1` fallbacks) | — | only what it enumerates; the dark-variant arm is **one-directional (F7)** |
| `tests/ui/lib/class-merge.test.ts` + `css-merge-parity` | vitest/integration | every compiler-positive governed family plus TV ordinary/slot paths and bounded replay | 107/107 merge/token + 7/7 parity | does not claim browser cascade attribution |
| `tests/ui/tokens/index.test.ts` | vitest | re-runs the codegen and diffs the committed artifacts | — | — |
| `tests/ui/content/theme-scope/palette-contrast.suite.test.ts` + `tests/kit/theme-derivation/accepted-base-foreground.suite.test.ts` | vitest | every seed value-set × polarity at the text/pill floors; #939's seed/custom chart-host, spelling/alpha/gamut, planted-failure, and pair-distance matrices; #969's actual per-surface foregrounds, input composites, reading plate over both art extremes, exact `.62`/`.6201` bases, and a 2,060-sample L/chroma/h matrix with nonzero unsafe-ramp/input controls | — | rendered ECharts and exact control pixels are intentionally proved separately in CT |
| `tests/ui/touch-target-floor.suite.ct.tsx` | CT | coarse-emulated, per-pointer | — | — |
| `snap --dead-css` | instrument | live DOM classList vs compiled CSSOM, per drive | — | **"does the VALUE resolve" and "which class won" (F10)**; and **no floor consults it** |
| `motion-dead-class-flagger` (`[css]`) | instrument | live, MutationObserver-scoped, batched, confirm-before-report | — | same, plus **dev-only** — no watcher on the shipped build |

**The owner's specific suspicion — "peculiarities with tailwind variants and ordering shenanigans" — was
real and #949 is the integrated class-list answer.** `class-merge.ts` is the sole configured merger and
`createTV` caller; Tailwind compilation plus production Oxide roots govern emitted families; aspect/blur/ease
are registered; occurrence-aware replay reports the final class-list winner. The remaining question is not a
second merge hole: it is #950's final browser cascade attribution.

---

# PART 8 — HISTORICAL VERIFIED-CLEAN SCOPE AT `28d526c99`

**Read in full, every line, no sampling:** all five authored CSS files (3,169 lines);
`client-architecture-lockdown.md` §4; `class-merge.ts`; `resolve-theme-scope-tokens.ts`; `shell-topbar.tsx`;
`region-anchor.tsx`; `dead-css.ts`; the relevant regions of `app-shell.tsx`, `clamp.ts`,
`appearance-boot-hint.ts`, `live-token-resolver.ts`, `appearance-sizing-section.tsx`,
`character-hero-band.tsx`, `preset-editor-header.tsx`, `chat-header.tsx`, `context-rail.tsx`,
`modal-host.tsx`, `eslint.config.js`, `.dependency-cruiser.cjs`, `css-structure.suite.test.ts`,
`class-merge.test.ts`, and 27 gate descriptors.

**Regions I did NOT read in full, declared:** the bodies of the 27 gate files beyond their reach declarations
and conformance-arm counts; `tests/ui/styles/css-structure.suite.test.ts` beyond its test titles and the
assertions I cite; `docs/architecture/proposed/ui-cohesion-north-star.md` beyond its header and §0 (it is a
program doc, and F6/C-4 is about its status, not its content).

**Selector reach — historical live drive plus textual source sweep:** 312 selectors extracted comment-
stripped, 308 queryable, driven against seven surfaces; class and `data-*` names were textually traced across
7,189 files. This supports the base audit only. Current semantic coverage is #956's 68 class and 112 data-
selector identities; it must not be replaced by the older “every writer” overclaim.

**Colour:** zero raw colour literals in any of the four hand-authored files, verified two ways plus the gate.

**Motion:** zero raw durations or easings in any authored CSS.

**`@layer`:** zero blocks. The unlayered posture is intact.

**Checked and CLEARED (things that looked like findings and are not):**

- `[data-streamdown="code-block"]` — the vendor still emits the attribute AND the inline
  `contentVisibility:"auto"` in streamdown\@2.5.0's dist. The `!important` is still earned.
- The wide topbar identity's unmarked title — correct (the title there is the section label, not the artifact
  name, so the yield rule should not reach it; and it cannot collapse to 0 without `min-w-0`).
- The unscoped chip selectors inside `@container shell-main` — fenced by the at-rule, because the context
  panel is a DOM sibling of `.shell-main`.
- The `.scroll-fade-y` / `[data-slot="message-list-scroll"]` twin recipes — deliberate, documented, and each
  declares its own 0% defaults, which is what prevents an inherited stop from bleeding into a nested scroller.
- The four gradient-ring recipes — presence-mirroring with per-site alphas, cross-referenced in both
  directions. Not duplication.
- `.shell-grid[data-elevation="glow"] [data-slot="card-root"]` — live (`cardRootGlow: 1` at `--wide` under
  maximal). My earlier zero was a drive-coverage artifact, not a gap.
- The two `background-color: var(--color-background)` declarations on `:root` and `body` — standard canvas
  propagation, not a duplicate fact.
- `--art-bleed-peak`, `--contrast-edge-mix`, `--orb-skeleton-sweep-*` — declared and consumed within their own
  rule, or documented override seams. Not dangling.
- 22 of the 23 dangling-variable candidates — Base UI runtime properties, documented fallback seams, comment
  quotations, regex artifacts.

---

# PART 9 — UNCONFIRMED, LOW PRIORITY

One line each; none dressed as a finding.

1. **Ruled by #974:** the avatar hairline remains `.shell-grid`-scoped. A portalled Dialog owns its own
   polarity-aware popup backing rather than inheriting grid art treatment. Retain one rendered
   dialog-avatar-over-art acceptance pin so that deliberate scope cannot become an invisible regression.
2. **Ruled by #974:** `data-has-bg-image` has one production writer on `.shell-grid`. Its spellings encode
   different reach: bare selectors target grid descendants, `.shell-grid[...]` asserts grid identity, and
   the sibling combinator reaches the portal root. Do not normalize them into one spelling.
3. **Resolved initial race; one dynamic boundary remains:** #852's late-defined-silent and
   never-defined-reported CT controls exercise the initial drain. #953 must await `motionFlaggersSettled()`
   and reset checkpoint evidence before its first cell. A style injected after settlement still needs an
   explicit per-drain marker/barrier.
4. **Resolved by #957:** the deleted `ctx-tab-strip` entry was removed from the coupled gate vocabulary.
5. **Resolved by #939:** the permanent chart matrix covers every seed/polarity host, including Mocha, plus
   accepted custom-theme inputs and real ECharts fills.

---

# PART 10 — LESSONS WORTH ADDING TO THE SHARED MEMORY STORE

The orchestrator owns the write; these are offered in the store's own shape.

**Index line:** `- [enforcer encodes rule not proxy](enforcer-encodes-the-rule-not-a-proxy.md) — a gate scanning a DIRECTORY where the law names a TABLE is green about the wrong question`

> **Body.** `feature-css-files` claims "the full sanctioned-CSS-homes list — anything not on it is RED" and
> scans one directory glob; a planted control proved a `.css` file in `packages/ui/src` draws zero findings
> from the whole structure battery. The contrast case in the same tier is `@orb/kit/dead-css`, which owns the
> DEFINITION and serialises its regex SOURCE into its second consumer so two definitions cannot drift.
> **Why:** the difference is not effort — both are small — it is whether the enforcer's scan IS the rule's own
> vocabulary or a convenient shortcut to it. **How to apply:** when authoring a gate, write the rule's
> vocabulary down first (a closed set of paths, a token list, a slot map), then check whether your scan is
> that vocabulary or a proxy. A closed set also gets a stale-arm for free.

**Index line:** `- [a class that resolves can still be void](resolved-class-can-still-be-void.md) — deadcss/emptycss are both clean when a rule's var() names an undefined token`

> **Body.** `z-(--z-sticky)` on the modal header: Tailwind emits the rule, the rule is non-empty, `deadcss=0
> emptycss=0` — and `z-index` computes to `auto` because `--z-sticky` was never a token. **Why:** `var()`
> substitution happens at computed-value time, AFTER parsing, so an undefined property voids the declaration
> without touching either dead-class mode. **How to apply:** a dead-class clean is not a "the CSS is
> correct" verdict. For any `var(--x)` or `<util>-(--x)`, the question is whether `x` is DEFINED — a static
> sweep answers it. The original scratch probe did not survive and is not implementation evidence; rebuild
> the gate from current source with planted controls. Only a computed-style read answers "which of two valid
> classes won".

**Index line:** `- [density is grid-scoped, portals miss it](appearance-axes-split-html-vs-grid.md) — html-stamped axes reach portals; grid-stamped ones do not`

> **Body.** The appearance axes are stamped in two places: `html` gets blur/shadow/texture/colorization/
> justify/reduced-motion/theme + `--font-scale`; `.shell-grid` gets section/list-mode/context-mode/focus-mode/
> density/elevation/has-bg-image. The portal root is a SIBLING of the grid inside `<ThemeScope>`, so a
> grid-stamped axis never reaches a Dialog/Menu/Tooltip/Toast. Measured: at compact density a dialog resolves
> the comfortable `--spacing-*` floor. **Why:** `<ThemeScope className="contents">` wraps both the grid and the
> portal root; only it is an ancestor of both. **How to apply:** before adding a `data-*` appearance axis, ask
> which of the three elements must carry it, and remember `client/styles/globals.css:156`'s
> `~ [data-slot="portal-root"]` sibling combinator is the existing precedent for reaching overlays.

---

# PART 11 — LANE RECEIPTS

- **Branch base:** `28d526c99`. **Files changed by this lane:** this report only.
- **Shared-tree probes:** two `.css` control files planted and removed
  (`packages/ui/src/primitives/zz-cbcss-probe.css`, `packages/client/src/features/chat/zz-cbcss-probe.css`),
  plus one withdrawn probe at a gitignored `__probe` path. All announced to the orchestrator before planting
  and again after removal. **`git status --short` EMPTY before this report was written.**
- **Scratch artifacts** (gitignored, `reports/stickler/scratch/`): the selector extractor + its 312-row JSON,
  the reach sweep, the colour census, the raw-value census, the gate-reach extractor, the merge probe, the
  dangling-var sweep, ten in-page eval bodies, and the drive logs.

---

## Issue summary (paste verbatim into the linked issue)

**#918 census result and 2026-08-31 reconciliation.** The base-`28d526c99` audit found 13 confirmed findings
(severity ceiling P1), one refuted premise, and three self-caught instrument failures after reading 3,169 CSS
lines and driving 312 selectors across seven live surfaces. Those numbers remain historical evidence, not
HEAD measurements. Current main has five sanctioned stylesheets totalling 3,174 lines; `tokens.json` is the
sixth sanctioned home.

**Done:** #919/#930 repaired the paint law and D150; #921 enforces the exact six homes including dot paths and
regular-file identity; #936 migrated and enforces the DTCG 2025.10 contract; #937 carries viewer density at
the shared ThemeScope across grid and portals; #938 makes comfortable/compact symmetric; #939 makes every
seed and accepted custom-theme chart ramp contrast-safe; #940 fixes and enforces the semantic z vocabulary.

**#969 repair in this source revision:** accepted custom/carried bases have no refused lightness band.
Foregrounds are solved against their actual paint hosts; reading-plate and sidebar-accent gained paired
portable tokens; transparent action labels inherit the host ink; ST import no longer narrows the shared
ThemeOverride domain. A shared-host ramp delta or input alpha retracts only when the unmodified derived value
would make its documented foreground family mathematically infeasible; the authored base, dedicated accent
ramps, and theme domain remain exact. **#883's post-#969 framebuffer receipt closes the zero-margin hole:**
the legal/rendered floor stays 4.5; derived neutral ink aims at 4.6 capped by the authored anchor's physical
endpoint, and the same attainable target drives ramp/input projection. The 2,060-base analytic minimum is
4.5798 (+0.0798); pivot input pairs are 4.6127/4.6144. The closed all-seed host sweep forced one value move:
Mocha `muted-foreground` L 0.720→0.731 (quantized input/popover 4.430→4.6286). The current vault remains 187
base tokens / 290 base-plus-seed entries / 195 exact targets; generated `tokens/index.ts` is byte-identical,
and only that Mocha value changes in `theme.css`/`themes.gen.ts` beyond #969's two additive variables.

**Integrated and grouped-barrier graduated:** #951 family ownership; #952
custom-property resolution; #954/#961 single-polarity prevention on the shared static-class substrate; #955
length ownership; #956 semantic writers for 68 non-utility class identities and 112 data-selector identities;
\#957 stale-comment/coupled-residue repair; #959 production/Playwright CSS-topology derivation; #965 bounded
static provenance collection (1,195 owners, 1,583 sources, 1,745 evaluators, 68,517 dispatched nodes, 2,331
root evaluations, 19.3s, 3.48 GB max RSS, 42/42 focused). The graduation receipt is 242/242 structural
gates over 6,337 files with 965/965 CSS declarations, plus 64/64 affected tooling and 21/21 rendered tests.

**Merge versus cascade:** #949 is integrated and barrier-graduated with one Orb merge, exact Tailwind 4.3.3 compiler and
production-Oxide family parity, aspect/blur/ease coverage, sole-`createTV` enforcement, and bounded dev/test
`__orb.css` occurrence replay. It explains class-list losers and winners only. #950 is integrated and barrier-graduated
with the revision-pinned official DevTools frontend SDK: `CSSMatchedStyles.propertyState` supplies
browser-owned `Active`/`Overloaded` cascade attribution. Raw-CDP winner inference, mutation, UI scraping, and
a local cascade evaluator are rejected; its official-SDK runtime matrix is 3/3. #972 subsequently proved
413 `tv` observations in each static gate, leaving 508 genuinely opaque runtime observations and a zero
`cva` population. #975 repaired the cascade SDK denominator, Vite provenance, and closure to 479 resources /
9,853,687 bytes; all six live cascade queries returned structured nonzero results with zero unexpected
requests. #976 now accounts for 381 settled design subjects exactly and proves requested/resolved/actual
theme polarity, including a same-count mutation plant. #977 proves requested/applied/actual mobile identity,
both normal/reduced-motion nonzero populations, and refusal of a same-viewport counterfeit. #953 then
graduated at `78788014d`: `deadcss`/`emptycss` are consumed by the appearance-invariant floor, and the rated
matrix and its R1–R7 route verdicts are live.
