---
kind: review
status: active
updated: 2026-08-30
---

# Brief 1 — the primitive guarantee: the leaf already guarantees it; what recurs is one level up

Research lane `nate-research` (worktree `wt/nate-research` @ `7f574337a`), 2026-08-30. Read-only. Every
claim carries a `path:line` or command receipt from this session; negatives carry scanned counts.

## 0. The answer in five sentences

1. **For all three arms the guarantee already lives in a primitive or token, and the gate that exists caught
   its own class.** The recurrences after each mechanism shipped are, on every arm, a shape the leaf
   primitive cannot see from inside itself: a composition with NO surface (contrast), a row PITCH below the
   floor or an OPT-IN floor arm not taken (touch), and a data-dependent height whose first paint is a guess by
   construction (CLS).
2. **The "over-art contrast" family bundles three mechanisms**, and of the six instances filed after #626's
   plate gate, **zero** are the class that gate covers: #674/#681 are feature compositions with no backing
   at all; #690/#692/#693/#697 are TOKEN PAIRINGS on the light polarity (`palette-contrast` territory, not
   the plate law).
3. **The touch floor is in 24 of 54 `@orb/ui` primitive dirs by construction** (control-height ramp, the
   `::before` selection frame, the `::after` glyph/inline pseudos, coarse-sized hint trigger, `min-h`
   list/item rows). What recurs is (a) a floor arm that is opt-IN (`collapsible` trigger `size="control"`,
   `variants.ts:31` — the 411×40 finding is a call site that did not opt in), (b) rows stacked at a pitch
   below the pseudo (#850: `inline` Buttons in a `Stack gap="field"`, `rpg-stat-profile-editor.tsx:60-150`),
   and (c) measurement rulings (#807, #871). No layout primitive owns a coarse pitch — `pointer-coarse`
   appears nowhere in `packages/ui/src/layout` (`grep`, 0 hits) — so (b) has no primitive to move into.
4. **The CLS reservation that derives from the settled component exists**: `surface-box-store.ts` +
   `TileFallback`/`TileBody` (`home-tile.tsx:180-233`) measure-then-remember, with `skeletonRowCountFor`
   inverting the skeleton pitch to fill the box. It has **two consumers** (home tiles, the rpg HUD band) and
   **129 `QueryBoundary` mounts across 92 files** don't have it; 56 `SkeletonRows` sites carry a literal or
   named-constant `count`. #837 made the mechanism inert app-wide for two weeks (every `orb:*` blob reset on
   boot), which is why #453's "movers gone at boot 2" refusal was true in theory and false live (#835).
5. **The unrepresentability moves are therefore one level UP**: a whole-surface worst-legal-art contrast
   SWEEP whose population is the DOM (not a hand-listed pin per instance); an inverted touch default (floor
   by default, sub-floor by opt-in + reasoned marker) plus a pitch arm on the existing floorless gate; and
   lifting box memory into `QueryBoundary` itself so every boundary inherits boot-2 exactness and the
   literal `count` becomes a first-boot-only guess.

## 1. Census — what the repo already enumerated, and what it could not

### 1.1 Over-art contrast

| Tier | Population | Enforcer | Receipt |
| - | - | - | - |
| CSS rules under `html[data-blur-*]` with a translucent mix | 9 rules: 3 compliant, 5 baselined (2 measured, 3 pending measurement), keyed `(subject, tint)` | gate `over-art-plate-arm` (arms A–G, ratchet, `@over-art-plate-ok` two-sided) | `gates/over-art-plate-arm.ts:7-21`; `over-art-plate-arm.baseline.json` (5 rows) |
| feature-tier backings | 5 constants (`BG_PHOTO_READING_PLATE`, `_CHROME_PLATE`, `_BAND_PLATE`, `_LOADING_PLATE`, `_ERROR_PLATE`) + 2 sticky bands, consumed by 10 files | **convention** — the author must know to import one; `pnpm ast literal reading-plate --in packages/client` → 4 hits, all in `message-row-backing.ts`, so every TSX adoption goes through these constants | `features/chat/lib/message-row-backing.ts:53,116,133,181,210,294,319`; consumers: `grep -rl BG_PHOTO_` → 10 files |
| token pairings (ink vs its surface) | hand-listed pairs | `tests/ui/content/theme-scope/palette-contrast.suite.test.ts` (named pairs, every base) | cited at `message-row-backing.ts:197-199` |
| the alpha itself | derived | `readingPlateAlpha` solves α against the worst legal art for a light base; dark base returns the floor by owner ruling (D144(d)) | `packages/kit/src/theme-derivation/index.ts:394-418` |
| rendered receipts | **5 `pixelContrast` pins in 2 CT files**, each a single element (#681 status+retry ×2 widths, #674 chips) | per-instance CT | `tests/client/features/chat/surfaces/message-list-surface.ct.tsx:989,991,1009`; `chat-controls-band.ct.tsx:155,241` |
| ad hoc | design-audit's pixel backdrop path (#218) | side-eye drives, not CI | `ui-audit/ops/run.ts:4-11` |

The six post-#626 instances, re-derived:

| Issue | Mechanism | Class |
| - | - | - |
| #674 chip band 1.0–1.6:1 | the whole ancestor chain above `[data-slot=chat-control-chips]` was `rgba(0,0,0,0)` — no surface, plate or otherwise | **NO-BACKING composition** (TSX tier) |
| #681 transcript error state 1.5:1 | `renderError` had no plate while the sibling `fallback` had `BG_PHOTO_LOADING_PLATE` | NO-BACKING composition; fixed with `BG_PHOTO_ERROR_PLATE` routed by INK (`bg-card`, not the plate — `message-row-backing.ts:193-200`) |
| #690 skeleton bars on the plate, light arm | `muted` vs plate ΔL 0.008 on light bases; the shimmer's sweep stops were the painted colour | **TOKEN PAIRING**, light polarity |
| #692 arc fill 2.58:1 vs card | Hearth's dark-seed accent bleeding into a light-carried room's derived card — the #243/#236 polarity-divorce applied to the accent | TOKEN PAIRING, light polarity |
| #693 ring/waystone tracks `text-muted` | the faint-ring idiom the arc meter just left | TOKEN PAIRING |
| #697 static `--color-track-N` ramp 1.89–2.65:1 | hand-authored tokens unreachable by the accent clamp | TOKEN PAIRING (static ramp needs a light arm) |

So the plate gate has a 0% miss rate on its own class, and the family label is doing the recurring.

### 1.2 Touch floors

| Where the floor lives | Mechanism | Receipt |
| - | - | - |
| the token | `--spacing-touch-target` 44px, 28px under `pointer:fine` | `packages/ui/src/styles/theme.css:86,187`; `tokens.json:327-330` |
| control-height ramp | `CONTROL_SIZE` (button, toggle) — the box IS the floor; `icon-sm` = `size-control-sm` | `button/variants.ts:1-11`; `lib/control-size.ts` |
| selection controls | `SELECTION_CONTROL` `::before` `size-touch-target` (checkbox, radio, switch) | `lib/selection-control.ts:8-12` |
| floorless Button arms | `inline`: `after:h-touch-target after:w-full`; `glyph-*`: `after:size-touch-target` | `button/variants.ts:100-137` |
| hint trigger | `pointer-coarse:size-touch-target` on the button itself | `hint-trigger/variants.ts:10` |
| rows / items | `ITEM_ROW min-h-touch-target`; `list-row` `min-h-control-md/sm` | `lib/popup-surface.ts:20`; `list-row/variants.ts:179-180` |
| collapsible trigger | **opt-in** `size="control"` → `min-h-control-sm`; the default trigger is text-height | `collapsible/variants.ts:26-31` |
| coverage | 24 of 54 primitive dirs spell a floor token; interactive dirs with none: `accordion`, `option-strip`, `toggle-group`, `file-trigger`, `file-dropzone`, `selection-bar`, `save-bar` (each composes Button/Toggle, so the floor may ride the child — unverified per dir) | `ls primitives` (54) vs `grep -rlE "touch-target\|CONTROL_SIZE\|…"` (24) |
| gates | `no-floorless-control-in-wrap` — ≥2 floorless Buttons in a `flex-wrap` container (the pseudo-collision class); `no-raw-interactive-intrinsics`; `list-row-adoption` (LIST-region surfaces only: `LibrarySurfaceShell`/`LibraryListLayout`/`createCollectionSurface` importers) | `gates/no-floorless-control-in-wrap.ts:1-16`; `gates/list-row-adoption.ts:1-14` |
| instruments | design-audit `tap-target` (compositor hit extent, `ownsPoint`); CT `touch-floor.ts` `hitExtent` | `ui-audit/ops/walker/hit-extent.ts` |

The post-#662/#665 instances, re-derived:

| Issue | What it is | Class |
| - | - | - |
| #807 | a lone control credited with a paragraph's pixels; owner ruled "credit only forwarding ancestors"; the un-provable half (JS click handlers) is a declared limit | **MEASUREMENT RULING** — not a primitive defect |
| #850 | `rpg-stat-profile` rows 12–22px at fine pointer: `inline` Buttons (`HintEditor`, `ariaLabel="<attr> hint"`) stacked in `Stack gap="field"` (`rpg-stat-profile-editor.tsx:60-73,131-150`). The arm carries a 28px `::after` at fine; rows at text pitch overlap the neighbour's TEXT, and since #807 a hit carrying another element's text forwards nothing — the pseudo is present and unreachable | **PITCH** — the floor is a property of the ROW SPACING, which no control primitive owns and no layout primitive floors (`GAP` = tight/field/row/block/section/gutter, `layout/variants.ts:4-12`, no coarse arm) |
| #871 | nine 22×22 `[data-slot=hint-trigger]` P1s after #807 — the label block may genuinely paint over the trigger's pseudo, or `hitForwards` over-refuses; the issue defers to a planted control | MEASUREMENT RULING or a real primitive z-order defect — undecided on the tree |
| this-chat P2 (2026-08-30 report §5) | collapsible triggers 411×40 at coarse, no `::after` — the `control` variant exists and was not taken | **OPT-IN FLOOR NOT TAKEN** |

### 1.3 CLS reservation

| Mechanism | Where | Consumers | Receipt |
| - | - | - | - |
| literal / named-constant row count | `SkeletonRows count={N} shape=…` | **56 mounts** across the client (`ast-grep -p '<SkeletonRows $$$ />' -l tsx` over 629 files) — counts of 1/2/3/4/5/6 or a `*_ROWS` const | `data/skeleton-rows.tsx:39-89` |
| declared px block | `HomeTileContribution.skeletonBlock` (three constant-box tiles, #177) | 3 home tiles | `state/home-tile-contracts.ts:116`; `home-temp-chat-tile.tsx:36`, `home-masthead-tile.tsx:46`, `home-quick-picks-tile.tsx:56` |
| measured box memory | `surface-box-store` (per-user durable-local, `orb:u/<id>/surface-box`), `TileFallback` reserves `reserved ?? declaredBlock ?? rows`, `TileBody` measures on settle; `skeletonRowCountFor` inverts pitch | **2**: home tiles (`home-tile.tsx:227,249`), rpg HUD band (`rpg-hud-band.tsx:51,90`) | `state/surface-box-store.ts:16-31`; `home-tile.tsx:180-233` |
| the boundary | `QueryBoundary({ fallback, renderError, children })` — no reservation seam | **129 mounts / 92 files** (`pnpm ast jsx QueryBoundary --files`) | `data/query-boundary.tsx:16-25,77-87` |

The instances: #129/#177 (home first-boot residuals — `declaredRows` over-reserve; fixed with `skeletonBlock`
for constant tiles; the data-dependent shrink RULED accepted first-boot-only, healed by box memory), #453
(home re-settle — "movers gone at boot 2" refusal), #835 (the refusal did not reproduce — root cause #837:
box memory was being wiped every boot), the 2026-08-30 This-chat report (Injections skeleton 89→920,
Rules 185→704, Macro picks 137→65 — `settings-context-tab.tsx:278-402` literal counts vs 362–385px rows).

## 2. Per arm: can the guarantee move so that violating it is unrepresentable?

### 2.1 Contrast — the plate is guaranteed; the BACKING is a composition fact, so the population must be the DOM

- **What the primitive can guarantee, it does**: a plate's alpha is solved, not designed
  (`readingPlateAlpha`), the plate/ink pairing is one string (the DERIVE LAW, `message-row-backing.ts:5-26`),
  and the CSS population is gated.
- **What it cannot**: "this text node sits over wallpaper with nothing behind it" is a RENDER-TREE fact. There
  is no static population — the chat column is fixed JSX, not a contribution registry, so a type-level
  `backing:` requirement on a slot contract has no slot to attach to. The two TSX instances (#674, #681)
  were both found by pixel-sampling ONE element.
- **The move** — a rendered SWEEP whose population is derived, never hand-listed (GATE-AUTHORING §10 applied
  to a CT): one CT mounts the room over the worst legal art for each polarity (the dim floor from #487, bright
  art under a light plate / dark art under a dark plate — the inversion `message-list-surface.ct.tsx:871`
  already states), walks every text node under `[data-has-bg-image]` and samples each through the shared
  `pixelContrast` kernel, refusing when the walk censuses 0 nodes (Brief 2's denominator). Would have caught
  \#674 and #681 the day they landed and every future NO-BACKING composition in that column. The token-pairing
  quartet (#690–#697) is the same sweep pointed at the derived-palette CT harness ("the kernel now
  composites — alpha tokens measured honestly", #692) with the pair list derived from what is PAINTED over
  what, instead of hand-listed in `palette-contrast.suite.test.ts`.
- **Enforcer**: the CT itself (push tier) + `test-presence` for its existence; the sweep's census on its own
  RESULT/assertion (a 0-node walk fails, never passes).
- **Cost**: one CT (~3–5s), reusing `pixelContrast` and the existing `[data-has-bg-image]` mount recipe.

### 2.2 Touch — the control floor is guaranteed; invert the default and floor the PITCH at the gate

- **What the primitive guarantees, it does** (§1.2): every arm below the control ramp carries a pointer-
  conditional pseudo or coarse box.
- **What it cannot**: (a) a pseudo cannot be reached when the row pitch is below its extent — the hit lands on
  the neighbour's text and, correctly since #807, forwards nothing; (b) an opt-in arm is a convention.
- **Three moves, each with its enforcer**:
  1. **Invert the collapsible default** — `size="control"` becomes the base trigger; the text-height arm
     becomes `size="text"` and owes a line-adjacent `// @sub-floor-ok(<reason>)` marker, two-sided
     (`no-floorless-control-in-wrap`'s marker grammar). Enforcer: `ui-size-via-variant` already polices
     size-by-variant; the marker arm rides the same gate as (3). Cost: small; the default flip is a CT
     re-pin.
  2. **A pitch arm on `no-floorless-control-in-wrap`**: it already knows the FLOORLESS set and carries the
     variants tripwire; extend it from `flex-wrap` containers to ≥2 floorless Buttons as direct siblings of
     ONE `Stack`/`Row`/list whose `gap` token is below the touch floor at coarse, unless each sibling row
     carries `min-h-touch-target` / `pointer-coarse:min-h-…` (the ratified #ItemIconPicker/#Badge fixes are
     the two sanctioned spellings, per the gate's own header). Enforcer: that gate. Cost: small — one arm,
     mustFlag = `rpg-stat-profile-editor.tsx`'s shape verbatim.
  3. **A `rows="control"` variant on `Stack`** (or `ListRow` adoption for editor rows) so the honest fix
     for (2) is a one-token declaration instead of a per-row `min-h`. `list-row-adoption` covers LIST-region
     surfaces only (`LibrarySurfaceShell`/`LibraryListLayout`/`createCollectionSurface` importers); editor
     rows in a context tab are outside its scan by construction.
- **What stays a ruling**: #807's forwarding-handler half is a read-only-tool limit by contract; #871 is
  decided by a planted control, not by a primitive change until it is.

### 2.3 CLS — reservation is data-dependent; derive it from the SETTLED box, and home that in the boundary

- **"Can a skeleton derive its height from its settled component instead of a number?"** — yes, and the
  repo built exactly that: measure on settle, remember per device, reserve exactly, invert the pitch to fill
  (`home-tile.tsx:180-233`, `skeleton-row-metrics.ts`). It cannot derive the FIRST paint (the box is
  data-dependent by construction — `surface-box-store.ts:23-28`), and the owner ruled the first-boot shrink
  accepted (#129/#177).
- **The gap is HOMING, not mechanism**: the machinery is home-tile-local; 129 boundaries reserve by a literal
  `count`; the This-chat Injections section (89→920px, +831) is a boundary that would be exact on boot 2 if it
  had the seam.
- **The move**: lift `TileFallback`/`TileBody` into `QueryBoundary` as `reserveKey?: string` — when present,
  the fallback wraps in the remembered box (`useSurfaceBox(reserveKey)`), `skeletonRowCountFor` sizes the
  literal `count` to fill it, and the settled child is measured on mount (`rememberSurfaceBox`). The literal
  `count` survives as the first-boot guess. Enforcer: a gate arm — a `QueryBoundary` whose `fallback` is a
  `SkeletonRows` with a literal `count` and no `reserveKey` is RED, with a `// @first-boot-only(<reason>)`
  marker for boundaries that genuinely never re-mount (the Brief 2 denominator rule: a boundary that
  reserves by guess SAYS so). Cost: medium — one boundary change, 129 mounts to key (a mechanical sweep;
  the key is the surface id the census already uses).
- **The guard this inherits**: #837 wiped every remembered box on every boot for two weeks, and the CT
  doubles were faithful to the header rather than to zustand; the sentinel-key pin (`durable-local.test.ts`,
  `0b7ddaa70`) is what makes a lifted mechanism trustworthy. A reservation that reads its memory owes that
  pin's shape at the boundary tier: seed a box, boot, assert the fallback's `data-tile-reserved` equals it.
- **What no reservation fixes**: the This-chat report's own remedy for Injections is to COLLAPSE the rows
  (the Field-overrides idiom) — a 920px settle is a design fact before it is a CLS fact.

## 3. The enforcement table (§2.3 — every placement names what makes it RED)

| Arm | Guarantee | Home | Enforcer today | Enforcer proposed |
| - | - | - | - | - |
| contrast — plate alpha | solved vs worst legal art (light), floor (dark) | `kit/theme-derivation` | `palette-contrast` suite (base pairs) | unchanged |
| contrast — CSS glass rules | plate on the light arm, dark re-spelled | `globals.css` | gate `over-art-plate-arm` | unchanged (5 baselined rows to burn) |
| contrast — TSX backing | every text node under wallpaper has a backing | feature compositions | 5 per-instance pins | the DOM-derived worst-art sweep CT |
| contrast — token pairs on light | ink vs its real composite ≥ AA | derived palette | hand-listed pairs | the same sweep over the composited theme-scope harness |
| touch — control box | ≥ floor at coarse | `@orb/ui` (24 dirs) | CT pins per primitive; `ui-size-via-variant` | inverted collapsible default + `@sub-floor-ok` |
| touch — row pitch | siblings' pseudos never overlap text | layout | `no-floorless-control-in-wrap` (flex-wrap only) | the Stack/Row pitch arm; `rows="control"` |
| touch — measurement | published extent = reachable extent | design-audit / CT helper | #797/#807 pins | unchanged; #871 pending its control |
| CLS — first boot | reserve the declared box | `HomeTileContribution.skeletonBlock` / literal count | none (a guess) | `@first-boot-only` marker or `reserveKey` |
| CLS — boot 2+ | reserve the SETTLED box | `surface-box-store` (2 consumers) | home/rpg pins; #837 sentinel | `QueryBoundary.reserveKey` + the boundary-tier sentinel pin + the literal-count gate arm |

## 4. What I did not do

- No rendered receipts: this lane took no screenshots and ran no `snap`/`design-audit` — every number above
  is quoted from the issue, the report, or the source. The #850 PITCH classification is by construction
  (an 18px `inline` box + 28px fine pseudo in a `gap="field"` stack) and the issue's own hit-test; a live
  four-cardinal probe on the rpg Game tab would settle it in one command.
- The 7 interactive primitive dirs with no floor token were not opened; each may inherit the floor from a
  composed Button/Toggle.
- `#871` is left as the issue leaves it: a planted control decides.

## 5. Issue-summary paragraph

The three "primitive guarantee" arms already guarantee what a leaf primitive can: the reading plate's alpha
is derived and its CSS population gated (0 misses on its own class — the six post-#626 rows are two
no-backing compositions and four light-polarity token pairings), the touch floor is by construction in 24 of
54 `@orb/ui` dirs, and a measure-then-remember CLS reservation exists with `skeletonRowCountFor`. What
recurs is one level up on every arm: a text node with no backing at all (a render-tree fact — needs a
DOM-derived worst-art contrast SWEEP CT, not another per-instance pin), a row pitch below the pseudo or an
opt-in floor arm not taken (needs the collapsible default inverted with a reasoned `@sub-floor-ok` marker,
and a Stack/Row pitch arm on `no-floorless-control-in-wrap`), and a data-dependent height reserved by a
literal count at 129 `QueryBoundary` mounts while box memory serves 2 (needs `QueryBoundary.reserveKey`
lifting `TileFallback`/`TileBody`, a gate arm on literal-count fallbacks without a key, and the #837
sentinel pin at the boundary tier). None of the three is a new subsystem; each is an existing seam moved
from a home to a contract.
