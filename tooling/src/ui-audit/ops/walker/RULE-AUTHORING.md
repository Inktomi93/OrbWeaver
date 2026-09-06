---
kind: law
status: active
updated: 2026-09-05
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
   state attributes instead of `:hover` — `docs/vendor/base-ui/handbook/styling.md`) or a build-time
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
| 6 | Whether every `tv()` variant ARM of a component (not just the arm that happens to render on a visited surface) fails its own rules | `packages/ui`'s \~40 `variants.ts` files declare their axis/value space on the `tv()` object itself (`.variants`/`.variantKeys`, tailwind-variants 3.2.2) | A live/`design-audit` page walk judges only whichever arms happen to be rendered on the surfaces it visits — most arms of most components never render on any audited surface | Derive the full arm space AT RUNTIME from the `tv()` objects themselves (never a static source-text/`ts-morph` re-derivation — `as-const satisfies` blinds that method) and render/judge every arm in isolation | `tests/ui/variant-arm-matrix.def.ts:1-30` (header is the durable design artifact for the whole suite family) | memory `as-const-satisfies-blinds-ts-morph-initializer` |
| 7 | The `:hover` pseudo-class inside authored selector text | Tailwind mints class NAMES containing escaped variant colons — `.dark\:hover\:bg-neutral-700:hover` — where the literal substring `:hover` also appears INSIDE the class name, not just as the trailing pseudo | A bare `/:hover/` test/strip matches inside the escaped class name too, and stripping it mangles the selector into one `querySelectorAll` throws on | A negative-lookbehind regex requiring the preceding character not be a backslash (`(?<!\\):hover(?![-\w])`), applied consistently to every `:hover` test AND strip, plus the identical discipline for `::before`/`::after` pseudo-element detection | `tooling/src/ui-audit/ops/walker/state-paint.ts:18-24,29-37` (issue #24 — measured: 25 unparseable selectors on the isolated config stage, 19 of them this bug) | — |
| 8 | A control's ACCESSIBLE NAME (`aria-name`, and the door census's name key) | The whole accname source set, including the one HTML has always used: a `<label for=id>`, or a `<label>` wrapping the control | Reading only the attributes and text ON the element — `aria-label`, `aria-labelledby`, own text, `title`, `alt` — which classifies a correctly `<label for>`-named control as unnamed | `el.labels`, the BROWSER's own association list: it knows both spellings, and knows a `for=` pointing at another id is not an association. Deliberately NOT `closest("label")`: for a non-labelable element HTML declares no association, so the finding there is TRUE and silencing it would trade a false positive for a false clean | `tooling/src/ui-audit/ops/walker/census-interactive.ts` (`nativeLabelText`) + `lib/checks-a11y.ts` `checkAccessibleName`; four-arm proof in `tests/tooling/ui-audit/ops/walker/census-interactive.int.test.ts` (#1009) | This file's checklist step 1 — the dispatched "real site" was NOT one (Base UI belts every association with `aria-labelledby` as well), so the row closed a LATENT class; re-derive a claimed live instance before repeating it |
| 9 | WHICH element owns a state the rule is asking a relational question about (selected/checked/pressed/current) | A Base UI component publishes its state vocabulary on EVERY PART, not only on the root that owns the decision: `Radio.Indicator` republishes the root's `data-checked`/`data-unchecked` and `Switch.Thumb` republishes the switch's, while only the ROOT carries the ARIA state (`role=radio` + `aria-checked`) | "carries a state attribute ⇒ is a state carrier" — which promotes a presentation part to a candidate. `Radio.Indicator`'s `keepMounted` defaults to FALSE, so the part EXISTS ONLY WHILE CHECKED and forms a permanently one-sided cohort that WITHHOLDS forever; `Switch.Thumb` (always mounted) instead judges its root's cohort a second time for one authored decision | The ARIA state is the ownership tell, not the nesting: a carrier with NO `aria-checked`/`aria-selected`/`aria-pressed`/`aria-current` of its own whose NEAREST state-carrying ancestor asserts the SAME state kind is that ancestor's presentation — `excluded` (closed, printed, still in the denominator), never `withheld`. A nested control that owns its own aria state stays its own cohort | `tooling/src/ui-audit/ops/walker/census-selection.ts` (`isNestedStatePart`) + `docs/vendor/base-ui/components/radio.md` (Root vs. Indicator data-attribute tables); three-direction proof in `tests/tooling/ui-audit/ops/walker/census-selection.int.test.ts` (#1150) | Measured, not latent: this single withheld cohort made EVERY Settings design-audit print `population-verdict=NO-VERDICT`. `quiet-state` (`census-region.ts`) closed its half in #1155 with one nuance — that rule ranks PAINT, so a part mounted in BOTH states (`Switch.Thumb`) paints two real fills and keeps its judged cohort; only a ONE-SIDED all-parts cohort is `excluded(nestedStatePart)` |
| 10 | The paint UNDERNEATH an element, for a rule that ranks the element's OWN fill (quiet-state's loudness ordering) | One walk, `resolveBackdrop(el)`, answers "what is behind EL's box" — including el's own background when it has one | Handing that walk the element's PARENT to skip its own fill. It reads the right colour and the WRONG BOX: the paint-layer veto then runs against the PARENT's rect and the PARENT's subtree, so the carrier's own indicator and any sibling that never touches the carrier both count as paint between it and its base. A layer that FOLLOWS the subject in document order is also counted, though CSS paints it ON TOP of the subject | `resolveBackdropUnder(el)` — the same walk from the parent, measured against EL's box, ignoring layers inside el and layers that paint over it (auto z-index + document order; an explicit z-index keeps the veto rather than guessing a stacking context). `resolveBackdropAt(el)` is the container flavour for a paint-context partition KEY | `tooling/src/ui-audit/ops/walker/resolve.ts` (`resolveBackdropFrom`/`resolveBackdropUnder`/`paintsOverSubject`); four-direction proof in `tests/tooling/ui-audit/ops/walker/census-region.int.test.ts` (#1155) | Measured live on Settings -> Appearance (2026-09-02): ALL THREE surviving `quiet-state` cohorts read `unresolved(paint-layer-over-base)` — off the checked cell's own `Radio.Indicator` and off the `⋯` row-menu chip painted over the cell — which alone held every Config audit at `population-verdict=NO-VERDICT` |
| 11 | A DECORATIVE TELL on an element that is a PICTURE OF that tell (the illustrated pickers' art) | `@orb/ui`'s PickerCell is the one anatomy every single-choice picture picker wears, and its `[data-slot="picker-cell-art"]` aperture holds a DIAGRAM of a design: the chat-style cells render mini transcript lines in each skin's own classes and inherit that skin's 3px accent through `stripeOf`; the density and elevation cells draw their axis the same way, and the theme LOOKS picker's `ThemeMiniSurface` swatch paints a card with the theme's own radius and hairline (a theme swatch is a picture of a design too) | Judging every censused carrier — the diagram is a real element with a real computed border, so the accent-border rules fire on it and report 4 findings that describe the PICTURE and no surface a user reads | A per-candidate CONTEXT FLAG on the sample (`artPane`), derived in the walker by `closest()` on the SHARED slot and consumed as a named `excluded(illustratedPickerArt)` in the checker — so the sample stays in the denominator, ALL FOUR illustrated pickers ride ONE row (`<RadioGroupPickerItem art=…>` is the only door into the aperture; ast-grep finds exactly four, 787 tsx scanned 2026-09-05: chat style, density, elevation, theme looks), and the identical stripe outside an aperture stays judged. The aperture renders unconditionally and `closest()` matches SELF, so the aperture element sits inside its own exemption — no over-reach, its `art` recipe declares no border and never enters a border census | `tooling/src/ui-audit/ops/walker/core.ts` (the `[data-slot='picker-cell-art']` selector `core.ts` publishes into every census segment (a `var` inside the raw-JS segment string, not a workspace declaration)) + `ops/walker/census-decor.ts` (`artPane`) + `lib/checks-decor.ts` (`checkAccentBorder`/`classifyAccentBorder`); both-directions fixture proof in `tests/tooling/ui-audit/ops/walker/census-decor.int.test.ts` (#1642) | memory `allowance-minted-on-one-half-of-a-shared-vocabulary` — mint the exemption on the VOCABULARY, never on the one consumer that reported it |
| 12 | An ACCENT EDGE on a card (`side-tab` / `border-accent-on-rounded`) | Two spellings, and the one the tree reaches for most is a `::before`/`::after` BAR — absolutely positioned, filled with a token colour, pinned to one edge — not a `border-*-width` (`packages/client/src/styles/globals.css:84`; live: `[aria-label="Tags"]::after`, 3px x 252px `oklch(0.72 0.175 52)` on a 10px-radius card) | Reading the element's own four border widths only. It publishes `candidates=0 judged=0 affected=0 withheld() excluded()` on the exact surface carrying the banned edge, which is indistinguishable from clean — and the same run's positive control (`candidates=1` on Appearance) proves the collector is alive, not dead | A second collection channel into the SAME family and the SAME `AccentBorderInput`, so ONE checker judges both: a pseudo layer thin on one axis, spanning >=60% of the host on the other, pinned to that edge, with a background COLOUR (never the image channel — the CTA/active-tab gradient RING carries its paint as `background-image` and would otherwise be convicted wholesale). Every context flag is read off the HOST, so the ratified exemptions (row 11 included) reach the new channel the day they land | `tooling/src/ui-audit/ops/walker/census-accent.ts` (`accentBarSide`); three-direction proof in `tests/tooling/ui-audit/ops/walker/census-accent.int.test.ts` (#1103) | Measured: `docs/reviews/side-eye/2026-09-02-config-surface-live-drive-2.md` F12 + its Instrument Delta. The repair OPENS a channel, which is when a ratified exclusion is most likely to be silently re-opened — #1151 was the standing row for exactly that, and it stayed closed only because the flags ride the host |
| 13 | The RENDERED ANATOMY of a component's instances (`cohort-anatomy`'s height spread) | Some `data-slot` carriers are INLINE TEXT RUNS with no box of their own — `@orb/ui`'s markdown emits one `span[data-slot="dialogue"]` per quoted run inside a paragraph (`packages/ui/src/markdown/dialogue-paragraph.tsx:54,71`) | `getBoundingClientRect().height` on any censused carrier. On a `display: inline` element that is the UNION of its LINE BOXES, i.e. a wrap count: one cohort reported 69/45px desktop, 45/21px Light and 21/45px mobile-coarse for byte-identical markup — the majority and the minority TRADE PLACES between arms, which no anatomy defect does | A computed-`display` fence at collection: a member whose display is exactly `inline` is a boxless run, and a cohort whose members are ALL boxless is `excluded(inlineTextRun)` — counted and printed, never dropped. Read the DISPLAY, not `getClientRects().length > 1`: a single-line inline run is equally unmeasurable, and letting the wrap count decide whether the rule can see the cohort is the same bug one level up. `inline-block`/`inline-flex` own a box and stay judged; a MIXED cohort stays judged too, because one member rendering inline beside box siblings IS the divergence this rule exists to say | `tooling/src/ui-audit/ops/walker/census-cohort.ts` (`inlineRun`); both-directions proof in `tests/tooling/ui-audit/ops/walker/census-cohort.int.test.ts` (#1703) | The tell that this is a MECHANISM defect and not a threshold one: the verdict inverted between arms. A finding that changes sign with the viewport is measuring the viewport |
| 14 | WHETHER TWO CONTROLS SHARING A NAME ARE ONE VERB (`duplicate-action-door`) | The app assigns jobs to REGIONS: `nav[aria-label=Primary] > button "Chats"` navigates the app, while `#context-cell-chats` inside `toolbar "Character"` repaints the context region with that character's chats (`docs/architecture/core/UI-Architecture-and-Layout.md` §4.1-4.3) | Pairing on (role, accessible name) plus a structural PATH. Two regions doing two jobs under one noun read as one verb with two homes, and the rule's own remedy — give the verb one home — would delete the view switcher | The ARIA container role is the tell: a door whose nearest `role="toolbar"` ancestor holds >=2 sibling cells is a VIEW SWITCH and leaves this rule's population as `excluded(viewSwitchCell)` (counted, printed). Scoped to `role="toolbar"` and no wider — the same rule's list-row-against-shelf findings are a RULING (#1662, ruled DIFFERENTIATE), not a fence, and must keep firing | `tooling/src/ui-audit/ops/walker/census-interactive.ts` (`doorToolbarHome`) + `lib/checks-quality.ts` (`isViewSwitchCell`); two-direction proof in `tests/tooling/ui-audit/ops/walker/census-interactive.int.test.ts` (#1705) | The two fixtures differ by the `role="toolbar"` ATTRIBUTE ALONE — the door path is position-free and carries no role — so the negative arm is a true control rather than a differently-shaped document. When a fence keys on one attribute, make the control vary only that attribute |

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
