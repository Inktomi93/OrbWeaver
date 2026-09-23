---
kind: law
status: active
updated: 2026-09-20
---

# Authoring a mechanism-matched ui-audit rule

> THE law for `tooling/src/ui-audit/**` detector rules. Read this before adding, editing, or auditing a
> rule's SELECTOR MECHANISM. Owner ruling (2026-09-01, task #19): the discipline below is a **TABLE, not
> a gate** — a mechanism-match defect is a silent false-negative (a rule that never fires, not one that
> mis-fires), so there is no failing-test shape to enforce structurally; the table is the amnesiac-agent
> transfer of seven instances of the same defect class found in one day. Mirrors the shape of
> `tooling/src/verify/gates/GATE-AUTHORING.md` (the structural-gate law); read that doc's own header for
> why this repo writes law docs this way. Indexed from `docs/architecture/core/AGENTS.md` §7.

## The one-line question

Every detector rule answers a question about the rendered page by SELECTING something (a CSS selector
text scan, an attribute read, a computed-style read, a static `tv()`/class-string scan). Before a rule
lands, or before you trust one that already exists, ask: **does this rule's selector mechanism match how
THIS codebase expresses the thing it is looking for?** A rule can be logically correct and still be BLIND
— it never fires, the finding count looks clean, and nothing downstream distinguishes that from "no
defect exists." Blind is worse than wrong: wrong is caught by a red; blind is caught by nothing.

## The authoring checklist

