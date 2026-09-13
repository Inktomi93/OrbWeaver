---
kind: review
status: active
updated: 2026-09-01
---

# ui-audit × @orb/ui mechanism audit — the house-package half of the instrument-friendliness program

Lane `cb-orbui-mechanism`, board row #1064. The #21 method re-run with **@orb/ui as the oracle**:
for every detector rule in `tooling/src/ui-audit` (minus the motion/grid slice fenced to lane
`cb-motion-mechanism`), does the rule's SELECTOR/MEASUREMENT mechanism see the way the HOUSE PACKAGE
actually expresses the audited property? Static/source analysis only (the full battery owned the box —
no live probes, no CT runs); every claim below carries the receipt that grounds it, and every finding
is shaped as a candidate row for `tooling/src/ui-audit/ops/walker/RULE-AUTHORING.md`'s
mechanism-match table so promotion is mechanical.

## Denominators (re-derived, never remembered)

- **Rule fleet:** `tooling/src/ui-audit/contract/rules.ts` carries **59 rules** (counted:
  `grep -c '{ id: "'` → 59, matching RULE-AUTHORING's own re-derived count). Fenced out to the
  sibling motion lane: `layout-transition`, `bounce-easing`, `off-grid-text`, `off-grid-transform`,
  `promoted-layer-offset` (`lib/checks-grid.ts` + `ops/walker/census-grid.ts` + the motion matrix)
  — **54 rules in scope here**.
- **@orb/ui surface:** `pnpm ast exports packages/ui/src --json --max 1100` → **997 exports over 349
  files** (`langs=dts:1,ts:240,tsx:108 scanned=349 … matches=997 status=complete`), grouped into the
  primitive/lib/charts/content/markdown/layout/stream/tokens inventory this audit walked.
- **Source read in full:** all 17 non-grid walker segments (`ops/walker.ts`, `core`, `target-identity`,
  `resolve`, `state-paint`, `accessible-name`, `census-{interactive,decor,glow,text,quality,collision,
  occlusion,cohort,selection,region,tier}`, `hit-extent`, `returns`), the forced-state pass
  (`ops/hover.ts`, `ops/hover-walker.ts`, `ops/hover-walker-read.ts`), the pixel sampler
  (`ops/pixels.ts`), all non-grid checks (`lib/checks-{a11y,color,decor,hover,media,ornament,quality,
  structure,typography,caveat,font-census}.ts`, `lib/css-color.ts`, `lib/ramp.ts`), and the wiring
  (`lib/collect.ts`, `lib/collect-families.ts`). On the oracle side: the `lib/` recipe set
  (focus-ring, selection-control, disabled-state, accent-hover, control-size, popup-surface,
  scroll-fade), button/toggle/toggle-group/list-row/text/media-tile-grid variants, textarea,
  tool-call-block, chart.tsx, surface.tsx, row-reveal.ts (client), `styles/globals.css` (scroll-fade
  region), and `docs/design/state-paint-census.md` in full.

## Findings — candidate BLIND rows for the mechanism-match table

Ranked by consequence. "BLIND" = false-negative class (the rule cannot see the house expression);
where a finding also publishes a false ACCOUNTING claim (an `excluded` that is not a measurement),
that polarity violation is named — it is worse than silence by the program's own law
(`docs/design/state-paint-census.md` §Polarity; `ops/hover.ts` "#2 POLARITY" comment).

| # | Rule(s) | What it looks for | How @orb/ui expresses it | The blind mechanism (today) | The matching mechanism (proposed) | Rule-side receipt | Convention-side receipt |
| - | - | - | - | - | - | - | - |
| F1 | `hover-contrast` (+ the forced-state glow arm) | Text paint under a held interaction state | Tailwind **group-variant hover**: `group-hover:bg-accent` / `group-hover:text-foreground` compile to `.x:is(:where(.group):hover *)` — the `:hover` subject is an ANCESTOR the compound never names | `STATE_HOVER_RE` has no functional-pseudo depth guard, so the pair-builder strips the nested `:hover` and CDP-forces the PAINTED element; the rule never engages and the identical pair is published `excluded(noHoverChange…)` — a FALSE measurement claim | The attr side's own guard, mirrored: a `:hover` reachable only inside `:is()`/`:where()` → withhold by name (`complexStateSelector` twin), exactly as the design doc already rules for `group-data-[…]` | `ops/walker/state-paint.ts:30` (depth-blind regex) vs `:85` (`stateAttrScan` tracks depth); `ops/hover-walker.ts:148-160` (pair-building forces the painted el); `docs/design/state-paint-census.md:88-91` (the ruling this violates, minted for the attribute twin) | `packages/ui/src/primitives/list-row/variants.ts:107` (`pointer-fine:group-hover:bg-accent`); `packages/client/src/features/chat/components/home-hearth-room.tsx:184` (`group-hover:text-foreground` on direct text) |
| F2 | `tap-target`, `aria-name`, `duplicate-action-door`, `obscured-target` (interactive flag), `row-void` (binding), the composite-credit veto | The offered-control population | Two shipped primitives render offered controls that are neither `a/button/input/select` nor `[tabindex]`-stamped: `Textarea`/`MacroTextarea` (native `<textarea>`) and `ToolCallBlock` (`<summary>`) | `INTERACTIVE_SELECTOR = "a,button,[role=button],input,select,[tabindex]"` omits `textarea` and `summary` — while the fleet's own sibling vocabularies all include both, so this reads as drift, not judgment | Add `textarea,summary` to `INTERACTIVE_SELECTOR` (the door census's `IMPLICIT_ROLES` already maps both) | `ops/walker/core.ts:10` (the omission) vs `core.ts:17` (`INTERACTIVE_CTX` has both), `census-decor.ts:44` (`INTERACTIVE_ISLAND_SELECTOR` has both), `census-quality.ts:215` (`CHILD_SUBSTANTIVE_SEL` has both), `census-interactive.ts:164` (`IMPLICIT_ROLES` maps both) | `packages/ui/src/primitives/textarea/textarea.tsx:54` (native `<textarea>`, no tabindex); `packages/ui/src/primitives/tool-call-block/tool-call-block.tsx` (`<summary>`) |
| F3 | `animated-img-hover` | An image animating on an interaction state | The house's ONE interactive media-zoom idiom: `MediaTileGrid` `interactive:true` puts `group-hover:scale-105` on the **cover wrapper** (overflow-hidden) around the `img` | Triple-blind: (a) the class arm tests only the `<img>`'s OWN classes with a regex anchored `^(?:hover\|data-…):` — no `group-` prefix; (b) the stylesheet arm requires the literal `/img/i` in `selectorText` — the compiled selector is the escaped class name; (c) `HOVER_TRANSFORM_RE` requires `transform:` while Tailwind v4 `scale-*` emits the standalone `scale:` property | Sweep wrapper-carried transforms over contained imgs (or at minimum widen the class regex to the group-variant prefixes and add `scale\|rotate\|translate` as standalone properties) | `ops/walker/census-decor.ts:180-215` (both arms), `ops/walker/state-paint.ts:75` (anchored regex), `ops/walker/core.ts:12` (`transform:`-only regex) | `packages/ui/src/primitives/media-tile-grid/variants.ts:43`; the v4 standalone-property fact is documented in-house at `packages/ui/src/primitives/button/variants.ts:29-31` |
| F4 | `selection-idiom` | The visual channels a selected/pressed state changes | The RATIFIED persistent state ring is Tailwind `inset-ring-*` (a `--tw-inset-ring-shadow` box-shadow layer): `data-pressed:inset-ring-2 data-pressed:inset-ring-ring` on Toggle — the house pattern for "selected/active needs a visible edge beside the focus ring" | `selectionDeltaSignature` drops the ENTIRE box-shadow channel whenever the computed string contains "inset" — so the ratified ring never registers as a channel, treatments mis-sign (a fill+insetRing state reads as `fill`), and distinct vocabularies under-count against the `>2 treatments` bar | Parse shadow LAYERS (the `splitTopLevelArgs` machinery already exists in-page) and classify inset layers as their own `inset-ring` channel instead of vetoing the whole string | `ops/walker/census-selection.ts:58` (`indexOf("inset") === -1`) | `packages/ui/src/primitives/toggle/variants.ts:19`; shared-memory `inset-ring-vs-focus-ring-layers` (the pattern is prescribed for every future selected/active edge) |
| F5 | `tap-target`, `aria-name`, `duplicate-action-door`, `obscured-target` | Offered controls in hover-reveal clusters | The house reveal contract: `ROW_REVEAL` rests at `opacity-0` (revealed by `group-hover`/`group-focus-within`, permanent at coarse); ListRow's `subtitleReveal` rests `invisible`; the float arm parks the cluster `pointer-events-none` at rest | At fine pointer these controls are `isVisible === false` at rest, so they never enter ANY offered-control census in any state — and the forced-state pass reads paint (color/bg/glow) only, never geometry or names. No accounting row names the class; the fine-pointer run reads clean over controls a real pointer user operates mid-hover | Either censused under the same forces the hover pass already holds, or an explicit `withheld(hoverRevealed)` row so a fine-pointer run stops claiming the coverage; NOTE the coarse arm already covers them (`pointer-coarse:opacity-100`), so a stated two-arm contract may be the cheapest honest fix | `ops/walker/census-interactive.ts:229` (`isVisible` gate), `ops/hover.ts` (pass measures contrast/glow only) | `packages/client/src/components/row-reveal.ts:16-17`; `packages/ui/src/primitives/list-row/variants.ts:81-82,105-107` |
| F6 | `contrast`, `text-over-art`, `hover-contrast`, `gray-on-color`, `quiet-state` | What a glyph/fill actually composites to | The UNIVERSAL scroll-overflow recipe is a `mask-image` on the scroller (`.scroll-fade-x/y`, driven by `useScrollFadeX/Y`) — content inside `--fade-edge-stop` of an edge paints attenuated, and the recipe's own doc says "A MASK IS INVISIBLE TO getComputedStyle" | ZERO mask handling anywhere in the fleet (grep `maskImage\|mask-image` over `tooling/src/ui-audit` → 0 reads). A masked text over an opaque ancestor resolves `flat` and is judged at full authored strength — never pixel-sampled (the sampler only settles `unresolved`), never withheld. Verdicts near faded edges are unsound in BOTH directions | Cheapest honest arm: tag samples whose ancestor-or-self chain carries a computed `mask-image !== none` as `withheld(maskedPaint)`; a framebuffer arm is the full fix (the memory's prescription) | `ops/walker/resolve.ts` (backdrop walk reads background only), `ops/pixels.ts:24-26` (`isUnresolved` filter) | `packages/ui/src/styles/globals.css:459-497` (both recipes), `packages/ui/src/lib/scroll-fade.ts` (the driver, whose own header states the blindness); shared-memory `mask-is-paint-invisible-to-computed-style` (the paid family) |
| F7 | the whole text/typography/contrast family + `pane-ink` | Chart ink (axis labels, category labels, values, legends) | Every @orb/ui chart renders through the ONE ECharts canvas seal (`Chart`); BarList/Heatmap/Histogram/Scatter/StatFigure ink is canvas paint — no text nodes, no computed styles | A chart contributes ZERO candidates to `census-text`'s TreeWalker and no withheld/excluded row names the canvas as an unjudgeable subject — a chart-heavy pane reads as fully judged while its entire ink layer went unexamined (`pane-ink` even counts the canvas as designed paint, which is correct for ink-ratio but compounds the "looks covered" read) | An `excluded(canvasInk)`-style census row per visible chart canvas, so the run's denominator names what the instrument structurally cannot judge; actual judgment belongs to the CT framebuffer arm, not this walker | `ops/walker/census-text.ts:78` (TreeWalker SHOW_TEXT is the only text source), `lib/collect-families.ts` (no canvas family) | `packages/ui/src/charts/chart/chart.tsx:1-12` (the canvas seal; a11y via ECharts' `aria` component); shared-memory `ct-framebuffer-contrast-arm` |
| F8 | `tap-target` / `text-below-ramp` / `undersized-ui-text` (+ every rung-4 authored-decision key) | The AUTHORED variant identity of a rendered target | @orb/ui variant axes live in `tv()` **class strings only** — no primitive stamps `data-variant`/`data-size`/`data-intent`/`data-tone` (swept: zero emitters in `packages/ui/src`; only Base UI's runtime `data-orientation` exists) | `TARGET_VARIANT_ATTRS = ["data-variant","data-size","data-intent","data-tone","data-orientation"]` therefore contributes nothing on house primitives, so two DIFFERENT authored size/variant arms of one primitive in one home (`size="glyph-xs"` beside `size="lg"` in one toolbar) fold into ONE "authored target-size decision" — one repair row where two decisions exist, with a muddled min–max size range | Owner fork: (a) stamp the variant axes as `data-*` on the primitives (matches Base UI's own data-attribute idiom and would feed F1/F4's vocabulary too), or (b) accept the collapse and say so in the rule's scope statement | `ops/walker/target-identity.ts:19` (the attr list), `lib/checks-a11y.ts` `tapTargetDecisionKey` | sweep receipt: `grep -rn 'data-(variant\|size\|intent\|tone)[=:]' packages/ui/src` → 0; `packages/ui/src/primitives/button/variants.ts` (the size axis is classes only) |

### Finding detail and failure scenarios

**F1 — group-variant `:hover` publishes a false `excluded(noHoverChange)`.** Scenario: on the home
surface, a fine-pointer run's forced-state pass collects the rule for
`.group-hover\:text-foreground:is(:where(.group):hover *)` (it sets `color`), resolves the painted
`<span>` at rest, CDP-forces `:hover` on that span — but the selector requires an ANCESTOR `.group`
to be hovered, so the read equals rest and the pair lands in `excluded(noHoverChangeButTransitioned)`
(the span carries `transition-colors`) — the accounting says "measured: no state paint" about paint
that demonstrably exists under a real pointer. The program's own polarity ruling
(`state-paint-census.md:88-91`) names this exact shape a violation — for the ATTRIBUTE twin
(`group-data-[checked]`), which IS withheld (`complexStateSelector`); the `:hover` twin was never
given the guard. The hover-side ancestor-chain forcing (`hover-walker.ts` "a real pointer sets
:hover on the whole ancestor chain") does not save it: only elements that are THEMSELVES top-level
hover subjects are in the forced chain, and a compiled group-variant never makes `.group` a subject.
Today's live blast radius is small (the list-row float cluster is icon-only, so few text candidates;
home-hearth-room's Resume credit is the concrete text case) — but the class covers every future
`group-hover:`/`peer-hover:` colour pair, and the failure is a false MEASUREMENT claim, the polarity
the apparatus exists to forbid.

**F2 — `textarea`/`summary` fall out of the offered-control population.** Scenario: a bare
`<Textarea>` mounted outside a Base UI `Field` (no label association) exposes no accessible name —
the exact `aria-name` P1 class — and is never censused; same for its tap target, its door, and its
`interactive` weight in the obscured census (a collision with a textarea files P1 instead of P0).
The five sibling vocabularies inside the same fleet all include both elements, and the door census's
own `IMPLICIT_ROLES` maps `summary → button` and `textarea → textbox` — roles it can only ever see
via an element that the selector at `core.ts:10` structurally cannot admit. Base UI's Menu/Select
items are NOT in this class — verified in the installed package
(`@base-ui/react@1.7.0` `menu/item/useMenuItemCommonProps.js:39`, `select/item/SelectItem.js:129`:
`tabIndex: open && highlighted ? 0 : -1`), so `[tabindex]` admits them.

**F4 — the inset-ring channel.** Scenario: a settings pane uses Toggles (pressed =
`bg-accent` + `inset-ring-2 inset-ring-ring`) and a picker grid whose selected cell is fill-only.
Both compute delta signature `fill`; the census reports ONE treatment where the surface truly runs
two (fill vs fill+ring), and conversely a state whose ONLY delta is the ratified inset ring computes
signature `none` and silently drops out of `selectionTotal`. The exclusion also fires on any
COMPOSITE string — Tailwind serializes inset and non-inset layers into one `boxShadow` value, so one
inset layer vetoes a genuinely changed outer shadow layer too.

**F5 — the reveal contract.** The walker itself knows the pattern exists (`census-interactive.ts`'s
\#851 comment: "the reveal cluster is hover-gated there, so exactly one row's door was ever offered
at once") but no census or accounting row covers or names it. Cost concentrates exactly where the
lens matters: rows' trailing action clusters (delete/star/menu) are the densest small-target
population in the product, and at fine pointer they are judged never. The coarse arm genuinely
covers them (`pointer-coarse:opacity-100`; ListRow float arm keeps the cluster in flow at coarse) —
but nothing in the run output states that the fine-pointer run's tap-target/aria-name coverage
excludes rest-hidden controls, so a reader of a desktop run cannot tell.

**F6 — mask paint.** Constrained honestly: the fades are deliberate and transient, so the
false-verdict incidence at rest is low — the finding is that the fleet has no way to KNOW it is on
masked ground (no read, no withhold), and the one paid incident in this family (the message-list
mask, 1.29–3.34:1 body text scored 0 findings) is the founding memory of the class. The pixel
sampler cannot rescue it: masked text over an opaque card resolves `flat` and never reaches
`ops/pixels.ts`.

**F7 — canvas ink.** Constrained honestly: judging canvas ink from this walker is out of reach by
design (no DOM per bar), and chart colours ride `useChartTheme`'s token resolution. The defect is
the SILENT zero — the #987 apparatus's whole point is that "no candidates" and "cannot look" must
render differently, and a visible `<canvas>` inside a chart slot is a lookable-at subject the
denominator never mentions.

## Verified MATCHED (already covered, with receipts — a success, not filler)

These are the intersections where the fleet provably encodes the @orb/ui convention. Candidate
"already-landed" table rows / re-attestations:

1. **OKLCH-only colour** → the 1×1-canvas `probeColor` normalizer with two-sentinel validity
   (`ops/walker/resolve.ts:11-49`), `lib/css-color.ts` routing through `@orb/kit/safe-color`
   (ColorJS) with balanced-paren scanning, and `census-region.ts`'s own "NEVER A NUMBER REGEX"
   restatement. RULE-AUTHORING row 1 stands.
2. **The pointer-conditional touch floor carried in pseudos** → the compositor hit-extent probe
   credits BOTH `::after` (Button `glyphBox`/`inline` arms — `button/variants.ts:16-24,96-103`) and
   `::before` (`TOUCH_TARGET_PSEUDO`, `lib/selection-control.ts:11-14`, checkbox/radio/switch):
   `pseudoCarriesFloor` reads both pseudos (`ops/walker/hit-extent.ts:498-503`). Forwarding labels
   ride `el.labels` (`forwardingLabelOwns`), Base UI's 1-2px aria-hidden native twins are excluded,
   and the slider composite is credited with #807's text-forwarding fence.
3. **The fleet's `data-slot` vocabulary is live, 24/24** — every slot literal the fleet consumes
   (`accordion-panel`, `autocomplete-input-group`, `avatar-stack-item`, `button`, `card-root`,
   `collapsible-panel`, `empty-state-action`, `empty-state-decoration`, `empty-state-root`,
   `input-root`, `list-row-{body,markers,meta,root,subtitle,subtitle-reveal,title}`,
   `media-grid-cell`, `message-bubble`, `select-trigger`, `slider-indicator`, `text`,
   `theme-background-layer`, `theme-scope`) resolves to a live emitter in `packages/ui/src` and/or
   `packages/client/src` (diff script, this session; ui emits 409 distinct slot literals).
4. **The ratified ListRow selection accent** → `LIST_ROW_SELECTED_SEL` requires BOTH the slot
   identity AND `[data-selected]` (`ops/walker/core.ts` #485 block), `classifyAccentBorder` counts
   the exemption (`excluded(ratifiedListRowSelection)`), and the coupling is BIDIRECTIONAL — the
   primitive's own comments cite the audit exemption back
   (`packages/ui/src/primitives/list-row/variants.ts:32-42,200-204`).
5. **The tier self-oracle** → `census-tier.ts` resolves sanctioned values BY THE BROWSER (the #1037
   token-stream fix), `Surface` is the one `data-surface-tier` writer
   (`packages/ui/src/layout/surface.tsx:43`), and the hand-copied slot→var triples are two-sided-
   enforced by `tests/tooling/ui-audit/ops/walker/census-tier.test.ts` (#1003).
6. **The voice axis** → `Text`/`Heading` emit `data-voice` (`text/text.tsx:49,69`);
   `checks-caveat.ts`'s `CHROME_LABEL_VOICES` (`credit`,`interactiveKicker`,`kicker`,`label`) are
   all live members of the closed voice tuple (`text/variants.ts:48-…`), and the rule documents its
   declared blind spots itself.
7. **Ramp constants derive from live tokens** — `lib/ramp.ts` reads `TOKENS`/`SNAPPED_LENGTH_BASE_PX`
   (never a prose mirror), incl. the NaN-flood tripwire for snapped leading; `RAMP_FONT_FACES` is
   derived from the `font.sans`/`font.mono` stacks; the face-availability probe carries a two-sided
   control every run.
8. **State paint on the element, not a pseudo** → `POPUP_SURFACE`/`ITEM_ROW`
   (`lib/popup-surface.ts`) and menu variants paint `data-highlighted` backgrounds on the element
   itself, matching `census-glow.ts`'s STATED limit that pseudo-painted backdrops are invisible to
   `resolveBackdrop` — the limit is declared and the house idiom stays inside it.
9. **`data-disabled` is an inactive spelling** → `INACTIVE_KIND_EXPR` includes
   `:disabled,[data-disabled]` and `[aria-disabled="true"]` plus the label-indirection hop
   (`tooling/src/_shared/wcag.ts:172-188`) — `DISABLED_STATE`'s Base UI attribute channel is
   covered, and ancestor `opacity-50` dimming is composited via `accumulatedOpacity` (the fleet does
   NOT share axe's ancestor-opacity blindness).
10. **Truncation** → the affordance test reads `text-overflow: ellipsis` off the nearest CLIPPING
    ancestor-or-self and credits title/aria-label (#825), matching the house
    `<div class="truncate"><span>` shape; `line-clamp` (`Text lines={2}`, ListRow subtitle `wrap`)
    neither false-positives (vertical clamp grows no `scrollWidth`) nor needs the affordance credit
    (the clamp paints its own ellipsis).
11. **The virtualizer row stamp** → the door census's `data-index` list-item resolution matches the
    house convention: MessageList, VirtualList and MediaGrid all stamp `data-index`
    (`message-list.tsx:435`, `virtual-list.tsx:237`, `media-grid.tsx:336`).
12. **Sanctioned glow carriers** → `SANCTIONED_GLOW_SEL`'s three members all live
    (`empty-state-decoration`, `media-grid-cell` slots; `.orb-weave-glow` at
    `art/web-weave/variants.ts:18` + `globals.css:1020`), and `isDedicatedGlowLayer` was measured
    against all six live `before:shadow-glow` carriers rather than a name list.
13. **Base UI popup items are censusable** → Menu/Select items carry `tabIndex` 0/-1 in the
    installed package (receipts in F2 detail), so `[tabindex]` admits them wherever a popup is open
    during a walk.
14. **The `control-aspect` slider refusal** matches the Slider's real anatomy (role lands on the
    visually-hidden native input inside the thumb) — the refusal is documented with the CT receipt
    in `checks-a11y.ts` and re-verified against `slider-indicator`'s composite handling.

## Unconfirmed / needs a live probe (not findings)

- **F1's CDP semantics**: the derivation that `CSS.forcePseudoState` on the painted element does not
  match `:is(:where(.group):hover *)` follows from the protocol forcing a single node and from the
  design doc's identical ruling for the attribute twin; a two-minute live probe (force the span,
  read the group rule) would upgrade the receipt from structural to measured. Probe when the box
  frees: plant `group-hover:text-foreground` on a scratch stage, run the hover pass, read the
  accounting bucket.
- **`quiet-state` under themes that restyle switch tracks via pseudo layers** — no live instance
  found; the census's fill-only read matches today's Base UI Switch anatomy.

## Regions NOT read (scope statement)

`lib/checks-grid.ts`, `ops/walker/census-grid.ts`, `ops/matrix*.ts`, `ops/drive.ts` (motion/grid —
sibling lane's fence); `ops/{run,report,stage,parse,page-validate,hover-validate}.ts`,
`lib/{budgets,severity,evidence,population,population-strategies,stage-request,surface-state}.ts`
(plumbing/accounting mechanics, not selector mechanisms — read only where a checked rule routed
through them, e.g. rung strategies via `collect-families.ts`); the walker fixture/test tree under
`tests/tooling/ui-audit/**` (mechanism proofs cited by the source were taken on trust of the source's
own citations); `@orb/ui` files not named in the receipts (the 409-slot and variant-attr sweeps
covered the whole package textually; deep reads were targeted).

## Verification log

- `pnpm ast exports packages/ui/src --json --max 1100` → matches=997 status=complete (scanned=349).
- Rule count: `grep -c '{ id: "' contract/rules.ts` → 59.
- Slot cross-check: fleet literals extracted by grep over `tooling/src/ui-audit`; emitters extracted
  from `packages/ui/src` (409 distinct) + `packages/client/src`; scripted membership diff → 24/24 live.
- Variant-attr sweep: `grep -rn 'data-(variant|size|intent|tone)[=:]' packages/ui/src` → 0 emitters
  (two `data-tone` sites exist in packages/client features; none in the package).
- Mask sweep: `grep -rn 'maskImage\|mask-image' tooling/src/ui-audit` → 0 reads (2 comment-only
  `mask` string hits verified non-mechanical).
- group-variant sweep: `grep -oE 'group-hover:[…]'` over `packages/ui/src` (5 hits: 1 bg, 1 scale-,
  2 visibility, 1 in parts.tsx) and the paint-classes sweep over `packages/client/src` (receipts in
  F1/F3/F5).
- Base UI item tabindex: read from the installed `@base-ui/react@1.7.0` build (paths in F2 detail).
- No live probes, no CT runs, no whole-tree checks (per brief constraint); no repo file outside this
  report was touched.

## Proposed shared-memory lesson (orchestrator owns the write)

- Index line: `[hover force can't reach group-variants](hover-force-cannot-engage-group-variant-rules.md) — CDP :hover on the painted el never engages compiled group-hover rules; only the attr side withholds the shape`
- Body: The forced-state pass's `:hover` mechanism forces the PAINTED element, so any rule whose
  state test lives inside a functional pseudo (`.x:is(:where(.group):hover *)` — every Tailwind
  `group-hover:`/`peer-hover:` utility) never engages under force and publishes
  `excluded(noHoverChange)`, a false measurement claim. The attribute mechanism withholds this exact
  shape by name (`complexStateSelector`, `docs/design/state-paint-census.md:88-91`); the hover side
  has no depth guard (`state-paint.ts:30` vs `:85`). **Why:** found by the #1064 orb-ui mechanism
  audit cross-checking the fleet against `list-row/variants.ts:107` and `home-hearth-room.tsx:184`.
  **How to apply:** when auditing or extending the state-paint program, treat "excluded" buckets on
  group/peer-variant paint as unmeasured; the fix is the attr side's withhold, mirrored.

## Issue summary (for #1064 — paste verbatim)

cb-orbui-mechanism (stickler, static-only): re-ran the #21 mechanism-match method with @orb/ui as
the oracle over the 54 in-scope rules (59 registered minus the motion/grid slice fenced to
cb-motion-mechanism). Outcome: **8 CONFIRMED blind-class findings, 14 verified-MATCHED
intersections, 0 overclaim-class findings**; severity ceiling is F1 (`hover-contrast` publishes a
FALSE `excluded(noHoverChange)` for Tailwind group-variant hover paint — the exact polarity
violation `docs/design/state-paint-census.md:88-91` already rules against for the attribute twin;
live paint at `list-row/variants.ts:107` and `home-hearth-room.tsx:184`). Other headline rows:
`INTERACTIVE_SELECTOR` omits `textarea`/`summary` (Textarea/MacroTextarea/ToolCallBlock invisible
to tap-target/aria-name/door censuses while five sibling fleet vocabularies include both);
`selection-idiom` vetoes any box-shadow containing "inset", blinding it to the ratified
`inset-ring-*` state channel (Toggle `data-pressed`); `animated-img-hover` is triple-blind to the
house's one media-zoom idiom (MediaTileGrid `group-hover:scale-105` on the wrapper; Tailwind v4
standalone `scale:` property); rest-hidden reveal clusters (ROW_REVEAL/ListRow float) are uncensused
at fine pointer with no accounting row naming it; mask-image paint (SCROLL_FADE recipes) has zero
fleet handling; ECharts canvas ink contributes a silent zero to every text family; and
`TARGET_VARIANT_ATTRS` is empty on house primitives (no `data-variant`/`data-size` stamping), so
distinct tv() arms collapse into one authored-decision population row (owner fork: stamp the axes or
declare the collapse). All findings are formatted as candidate rows for RULE-AUTHORING's
mechanism-match table with `path:line` receipts on both sides; fixes are the orchestrator's to
file, none were made. Full report:
`docs/reviews/stickler/2026-09-02-uiaudit-orbui-mechanism-audit.md` (committed on branch
`wt/agent-a92c2ea64e6e81c01`).