1. **Name the expression mechanism ON THE TREE, with a receipt.** Don't assume the obvious CSS spelling
   (`:hover`, `rgb()`, a literal class string) is how this codebase actually authors the thing — grep or
   `pnpm ast` the real call sites and cite `path:line`. A vendor/library choice (Base UI's `data-*`
   state attributes instead of `:hover` — <https://base-ui.com/react/handbook/styling>) or a build-time
   transform (Tailwind's escaped `hover\:` class names, OKLCH color functions from the token vault) can
   make the "obvious" selector wrong for 100% of the real population.
2. **Plant a positive control in the codebase's OWN idiom.** Not a hand-written CSS snippet that happens
   to satisfy the rule's regex — the actual authored shape (a real `tv()` variant, a real `oklch()` token,
   a real `[data-highlighted]` selector) so the control proves the rule sees what ships, not what a
   simplified test fixture ships.
3. **Plant a negative in the NAIVE idiom** — the mechanism the rule does NOT use — to prove the rule does
   not accidentally also fire on/confuse itself with the adjacent spelling (an escaped Tailwind class
   containing the substring `:hover` inside its name is the canonical trap here, #24).
4. **State the withheld/excluded polarity.** A candidate the rule could not judge is `withheld` (evidence
   missing, still counted); a candidate proved out of scope is `excluded` (a closed reason, still
   printed). Neither is a silent zero — see `docs/design/983-984-ui-audit-population-semantics.md` for
   the full population-accounting contract these words carry.
5. **If the mechanism has more than one live spelling in this codebase (CSS pseudo AND a `data-*`
   attribute; an element's own paint AND its `::before`/`::after` layer), the rule owes ONE shared
   predicate for both** — never a second copy of the same regex hand-duplicated into a sibling census
   file (row 4 below is the paid lesson: the second copy silently missed the #24/#22 fix that landed on
   the first).

## The mechanism-match table

Every row below is a REAL defect that shipped and was later found on this tree (2026-09-01, the
detector-adapt program, tasks #18/#22/#24 + the 55-rule Base UI mechanism audit, task #21). Re-derive
each row from the code, not from this table, before citing it — the receipts are pinned to the commits
that fixed them and can drift.

| # | What the rule looks for | How this codebase expresses it | The naive mechanism (blind) | The matching mechanism (landed) | Code receipt | Doc/memory pointer |
| - | - | - | - | - | - | - |
| 1 | An authored color (contrast, gradient stops, backdrop fills) | `oklch(0.72 0.175 52)` — every color token in the vault is OKLCH, never `rgb()`/hex | A regex over `rgb()`/hex substrings only | Paint the CSS value into a 1×1 canvas (`fillStyle`) and read back un-premultiplied RGBA — accepts every color function the browser understands, incl. OKLCH/color-mix | `tooling/src/ui-audit/ops/walker/resolve.ts:11-49` (issue #188 — measured: the home resume card's 3px oklch accent edge produced zero findings under the old regex) | memory `oklch-kills-rgb-regex-probes` |
| 2 | A chromatic glow (`box-shadow`/`text-shadow`/radial wash) | The house pattern is a dedicated `::before`/`::after` pseudo layer, not paint on the element itself (`checks-decor.ts:186`, "DEDICATED pseudo layer … on selected/active carriers") | `getComputedStyle(el)` on the element only | `getComputedStyle(el, "::before")` / `"::after"` swept alongside the element read | `tooling/src/ui-audit/ops/walker/census-glow.ts:1-18` | `docs/design/state-paint-census.md` (archived) |
| 3 | Interaction/selection paint (hover, pressed, selected, checked…) | Base UI (the app's only interactive-primitive vendor) never sets `:hover`/`:active`/`:checked` for its own state — it sets a JS-driven `data-*` attribute (`[data-highlighted]`, `[data-selected]`, …) the consumer styles | A stylesheet-text scan for the literal substring `:hover` | A shared predicate that recognizes BOTH the `:hover` pseudo AND the classified `data-*` state-attribute vocabulary, then forces each mechanism the way it is actually driven (CDP `:hover` vs. synchronous in-page `setAttribute`) | `tooling/src/ui-audit/ops/walker/state-paint.ts:11-16,29-73` + `ops/hover-walker.ts:11-44` (tasks #18/#22) | `docs/design/state-paint-census.md` (archived) |
| 4 | The SAME state-paint question, asked a second time in a sibling census | Identical to row 3 — this is the same vocabulary, re-implemented | `census-decor.ts`'s animated-`<img>`-on-hover scan hand-duplicated the bare `/:hover/i.test(rule.selectorText)` string test instead of importing the shared predicate — so fixing row 3 in `hover-walker.ts` alone left this second copy blind | Route through the SAME `hasStateHover`/`stateAttrAnywhere` predicate from `state-paint.ts`, not a re-derived regex | `tooling/src/ui-audit/ops/walker/census-decor.ts:180-218` (line 208: `hasStateHover(rule.selectorText) \|\| stateAttrAnywhere(rule.selectorText)`) | `cb-baseui-rule-audit.md` finding #2 (task #21 scratchpad) |
| 5 | Glow gated behind a transient interaction state (`data-highlighted:before:shadow-glow`) | The sanctioned glow carrier (row 2) is frequently ALSO state-gated (row 3) — a `data-pressed`/`data-highlighted` glow is genuinely pointer/keyboard-transient and invisible to any single static DOM read, exactly like `:hover` | A single-pass census at rest state only — a state-gated glow reads as "no glow" because the attribute isn't set when the walker runs | Read glow rows (element + pseudo layers) WHILE the subject is held under the same forced-state pass as row 3, and emit only what the state CHANGED over the rest snapshot | `tooling/src/ui-audit/ops/hover-walker.ts:36-39` ("GLOW RIDES THE SAME FORCES") + `ops/walker/census-glow.ts:6-14` | `cb-baseui-rule-audit.md` finding #4 |
| 6 | Whether every `tv()` variant ARM of a component (not just the arm that happens to render on a visited surface) fails its own rules | `packages/ui`'s ~40 `variants.ts` files declare their axis/value space on the `tv()` object itself (`.variants`/`.variantKeys`, tailwind-variants 3.2.2) | A live/`design-audit` page walk judges only whichever arms happen to be rendered on the surfaces it visits — most arms of most components never render on any audited surface | Derive the full arm space AT RUNTIME from the `tv()` objects themselves (never a static source-text/`ts-morph` re-derivation — `as-const satisfies` blinds that method) and render/judge every arm in isolation | `tests/ui/variant-arm-matrix.def.ts:1-30` (header is the durable design artifact for the whole suite family) | memory `as-const-satisfies-blinds-ts-morph-initializer` |
| 7 | The `:hover` pseudo-class inside authored selector text | Tailwind mints class NAMES containing escaped variant colons — `.dark\:hover\:bg-neutral-700:hover` — where the literal substring `:hover` also appears INSIDE the class name, not just as the trailing pseudo | A bare `/:hover/` test/strip matches inside the escaped class name too, and stripping it mangles the selector into one `querySelectorAll` throws on | A negative-lookbehind regex requiring the preceding character not be a backslash (`(?<!\\):hover(?![-\w])`), applied consistently to every `:hover` test AND strip, plus the identical discipline for `::before`/`::after` pseudo-element detection | `tooling/src/ui-audit/ops/walker/state-paint.ts:18-24,29-37` (issue #24 — measured: 25 unparseable selectors on the isolated config stage, 19 of them this bug) | — |
| 8 | A control's ACCESSIBLE NAME (`aria-name`, and the door census's name key) | The whole accname source set, including the one HTML has always used: a `<label for=id>`, or a `<label>` wrapping the control | Reading only the attributes and text ON the element — `aria-label`, `aria-labelledby`, own text, `title`, `alt` — which classifies a correctly `<label for>`-named control as unnamed | `el.labels`, the BROWSER's own association list: it knows both spellings, and knows a `for=` pointing at another id is not an association. Deliberately NOT `closest("label")`: for a non-labelable element HTML declares no association, so the finding there is TRUE and silencing it would trade a false positive for a false clean | `tooling/src/ui-audit/ops/walker/census-interactive.ts` (`nativeLabelText`) + `lib/checks-a11y.ts` `checkAccessibleName`; four-arm proof in `tests/tooling/ui-audit/ops/walker/census-interactive.int.test.ts` (#1009) | This file's checklist step 1 — the dispatched "real site" was NOT one (Base UI belts every association with `aria-labelledby` as well), so the row closed a LATENT class; re-derive a claimed live instance before repeating it |
| 9 | WHICH element owns a state the rule is asking a relational question about (selected/checked/pressed/current) | A Base UI component publishes its state vocabulary on EVERY PART, not only on the root that owns the decision: `Radio.Indicator` republishes the root's `data-checked`/`data-unchecked` and `Switch.Thumb` republishes the switch's, while only the ROOT carries the ARIA state (`role=radio` + `aria-checked`) | "carries a state attribute ⇒ is a state carrier" — which promotes a presentation part to a candidate. `Radio.Indicator`'s `keepMounted` defaults to FALSE, so the part EXISTS ONLY WHILE CHECKED and forms a permanently one-sided cohort that WITHHOLDS forever; `Switch.Thumb` (always mounted) instead judges its root's cohort a second time for one authored decision | The ARIA state is the ownership tell, not the nesting: a carrier with NO `aria-checked`/`aria-selected`/`aria-pressed`/`aria-current` of its own whose NEAREST state-carrying ancestor asserts the SAME state kind is that ancestor's presentation — `excluded` (closed, printed, still in the denominator), never `withheld`. A nested control that owns its own aria state stays its own cohort | `tooling/src/ui-audit/ops/walker/census-selection.ts` (`isNestedStatePart`) + <https://base-ui.com/react/components/radio> (Root vs. Indicator data-attribute tables); three-direction proof in `tests/tooling/ui-audit/ops/walker/census-selection.int.test.ts` (#1150) | Measured, not latent: this single withheld cohort made EVERY Settings design-audit print `population-verdict=NO-VERDICT`. `quiet-state` (`census-region.ts`) closed its half in #1155 with one nuance — that rule ranks PAINT, so a part mounted in BOTH states (`Switch.Thumb`) paints two real fills and keeps its judged cohort; only a ONE-SIDED all-parts cohort is `excluded(nestedStatePart)` |
| 10 | The paint UNDERNEATH an element, for a rule that ranks the element's OWN fill (quiet-state's loudness ordering) | One walk, `resolveBackdrop(el)`, answers "what is behind EL's box" — including el's own background when it has one | Handing that walk the element's PARENT to skip its own fill. It reads the right colour and the WRONG BOX: the paint-layer veto then runs against the PARENT's rect and the PARENT's subtree, so the carrier's own indicator and any sibling that never touches the carrier both count as paint between it and its base. A layer that FOLLOWS the subject in document order is also counted, though CSS paints it ON TOP of the subject | `resolveBackdropUnder(el)` — the same walk from the parent, measured against EL's box, ignoring layers inside el and layers that paint over it (auto z-index + document order; an explicit z-index keeps the veto rather than guessing a stacking context). `resolveBackdropAt(el)` is the container flavour for a paint-context partition KEY | `tooling/src/ui-audit/ops/walker/resolve.ts` (`resolveBackdropFrom`/`resolveBackdropUnder`/`paintsOverSubject`); four-direction proof in `tests/tooling/ui-audit/ops/walker/census-region.int.test.ts` (#1155) | Measured live on Settings -> Appearance (2026-09-02): ALL THREE surviving `quiet-state` cohorts read `unresolved(paint-layer-over-base)` — off the checked cell's own `Radio.Indicator` and off the `⋯` row-menu chip painted over the cell — which alone held every Config audit at `population-verdict=NO-VERDICT` |
| 11 | A DECORATIVE TELL on an element that is a PICTURE OF that tell (the illustrated pickers' art) | `@orb/ui`'s PickerCell is the one anatomy every single-choice picture picker wears, and its `[data-slot="picker-cell-art"]` aperture holds a DIAGRAM of a design: the chat-style cells render mini transcript lines in each skin's own classes and inherit that skin's 3px accent through `stripeOf`; the density and elevation cells draw their axis the same way, and the theme LOOKS picker's `ThemeMiniSurface` swatch paints a card with the theme's own radius and hairline (a theme swatch is a picture of a design too) | Judging every censused carrier — the diagram is a real element with a real computed border, so the accent-border rules fire on it and report 4 findings that describe the PICTURE and no surface a user reads | A per-candidate CONTEXT FLAG on the sample (`artPane`), derived in the walker by `closest()` on the SHARED slot and consumed as a named `excluded(illustratedPickerArt)` in the checker — so the sample stays in the denominator, ALL FOUR illustrated pickers ride ONE row (`<RadioGroupPickerItem art=…>` is the only door into the aperture; ast-grep finds exactly four, 787 tsx scanned 2026-09-05: chat style, density, elevation, theme looks), and the identical stripe outside an aperture stays judged. The aperture renders unconditionally and `closest()` matches SELF, so the aperture element sits inside its own exemption — no over-reach, its `art` recipe declares no border and never enters a border census | `tooling/src/ui-audit/ops/walker/core.ts` (the `[data-slot='picker-cell-art']` selector `core.ts` publishes into every census segment (a `var` inside the raw-JS segment string, not a workspace declaration)) + `ops/walker/census-decor.ts` (`artPane`) + `lib/checks-decor.ts` (`checkAccentBorder`/`classifyAccentBorder`); both-directions fixture proof in `tests/tooling/ui-audit/ops/walker/census-decor.int.test.ts` (#1642) | memory `allowance-minted-on-one-half-of-a-shared-vocabulary` — mint the exemption on the VOCABULARY, never on the one consumer that reported it |
| 12 | An ACCENT EDGE on a card (`side-tab` / `border-accent-on-rounded`) | Two spellings, and the one the tree reaches for most is a `::before`/`::after` BAR — absolutely positioned, filled with a token colour, pinned to one edge — not a `border-*-width` (`packages/client/src/styles/globals.css:84`; live: `[aria-label="Tags"]::after`, 3px x 252px `oklch(0.72 0.175 52)` on a 10px-radius card) | Reading the element's own four border widths only. It publishes `candidates=0 judged=0 affected=0 withheld excluded` on the exact surface carrying the banned edge, which is indistinguishable from clean — and the same run's positive control (`candidates=1` on Appearance) proves the collector is alive, not dead | A second collection channel into the SAME family and the SAME `AccentBorderInput`, so ONE checker judges both: a pseudo layer thin on one axis, spanning >=60% of the host on the other, pinned to that edge, with a background COLOUR (never the image channel — the CTA/active-tab gradient RING carries its paint as `background-image` and would otherwise be convicted wholesale). Every context flag is read off the HOST, so the ratified exemptions (row 11 included) reach the new channel the day they land | `tooling/src/ui-audit/ops/walker/census-accent.ts` (`accentBarSide`); three-direction proof in `tests/tooling/ui-audit/ops/walker/census-accent.int.test.ts` (#1103) | Measured: 2026-09-02 F12 + its Instrument Delta. The repair OPENS a channel, which is when a ratified exclusion is most likely to be silently re-opened — #1151 was the standing row for exactly that, and it stayed closed only because the flags ride the host |
| 13 | The RENDERED ANATOMY of a component's instances (`cohort-anatomy`'s height spread) | Some `data-slot` carriers are INLINE TEXT RUNS with no box of their own — `@orb/ui`'s markdown emits one `span[data-slot="dialogue"]` per quoted run inside a paragraph (`packages/ui/src/markdown/dialogue-paragraph.tsx:54,71`) | `getBoundingClientRect().height` on any censused carrier. On a `display: inline` element that is the UNION of its LINE BOXES, i.e. a wrap count: one cohort reported 69/45px desktop, 45/21px Light and 21/45px mobile-coarse for byte-identical markup — the majority and the minority TRADE PLACES between arms, which no anatomy defect does | A computed-`display` fence at collection: a member whose display is exactly `inline` is a boxless run, and a cohort whose members are ALL boxless is `excluded(inlineTextRun)` — counted and printed, never dropped. Read the DISPLAY, not `getClientRects().length > 1`: a single-line inline run is equally unmeasurable, and letting the wrap count decide whether the rule can see the cohort is the same bug one level up. `inline-block`/`inline-flex` own a box and stay judged; a MIXED cohort stays judged too, because one member rendering inline beside box siblings IS the divergence this rule exists to say | `tooling/src/ui-audit/ops/walker/census-cohort.ts` (`inlineRun`); both-directions proof in `tests/tooling/ui-audit/ops/walker/census-cohort.int.test.ts` (#1703) | The tell that this is a MECHANISM defect and not a threshold one: the verdict inverted between arms. A finding that changes sign with the viewport is measuring the viewport |
| 14 | WHETHER TWO CONTROLS SHARING A NAME ARE ONE VERB (`duplicate-action-door`) | The app assigns jobs to REGIONS: `nav[aria-label=Primary] > button "Chats"` navigates the app, while `#context-cell-chats` inside `toolbar "Character"` repaints the context region with that character's chats (`docs/architecture/core/UI-Architecture-and-Layout.md` §4.1-4.3) | Pairing on (role, accessible name) plus a structural PATH. Two regions doing two jobs under one noun read as one verb with two homes, and the rule's own remedy — give the verb one home — would delete the view switcher | The ARIA container role is the tell: a door whose nearest `role="toolbar"` ancestor holds >=2 sibling cells is a VIEW SWITCH and leaves this rule's population as `excluded(viewSwitchCell)` (counted, printed). Scoped to `role="toolbar"` and no wider — the same rule's list-row-against-shelf findings are a RULING (#1662, ruled DIFFERENTIATE), not a fence, and must keep firing | `tooling/src/ui-audit/ops/walker/census-interactive.ts` (`doorToolbarHome`) + `lib/checks-quality.ts` (`isViewSwitchCell`); two-direction proof in `tests/tooling/ui-audit/ops/walker/census-interactive.int.test.ts` (#1705) | The two fixtures differ by the `role="toolbar"` ATTRIBUTE ALONE — the door path is position-free and carries no role — so the negative arm is a true control rather than a differently-shaped document. When a fence keys on one attribute, make the control vary only that attribute |

## The per-rule mechanism census (one row per registered rule)

The table above is the DEFECT class list — fourteen mechanism mismatches that shipped. This one is the
DENOMINATOR: every id in `tooling/src/ui-audit/contract/rules.ts`, what its candidate selection actually
reads, where that selection lives, and whether a PLANTED RENDERED positive proves the selection sees the
thing (#1807, from #999 item 3). Derived from the tree 2026-09-06 — re-derive before citing, and re-derive
the whole table when the registry grows.

**Read the last column exactly as written.** Every rule already owns an executable firing proof and a
nearest-neighbour silence proof — the `design-audit-rule-proof` gate makes a missing one RED, so
"none — owed" NEVER means "unproved verdict". It means the only proof is CHECKER-LEVEL: a hand-built
input object handed to the pure `checks-*.ts` function, which proves the THRESHOLD and says nothing about
whether the census can see the shape on a real page. That is precisely the blindness this document
exists to name (checklist step 2: the control must be planted in the codebase's own idiom), so an
"owed" cell is a real gap in the mechanism axis, filed as such and not backfilled with an invented
receipt. Of the 63 registered rules, 47 carry a planted rendered control, 15 are owed one, and
`off-grid-transform` is half-owed (its withheld arm is planted, its firing arm is not). One of the 22 —
`buried-raster` — is owed BY OWNER RULING rather than by omission; its cell says so.

Shorthand for the collection sites: `w/<file>` = `tooling/src/ui-audit/ops/walker/<file>.ts` (the in-page
census that builds the sample), `lib/<file>` = `tooling/src/ui-audit/lib/<file>.ts` (the Node-side
verdict), `T/…` = a test path under `tests/`. Rules whose sample array is filled by one census and judged
by one checker share a row; the two accounting-only rules (`reveal-coverage`, `canvas-ink`) emit no
Finding at all and their control is the printed population row.

| rule | what its candidate selection READS | collection site | verdict site | planted RENDERED control |
| - | - | - | - | - |
| tap-target | offered interactive controls, extent from a compositor `elementFromPoint` ring probe (not the border box) | `w/census-interactive` + `w/hit-extent` + `w/target-identity` | `lib/checks-a11y` | `T/tooling/ui-audit/ops/walker/hit-extent.int.test.ts` · `target-identity.int.test.ts` · `T/tooling/design-audit-walker.ct.tsx` |
| reveal-coverage | rest-hidden reveal clusters (opacity 0 at rest, real geometry) — accounting only, never a Finding; `excluded(restHiddenReveal)` since #2468, because the fine REST regime does not offer them and the coarse one judges them directly | `w/census-interactive` | `lib/collect-families` (census row) | `T/…/census-interactive.int.test.ts` (excluded row + its keeps-the-verdict assertion + its silent twin) |
| control-aspect | offered controls' rendered w/h ratio against the role's silhouette | `w/census-interactive` (`controlAspects`) | `lib/checks-a11y` | `T/tooling/ui-audit/index.int.test.ts` (planted 1.09 aspect + shipped 64x44 twin) |
| obscured-target | a painted element whose OWN centre hit-tests to a local neighbour (`ownsPoint`) | `w/obscured-reach` (split out of `w/census-collision` at #2491) + `w/census-occlusion` | `lib/checks-a11y` | `T/…/obscured-reach.int.test.ts` · `index.int.test.ts` · walker CT |
| aria-name | presence of any accname source, keyed spec-order (`aria-labelledby` before `aria-label`, plus `el.labels`) | `w/accessible-name` + `w/census-interactive` | `lib/checks-a11y` | `T/…/census-interactive.int.test.ts` (four-arm, #1009) |
| border-contrast | a control's DECLARED border colour vs `resolveBackdropUnder(el)` (WCAG 1.4.11) | `w/census-border` | `lib/checks-border` | `T/tooling/ui-audit/index.int.test.ts` (1.1:1 boundary + its 3:1 twin) |
| landmark-missing | presence of a `<main>`/`role=main` landmark on the document | `w/census-interactive` (`mainLandmarkPresent`) | `lib/checks-a11y` | `T/tooling/ui-audit/index.int.test.ts` (both directions) |
| tabindex-positive | `[tabindex]` attribute values > 0 on visible elements | `w/census-interactive` | `lib/checks-a11y` | `T/tooling/ui-audit/index.int.test.ts` (#1826, both directions) |
| skipped-heading | the document's `h1…h6` order | `w/census-quality` | `lib/checks-a11y` | `T/…/census-quality.int.test.ts` |
| unreachable-hint | visible `[data-base-ui-tooltip-trigger]` (the VENDOR's own identifier, absent on a disabled trigger) + `@orb/ui`'s published `data-tooltip-describes` decision, the trigger's resolving description, its own text and its `aria-haspopup="dialog"` press door | `w/census-interactive` (`unreachableHints`) | `lib/checks-a11y` | `T/tooling/design-audit-walker.ct.tsx` (the REAL `<Tooltip>` in all three seal decisions) · `T/tooling/ui-audit/index.int.test.ts` (fires / excluded / withheld, `--mobile`) |
| text-over-art | text whose backdrop resolves to a gradient/image, judged at the WORST stop | `w/census-text` + `w/resolve` | `lib/checks-color` | walker CT (`oklch-gradient-bled`, P0 worst-stop) |
| contrast | every text node's composited foreground vs `resolveBackdrop` (canvas-normalised, any colour space) | `w/census-text` + `w/resolve` | `lib/checks-color` | `T/tooling/ui-audit/index.int.test.ts` (planted 1:1) · `census-text.int.test.ts` · walker CT |
| hover-contrast | the same pair measured under a FORCED state (CDP `:hover` + Base UI `data-*`) | `ops/hover` + `w/state-paint` + `w/group-variant` | `lib/checks-hover` | `T/tooling/ui-audit/index.int.test.ts` (real forced hover) · `ops/hover-walker.int.test.ts` |
| inactive-control-legibility | text inside a control the shared `INACTIVE_KIND_EXPR` classifies inactive | `w/census-text` | `lib/checks-color` | `T/…/census-text.int.test.ts` |
| gray-on-color | neutral ink over a chromatic fill | `w/census-text` | `lib/checks-color` | **none — owed** (checker-level only) |
| border-accent-on-rounded | an accent edge on a rounded card — BOTH spellings: own `border-*-width` AND a pinned `::before`/`::after` bar | `w/census-accent` | `lib/checks-decor` | `T/…/census-accent.int.test.ts` · `census-decor.int.test.ts` · walker CT |
| side-tab | same census, the one-edge flavour | `w/census-accent` | `lib/checks-decor` | same as above |
| glow-shadow | chromatic box/text-shadow on the element AND its pseudo layers, at rest and under force | `w/census-glow` + `w/state-paint` | `lib/checks-decor` | `T/…/census-glow.int.test.ts` · `state-paint.int.test.ts` |
| distorted-image | rendered box aspect vs natural raster aspect, gated on the `object-fit` keyword (`<img>`) or `background-size` disposition (background-image) | `w/census-text` (`images`) | `lib/checks-media` | `T/…/census-text.int.test.ts` (#1825, background-size auto vs. explicit-stretch) |
| canvas-ink | visible `<canvas>` elements — accounting only, always `excluded(canvasPaint)` | `w/census-collision` | `lib/collect-families` (census row) | `T/…/census-collision.int.test.ts` (both directions) |
| broken-image | `<img>` with an empty `src` or `naturalWidth === 0` after load | `w/census-text` | `lib/checks-media` | `T/tooling/ui-audit/index.int.test.ts` (#1826, both directions) |
| radial-halo | a radial-gradient wash's colour stops (canvas-normalised), fade-out shape + chroma | `w/census-glow` (`radialGlows`) | `lib/checks-ornament` | **none — owed** (checker-level: `T/…/lib/css-color.test.ts` proves the colour-space arm, not the census) |
| radial-spotlight-glow | the same wash census, low-alpha flavour | `w/census-glow` | `lib/checks-ornament` | **none — owed** (as above) |
| stripe-background | `repeating-linear-gradient` in `background-image` | `w/census-decor` (`bgPatterns`) | `lib/checks-ornament` | **none — owed** |
| grid-line-background | ≥2 `linear-gradient` layers + a ≤200px `background-size` tile | `w/census-decor` | `lib/checks-ornament` | **none — owed** |
| icon-tile-stack | a heading's previous element sibling: box, fill/border, radius, an icon child | `w/census-decor` | `lib/checks-ornament` | **none — owed** |
| layout-transition | authored `transition-property` naming a layout property | `w/census-decor` (`motionStatics`) | `lib/checks-ornament` | **none — owed** |
| bounce-easing | `animation-name` / `cubic-bezier` control points outside 0..1 | `w/census-decor` | `lib/checks-ornament` | **none — owed** |
| text-overflow | `scrollWidth > clientWidth` on the nearest CLIPPING ancestor-or-self, credited for a real affordance | `w/census-quality` | `lib/checks-quality` | `T/tooling/ui-audit/index.int.test.ts` · walker CT (both directions, incl. the sr-only trap) |
| truncated-to-nothing | text present in the DOM whose painted box is ~0px | `w/census-collision` | `lib/checks-quality` | `T/…/census-collision.int.test.ts` · `index.int.test.ts` · walker CT |
| repeated-container-text | the same literal string ≥3 times inside one decorated container | `w/census-quality` | `lib/checks-quality` | `T/tooling/ui-audit/index.int.test.ts` (#1826, both directions) |
| clipped-overflow | a positioned/in-flow child spilling its clipping box, per side, behind ONE paint fence | `w/census-quality` | `lib/checks-quality` | `T/…/census-quality.int.test.ts` · walker CT |
| edge-flush-cards | cards touching a horizontal scroller's content edge at `scrollLeft ≈ 0` | `w/census-quality` | `lib/checks-quality` | `T/tooling/ui-audit/index.int.test.ts` (#1826, both directions) |
| script-error | uncaught page errors captured by the RUNNER — not a DOM census at all | `ops/run` (page events) | `lib/checks-quality` | **none — owed** (no fixture plants a page exception) |
| duplicate-action-door | (role, accname) door HOMES, with the `role=toolbar` view-switch fence | `w/census-interactive` | `lib/checks-duplicate-door` | `T/…/census-interactive.int.test.ts` · walker CT |
| headline-overhang | a display headline's painted rect clipped into an opaque neighbour | `w/census-occlusion` | `lib/checks-quality` | `T/…/census-occlusion.int.test.ts` (3 arms) |
| inline-padding-leak | an `inline` element's tallest LINE FRAGMENT vs its line-height (block padding on an inline) | `w/census-occlusion` | `lib/checks-quality` | `T/…/census-occlusion.int.test.ts` (4 arms) |
| z-index-escalation | positive `z-index` on non-static elements | `w/census-interactive` | `lib/checks-structure` | **none — owed** (checker-level only) |
| nested-card | innermost card-like boxes inside another card-like box (fill+border+radius+shadow predicate) | `w/census-decor` | `lib/checks-structure` | `T/…/census-decor.int.test.ts` · `index.int.test.ts` · walker CT |
| gradient-text | `background-clip:text` + a gradient image + transparent `color` | `w/census-decor` | `lib/checks-structure` | **none — owed** |
| animated-img-hover | a state-variant transform class on the `<img>` OR its ≤3 wrapper ancestors, via the SHARED state predicate | `w/census-decor` + `w/state-paint` | `lib/checks-structure` | `T/…/census-decor.int.test.ts` (wrapper-hover zoom + its negative) |
| cohort-anatomy | rendered height spread across siblings keyed `tag + data-slot + role`, boxless inline runs excluded | `w/census-cohort` | `lib/checks-structure` | `T/…/census-cohort.int.test.ts` · `index.int.test.ts` |
| row-void | the gap between a row's label and the control it names | `w/census-cohort` | `lib/checks-structure` | `T/…/census-cohort.int.test.ts` · `index.int.test.ts` |
| selection-idiom | selected/unselected computed-paint DELTAS per authored cohort (`claim + home + state`), against the cohort's majority rest paint | `w/census-selection` | `lib/checks-structure` | `T/…/census-selection.int.test.ts` (16 arms incl. the #1808 baseline pair) |
| pane-ink | where a region's last authored paint sits relative to its height | `w/census-region` | `lib/checks-structure` | `T/…/census-region.int.test.ts` · `index.int.test.ts` |
| quiet-state | the loudness ORDER of an authored ON/OFF cohort's own fills over `resolveBackdropUnder` | `w/census-region` | `lib/checks-color` | `T/…/census-region.int.test.ts` (8 arms) · `index.int.test.ts` (incl. the OKLCH arm) |
| double-empty-state | simultaneously rendered `[data-slot=empty-state-root]` per surface | `w/census-region` | `lib/checks-quality` | `T/…/census-region.int.test.ts` · `index.int.test.ts` |
| text-below-ramp | computed `font-size` against the ramp's floor, per authored decision | `w/census-text` (`textStyles`) | `lib/checks-typography` | walker CT (9px `aria-hidden` paragraph) |
| undersized-ui-text | the same census against the FUNCTIONAL floor | `w/census-text` | `lib/checks-typography` | `T/tooling/ui-audit/index.int.test.ts` · walker CT |
| line-length | measure in `ch`, from a MEASURED advance (not `fontSize × 0.5`) | `w/census-text` | `lib/checks-typography` | walker CT (Geist advance arms) |
| tight-leading | computed `line-height` vs font-size, `normal` excluded | `w/census-text` | `lib/checks-typography` | **none — owed** |
| justified-text | `text-align: justify` on an element with own text | `w/census-text` | `lib/checks-typography` | `T/tooling/ui-audit/index.int.test.ts` (#1826, both directions) |
| all-caps-body | `text-transform: uppercase` / typed caps on non-heading prose | `w/census-text` | `lib/checks-typography` | `T/tooling/ui-audit/index.int.test.ts` (#1826, both directions) |
| wide-tracking | `letter-spacing` above the band, with the ratified caps-voice exemption | `w/census-text` | `lib/checks-typography` | walker CT (caps kicker exempt + sentence-case fires) |
| crushed-tracking | `letter-spacing` below the band | `w/census-text` | `lib/checks-typography` | **none — owed** |
| caveat-outweighed | a sentence-shaped caveat set SMALLER than the endpoints it bounds | `w/census-text` | `lib/checks-caveat` | `T/tooling/ui-audit/index.int.test.ts` (both directions) |
| off-theme-font | the PAGE's censused font faces + a paint probe for each | `w/census-text` (`fontCensus`) | `lib/checks-font-census` | `T/tooling/ui-audit/index.int.test.ts` (unpaintable face + present twin) |
| flat-type-hierarchy | the PAGE's censused font-size SET | `w/census-text` (`fontCensus.sizes`) | `lib/checks-typography` | **none — owed** |
| buried-raster | raster carriers (`<img>` / `background-image` url) at accumulated opacity < 0.15 | `w/census-text` (`buriedRasters`) | `lib/checks-media` | **none — owed** by design: the owner ruled this detector must not fire on today's tree, so a live plant would be a manufactured finding — `T/…/lib/checks-media.test.ts` is the checker-level proof |
| tier-drift | painted value vs the tier's OWN `--orb-tier-*`, resolved by the browser (a self-oracle) | `w/census-tier` | `lib/checks-quality` | `T/…/census-tier.int.test.ts` (7 arms) · `census-tier.test.ts` (the pair-map derivation) |
| off-grid-text | device-pixel landing of text inside a promotion context | `w/census-grid` | `lib/checks-typography` | `T/…/census-grid.int.test.ts` · `census-grid.test.ts` |
| promoted-layer-offset | the promotion ROOTS' own fractional landing, element AND pseudo | `w/census-grid` | `lib/checks-quality` | walker CT (#1154 pseudo arm) |
| off-grid-transform | a non-identity REST transform's fractional landing | `w/census-grid` | `lib/checks-quality` | **partial — the WITHHELD (animating) arm is planted in `census-grid.int.test.ts`; a firing rendered plant is owed** |

## Closing verdicts (session tasks #21, #19 — folded in 2026-09-01)

### #21 — the 55-rule Base UI mechanism audit

`cb-baseui-rule-audit.md` and `cb-baseui-catalogue.md` (the full read-only audit of all 55
`tooling/src/ui-audit` rules against the Base UI handbook + all 37 component pages) named four BLIND
findings. **Its denominator was 55; `contract/rules.ts` carries 59 today** (re-derive it — never cite
a remembered count), so every rule minted after that pass has NO mechanism verdict from it, and the
audit's scratchpad files were session-local and are not in the repository. Re-derived against the
tree:

- **FIXED** — `hover-contrast` (finding #1, M1 vs. M1-evil-twin: the `:hover`-substring prefilter blind
  to `data-*` state paint). Landed by the state-paint program (tasks #18/#22); table row 3 above.
- **FIXED** — `animated-img-hover`'s stylesheet-scan arm (finding #2, the second `:hover`-substring copy
  in `census-decor.ts`). Same program; table row 4 above.
- **FIXED** — `glow-shadow`/`radial-halo`/`radial-spotlight-glow`'s transient-state blindness (finding
  \#4, no forced-state read existed for the glow census at all). Same program; table row 5 above.
- **FIXED** — `aria-name` (finding #3, M6: native `<label for="id">` association). This entry read
  "STANDS … UNFIXED … a new row for Project 1" and was true when written; it is stale on the current
  tree. Re-derived 2026-09-01 (#1027): the census now carries `nativeLabelText` off the browser's own
  `HTMLElement.labels` list (`ops/walker/census-interactive.ts`), `AccessibleNameInput` declares it
  REQUIRED rather than optional so a fixture cannot silently omit the name source, and
  `checks-a11y.ts`'s `checkAccessibleName` accepts it as a name. Landed by #1009 with a four-arm proof
  at `tests/tooling/ui-audit/ops/walker/census-interactive.int.test.ts`; it is table row 8 above, and
  the measured scope is a LATENT false-positive class (Base UI belts every association with
  `aria-labelledby`, so no live surface relied on the native association alone).

The audit's remaining EXPOSED/CLEAR verdicts (every other rule) and its UNKNOWN items (the exact
false-negative rate of the two fixed color-axis-dependent gaps, and `duplicate-action-door`'s chained
exposure to the `aria-name` gap) were not re-verified by this doc — they are read-only-pass findings and
should be treated as scratchpad evidence, not re-attested law; the scratchpad files themselves
(`cb-baseui-catalogue.md`, `cb-baseui-rule-audit.md`) were session-local and are not committed to the
repository.

### #19 — the three-unmeasured-axes doctrine

A `design-audit` verdict about any one rendered element is a function of (at least) three independent
axes, and an instrument that only varies one of them cannot claim to have judged the other two:

1. **The panel axis** — which surface/pane is actually visited. Built: the `--panels` CLI axis
   (`tooling/src/_shared/panel-presets.json`, lane `cb-panels-arm`, task addressed by the panel-preset
   program) drives the live walker across a declared set of named panels instead of whichever surface a
   scenario happens to navigate to.
2. **The variant axis** — which `tv()` arm of a component actually renders. Built: the CT variant-arm
   matrix (`tests/ui/variant-arm-matrix.{def,plan,stories,suite,parity}.ts`, task #19's CT half, lane
   `cb-variant-axis`) renders and judges every arm of every `packages/ui` `tv()` component in isolation,
   across all three shipped themes, closing the exact gap the Base UI audit flagged as "arm-dependent"
   for `contrast`/`tap-target`/`glow-shadow`/etc.
3. **The mechanism axis** — whether the rule's SELECTOR can even see the state/paint it is looking for,
   independent of which panel or which arm is on screen. This is the axis this document owns: the table
   above and its authoring checklist are the doctrine's closing leg. Owner ruling: a table, not a gate —
   there is no single structural check that proves a rule's selector matches the codebase's expression
   idiom in general; the table is the transferable judgment, re-applied by a human/agent reading it
   before landing or trusting a rule.

All three axes are now addressed: panel (built), variant (built), mechanism (this table). A rule that
passes on one arm, on one panel, with a matching selector mechanism, is the strongest claim this
instrument family can make about a component; a rule that varies fewer than all three axes is answering
a narrower question than "does this component ever fail" and should say so in its own scope statement
(see `tests/ui/variant-arm-matrix.def.ts`'s own "THE SCOPE SPLIT" section for the house pattern).
