---
kind: law
status: active
updated: 2026-10-30
---

# UI density law — the assignment law for the token scales

> Scope: visual density in `packages/ui/src` + `packages/client/src`. Not IA, not color (D71 owns palettes), not motion. Section numbers are stable because code comments and design decisions cite them.

D333 retires the custom static density gate and its reviewed-grant framework. The visual rules remain product law, but no custom static checker enforces them.

## 1. Why this law exists

The token scales exist, but nothing states which surface class uses which step. Without an assignment, a feature picks by taste and converges on the loosest, boxiest option. Three habits recur:

| habit | what it looks like |
| - | - |
| box-in-box chrome stacking | a bordered/rounded card inside a bordered/rounded card inside a panel |
| form primitives building instrument surfaces | an instrument pane composed from settings-row / `Card` airiness |
| uniform visual weight | nothing recedes, so everything competes |

This law follows the 8pt grid with a 4pt sub-grid (4pt inside a component, 8pt between components, a non-linear widening scale) and a named shape scale with a per-component-class assignment.

## 2. The scales

### 2.1 Radius — every step is assigned

`--radius-card` is NOT the default; it is the ELEVATED-only step (D6).

| step | value | the only legal consumers |
| - | - | - |
| `--radius-inset` | 0.25rem / 4px | sub-control marks INSIDE a component: keycap, qty badge, segment tick, ghost socket, swatch |
| `--radius-control` | 0.375rem / 6px | anything you operate: button, input, tab cell, item cell, icon button, menu item |
| `--radius-base` | 0.5rem / 8px | grouped content INSIDE a surface: instrument card, portrait, selected list row |
| `--radius-card` | 0.625rem / 10px | ELEVATED / floating islands ONLY: modal, popover, drawer, toast, composer, chat bubble, top-level form group |
| `--radius-full` | pill | chips, badges, avatars, pills, orbs |

### 2.2 Spacing — six steps, assigned per nesting level

| step | value | intent |
| - | - | - |
| `--spacing-tight` | 0.25rem / 4px | atom gaps INSIDE an island: label↔bar, glyph↔text, value↔caption |
| `--spacing-field` | 0.375rem / 6px | related controls within one field group |
| `--spacing-row` | 0.5rem / 8px | between rows / island inner padding at instrument tier |
| `--spacing-block` | 0.75rem / 12px | between blocks / surface inset |
| `--spacing-section` | 1.5rem / 24px | between sections |
| `--spacing-gutter` | 2rem / 32px | page/region gutters |

**Do NOT re-tune `--spacing-field` to 4px "to fix the grid"** (D3): with `tight` present, 6px is the deliberate 2pt sub-step between 4 and 8.

### 2.3 Type — the closed `voice` axis

The seven type sizes are correct and are NOT re-derived (D4 — no measured defect, and a re-derivation churns every surface).

Every authored font size is a `--text-*` step. The root font size is `calc(100% * var(--appearance-font-scale))`, so each rem step follows the user's font-scale setting; a raw length, a keyword, a percentage or a viewport unit does not. Two exceptions: the art initials (`text.art-initial`, `text.band-initial`), which their container sizes, and reading prose, which multiplies a `--text-*` step by its `--appearance-reading-*-scale`. The Stylelint `font-size` allow-list, the ESLint arbitrary-text pattern and `RAW_FONT_SIZE_SYNTAX` in `eslint.config.ts`, and `tests/client/features/app-shell/type-ramp-census.suite.ct.tsx` check this rule; `orb/font-scale-on-root` keeps the root scaler on `:root` alone, and `orb/no-arbitrary-apply` refuses an arbitrary value through `@apply`.

The defect was the KNOB SPACE: `size` (7) × `weight` (4) × `tone` (6) × `transform` (2) = 336 legal combinations, chosen per call site by taste — the mechanism by which nothing recedes. **The law is one CLOSED `voice` axis.** `size`/`weight`/`transform` are `@orb/ui`-INTERNAL; a feature passes `voice`, plus the meaning axes listed below.

The founding grammar — a surface's copy is one of four things:

| voice | means |
| - | - |
| `kicker` | a section's NAME; never a datum. Paired with `<Section kicker>`'s hairline rule, it is the CD1 replacement for a box |
| `label` | the name of ONE datum |
| `datum` | the value — a count, a timer, a numeric readout (tabular figures, so they do not jitter as they tick) |
| `gloss` | the quiet explanatory second line |

**The tuple in `packages/ui/src/primitives/text/variants.ts` is the truth, not a list here** — the axis has grown past four (the content voice, the display voices, the receded twins, the decorative monogram), and a doc table of entries rots the day a voice lands. Each entry's meaning and its discriminator live beside its class string in that file.

**Adding a voice is a RULING, not a convenience.** A new entry enters only with a stated discriminator against its NEAREST existing neighbour — which axis differs (step · face · tabularity · ink · weight · tracking) and why the neighbour's entry is wrong for the case. A voice that resolves to an existing entry's class set is a rename, not a voice. The failure this prevents is real and recurring: a feature one axis short of an existing voice spells `size`/`weight` through `className` instead, which bypasses the semantic voice contract.

`datum` is the body face with tabular figures at the gloss step, in the foreground ink (D5). Machine text you read or copy (an id, a payload, a tool name) takes `code`, never `datum`. A report's one-sentence outcome over the details it summarises takes `lead`, the body step at semibold.

Beside the voice, a feature passes these Text axes, by owner ruling:

- `tone` is colour by meaning: `muted`, `accent`, `destructive`, `success`, `warning`, `info`, `accolade`, the transcript inks `speaker`, `dialogue` and `narration`, `prose` (the reading ink), `foreground` (full ink on a quiet voice) and `onPrimary` (a mark on the primary fill). `text-info` is a tone, never a voice. The map is `TONE_INK` in `packages/ui/src/lib/tone-ink.ts`, shared with `Icon`, `WeaveGlyph` and the Button tones.
- `strike` draws a line-through (a cancelled quest, a disabled section).
- `hiddenAt` (`coarse` or `fine`) and `srOnlyAt` (`coarse`) swap the text per pointer class (§4.3).
- `italic` sets words that are not spoken (a character's thought); `selectAll` makes copyable machine text select whole; `pulse` breathes a working mark, motion-safe only; `hoverCue` (`lift`, `nudge`) is the cue a quiet part gives while its `group` control is hovered.
- `halo` keeps a wordmark readable over live art through the theme-derived shadow recipe. `artScale` sizes decorative initials to their portrait or banner container.

`receded` dims the whole element to the `opacity.receded` token (`opacity-receded`), on Text, Icon, Row, Stack and ListRow. It replaces hand-spelled `opacity-50`, `opacity-60` and a `/60` muted ink with one step, so an archived row and a secondary glyph recede alike.

The `code` voice is Geist Mono at the code step in the foreground ink, for machine text you read or copy: ids, hashes, keys, addresses. `numeric` (tabular figures) is a modifier for a composite that sets its own step, such as `TrackerValue`; a feature readout takes a voice.

## 3. The tier map

**Top axis: `instrument` vs `form`.**

- **instrument** — read-mostly, glanceable, many data per cm². You SCAN it. Density is the feature; chrome is subtracted until only the data is left.
- **form** — write-mostly, one decision per row, airy. You OPERATE it. Chrome carries grouping and affordance.

A surface has exactly ONE tier. A `form` island inside an `instrument` surface is legal and common (an inline-edit popover), and the reverse is too (a readout inside a settings pane) — it is a nested `<Surface tier="form">`. **Nesting a Surface inside a Surface of the SAME tier is RED** (it means someone wrapped for no reason).

### 3.1 Surface class → tier → steps

| surface class | tier | surface inset | between blocks | island pad | atom gap | island radius | islands carry border+bg? |
| - | - | - | - | - | - | - | - |
| CONTEXT panel viewport (rpg tabs, meta tabs) | instrument | `p-block` | `gap-row` | `p-row` | `gap-tight` | `rounded-base` | only interactive cells |
| LIST panes (collection rows) | instrument | `p-field` | `gap-tight` | `p-row` | `gap-field` | `rounded-control` | no — selection is a bg tint, not a box |
| chat transcript | instrument | `p-block` | `gap-row` | `p-block` (bubble) | `gap-field` | `rounded-card` (the bubble IS the elevated island) | yes — one box, never nested |
| composer | instrument | `p-row` | `gap-field` | `p-row` | `gap-field` | `rounded-card` | yes — it floats |
| settings panes | form | `p-section` | `gap-section` | `p-block` | `gap-row` | `rounded-card` (group card only) | group card yes; a setting row never |
| entity editors (character / preset / world-info) | form | `p-section` | `gap-section` | `p-block` | `gap-row` | `rounded-card` | group card only |
| modals / dialogs / popovers / drawers | form | `p-block` | `gap-block` | `p-block` | `gap-row` | `rounded-card` | yes — they float by definition |
| library grid cards | form | `p-block` | `gap-block` | `p-block` | `gap-field` | `rounded-card` | yes — a grid cell IS an interactive island |
| toolbars / chrome rows / strips | instrument | `px-block` | `gap-row` | — | `gap-field` | `rounded-control` (cells) | no |

### 3.2 The chrome diet — three rules

- **CD1 — border + radius + background is reserved for INTERACTIVE ISLANDS and ELEVATED surfaces.** A read-only grouping gets a `kicker` (caps label + hairline rule) and nothing else. If you cannot click it, drag it or select it, and it does not float above the page, it is not a box.
- **CD2 — one box deep, maximum.** A bordered/rounded/filled element whose ancestor is also bordered/rounded/filled is RED. Alignment and separation INSIDE a box are done with hairlines (`border-t` on siblings) and gaps, never a nested card.
- **CD3 — one focal element per surface.** Exactly one element per surface may carry accent fill, glow, or elevated shadow at rest. The visual twin of the one-`intent="primary"`-per-region rule: everything around the focal is deliberately quiet so it stays the one bold thing.

## 4. Mechanism — impossible by construction

Features cannot express the wrong thing because they never express spacing or radius at all (the D294 pattern). Three moving parts.

### 4.1 The tier attribute — ONE writer

`<Surface tier="instrument" | "form">` (`packages/ui/src/layout/surface.tsx`) is the ONLY code in the repo that writes `data-surface-tier`. It renders a containment-neutral wrapper — it does not duplicate `<Container>`'s `container-type`, it composes with it.

**An attribute, not a prop or a context**: `orb/no-layout-context-props` bans the layout-context PROPS listed in `tooling/src/eslint/ui-feature-policy.ts` (`compact`, `inDrawer` among them), and `UI-Architecture-and-Layout.md` §4 states density is the `data-*` attribute axis. This tier is the SURFACE-CLASS axis; the `data-density="comfortable|compact"` USER-PREF axis is orthogonal and untouched (D9).

### 4.2 The tier stylesheet — the map made executable

`packages/ui/src/styles/tiers.css` maps slots to token steps in the `ui` layer, after `utilities`. Each surface supplies inherited tier properties.

```css
[data-surface-tier] [data-slot="card-root"] {
  padding: var(--orb-tier-island-pad);
  border-radius: var(--orb-tier-island-radius);
}
```

Two properties make it a SEAL rather than a suggestion:

1. **Layer order decides the override.** The declared `ui` layer follows `utilities`, so tier rules override primitive utility defaults. Nested surfaces supply their nearest inherited tier values.
2. **`data-slot` already exists** on every primitive, so the map needs no new plumbing.

Check the rendered value with `getComputedStyle(...)` against the document-resolved custom property, never a hardcoded px (§5.3).

### 4.3 Primitive API deltas the law forced

[D336](../adr/0336-tone-roles-and-one-variant-vocabulary.md) amends the colour, fill, size and use-specific axes below for `Card`, `Button`, `Badge`, `Text`, `ListRow`, `Row`, `Stack`, `Section` and `Grid`. That amendment is not yet built; [item 1421](../work/1421-build-the-tone-role-tier-and-one-variant.md) tracks it, and each step rewrites the rows it changes.

| primitive | delta | why |
| - | - | - |
| `Surface` | `tier` (required) | the one tier writer |
| `Card` | No spacing-scale padding axis; `padding="none"` delegates the inset; `elevated?: boolean` | Padding stays tier-resolved. The owner-ruled delegation exception supplies no alternate spacing value. `elevated` opts into the floating radius and shadow. |
| `Text` / `Heading` | `voice` (§2.3); `tone`, `strike`, `receded`, `hiddenAt`, `srOnlyAt`, `solidLine` (a mark sized by its container takes its own em as the line box); `size`/`weight`/`transform` are `@orb/ui`-internal | collapses 336 taste combinations to named intents; meaning colour and pointer-class swaps are props, never classes |
| `Card` | `shape`: `island` (default) · `row` (one operable or listed row as its own box, `--radius-control`) · `well` (a recess inside a box: no border, `bg-muted`, `--radius-control`) · `float` (a composer-class island in a room's column: `--radius-card` and the field inset, no shadow) · `inset` (`--radius-inset`, a pane in a preview) · `plate` (the fill alone under a line that crosses art) · `pill` · `bubble` (the transcript's bubble box, `MESSAGE_BUBBLE_BOX`); `tone` gains `clear` (border only), `accent`, `sidebar` (the rail's fill and edge), `translucent` (`bg-card/80`), `backdrop` (`bg-background/80`), `input` (the field edge, no fill), the status tints `successTint` · `warningTint` · `destructiveTint` · `infoTint` (fill and held-back edge, no ink), `primaryEdge`, `primaryOutline`, `raised`, `sidebarEdge`, `popover`, `mutedWash` and the role bubbles `bubble` · `userBubble` · `systemBubble` (`MESSAGE_BUBBLE_FILL`); `rail` (a 2px leading edge for a set state); `shadow` (`follow` the user's elevation, `none` for a diagram that draws one elevation, `overlay`); `holdsField` and `dropTarget` (a field host's hover, focus and armed-drop states); `presence` (a floating chip that comes and goes); `spoiler`; `receded` (a message held out of the model's context); `focusable` (a programmatic focus region draws the ring); `ownSlot` | a bordered, rounded, filled `Row` or `Stack` is a `Card`, not a layout box with paint (owner ruling); `tiers.css` re-declares the shape radius inside a tier, and `ownSlot` keeps an owner-CSS hook's slot, which takes the card out of the tier map |
| `Avatar` | `cardCorners` (`start`, `end`: a portrait welded to a card's side) | a welded portrait's outer corners follow the card it welds to |
| `Icon` | `tone` (the Text map) · `shadow` (`drop-shadow-sm`, for a glyph over art or a bubble) · `receded` · `pulse` · `openTurn` (a placed disclosure chevron turns with its panel) · `yieldOnHover` (a marker steps aside while its row's revealed cluster shows the same fact) | an icon's ink is a meaning, like text's |
| `Button` | `intent="link"`: an underlined action in the primary ink, no fill; `intent="solid"`: the primary fill without the CTA lift (a ready glyph disc); `intent="bare"`: a button that wraps a picture and draws nothing; `tone` (`primary`, `destructive`, `warning`, `muted`, `foreground`, from `TONE_INK`) on the fill-less `ghost`, `link`, `outline` and `secondary` intents; `selection="rail"` (the start rail and tint of a selected row); `underline="dotted"`; `reserveEdge` (a click-to-edit value holds its editor's 1px edge); `confirming` (the accent ring for a change that landed); `quietDisabled` (a teaching control keeps full strength); `focusRing="sidebar"`; `hiddenAt`; `touchFloor="inline"`; `cardCorners` (a button over a part flush in a card's corners traces them) | a link-styled action is a Button intent; navigation is an anchor |
| `Row` / `Stack` | `hiddenAt` · `srOnlyAt` · `touchFloor` (`block`: the box's own block size; `gap`: `gap-block` between tiled control cells) at a coarse pointer; `divider` (`start`, `end`, `top`, `bottom`: one 1px edge in `--color-border`; `between`: a hairline under every sibling but the last) with `dividerWeight` (`rule`, 2px), `dividerTone` (`primary`, `warning`, `sidebar`) and `dividerStyle` (`dashed`, a doorway); `receded`; `ground` (a band's or a page's fill with no edge or radius, from `packages/ui/src/lib/ground.ts`; `backgroundUnlessArt` steps aside over a wallpaper; `bubble`, `userBubble` and `systemBubble` are a band inside a message bubble, `readingBand` the opaque reading plate); `plate` (the wallpaper-gated plates, `WALLPAPER_PLATE`: `band`, `chrome`, `island` (the chrome plate without its inset), `reading` (a reading column's plate and prose ink), `loading`, `error`, `card` (the opaque card pair as an inset island)); `cardCorners` (`all`, `top`, `bottom`, `topStart`, `topEnd`, `start`, `end`: a part flush in a card's corners takes the card radius on those corners, from `packages/ui/src/lib/card-corners.ts`; it draws no edge); `focusTarget` (a programmatic focus target draws no outline); `scrollFade` (`x`, `y`); `Row` `reveal` (`hover`, `faint`, and `interactive` and `focus`, which are also inert while hidden), `inertUntilHover`, `stateFill` (`expanded`, `selected`), `tracks` (`gutterCentred`, the `Grid` tracks on a row that must keep its element); `Stack` `highlight`, `spoiler`, `slide` (`shown`, `parked`), `lifted`, `fade` with `fadeFrom`, `ink` (`prose`, the reading ink; `muted`, which holds over a wallpaper plate), `opacityMotion`, `hoverDim` (`self`, `parent`: art that is its own tap target dims under the pointer), `arrival` (`from`, `settle`: a list item that genuinely arrives), `imageFit` (`cover`, `underFeather`: how a background image fills the box, kept off inline style so owner CSS can restyle it); `Container` `ground` | pointer capability is a primitive prop, never a feature's pointer variant; the strings live in `packages/ui/src/lib/pointer-visibility.ts`, `packages/ui/src/lib/touch-floor.ts` and `packages/ui/src/lib/hover-reveal.ts`; a box with an edge is a `Card`, never a `ground` |
| `ListRow` | `revealActions` · `receded` | the trailing cluster hides at rest and shows on the row's hover or focus-within, opacity only; a coarse pointer keeps it shown |
| `Badge` / `CollapsibleTrigger` | `touchFloor="block"` | a chip or a text-height disclosure takes the touch floor on its own box at a coarse pointer |
| `Input` | `numeric` (tabular figures); `width` reaches the element; `typeStep="title"` (held inside a tier by `tiers.css`); `italic` | the edit twin of a value keeps its columns, step and slant |
| `Swatch` | `fill` · `shape` (`square`, `pill`) · `edge` (`ring`, `outline`) | a decorative mark that is its colour (a palette sample, a presence dot, a pane in a preview) is a primitive, never a painted layout box |
| `Tabs` | `topRule`; `TabsList` `rule="none"` and `fold`; `TabsTab` `layout="cell"` and `quiet`; `TabsPanel` `ground` | a rail of view switches owns its selected cell's tint and bar |
| other parts | `CollapsiblePanel` `holds="controls"` · `Separator` `tone` · `Skeleton` `variant="portrait"` · `Textarea` `chrome="bare"` and `face="code"` · `Badge` `intent="accent"`, `face="code"`, `sentenceCase` · `Select` `strong` · `DialogHeader` `sticky` · `Command` `elevated` · `BackgroundVideo` `fit` and `rounded` · `CrossfadeImage` `rounded` · `MenuItem` `hiddenAt` · `WebSpinner` and `WeaveGlyph` `tone` | each was a feature className; the paint is the primitive's own variant |
| `Section` | `kicker` (caps micro label + hairline rule) + `kickerLayout: "stacked" \| "inline"` | the CD1 replacement for a box. The INLINE spelling makes the rule the section's own `border-top` and lets the kicker LEAD the control line — naming two groups costs +2px inline against +22px stacked |
| `Stack` / `Row` / `Grid` | `gap` carries `tight` | the small-end step |
| `ListRow` | no per-row border; selection is a bg tint + `rounded-control` | CD1 for the LIST class |
| `Button` | `intent="outline"` · `size="chip"` · the `selection: none \| on \| negated` state layer | `ghost`'s ink with `secondary`'s edge is what a filter chip needs and neither could spell it; a TRI-STATE facet cannot be a `Toggle` (`aria-pressed` has two values) |
| `Toggle` | `intent="outline"` + `intent="command"` · `size="chip"` · `shape` (`control`/`pill`) | a scope filter and a tag filter share one rail and must share one box; a view COMMAND that redraws the pane is not one of the words beside it |
| `packages/ui/src/lib/control-size.ts` | `CHIP_BOX` beside `CONTROL_SIZE` | the rail cell in ONE home for both pressable primitives. Its height is `--size-touch-target`, not a control step: pointer-conditional, so the box IS the tap floor |

Features keep composing `<Stack gap>` / `<Row gap>` explicitly — the gap union is already token-only. What is NOT a feature-level choice is ISLAND padding and radius.

Art recipes are primitive choices: Card and Stack expose `artDecoration` for speaker edges and portrait reservations. Stack owns `artMask`, `artPane`, `columnMeasure`, `feather` and its runtime `featherSrc`. The consumer-local formulas preserve carried-theme and density values. Text owns `artScale` and `halo`; none introduces another text voice.

**A radius differentiates nothing unless an edge draws it.** The chip pill radius was live and invisible for months because at rest the chips were transparent with a zero-width border — the measured defect that forced the `outline`/`chip`/`selection` deltas above.

## 5. Enforcement

### 5.1 Static enforcement status

The surface census (`tests/client/features/app-shell/surface-census.suite.ct.tsx`) mounts every registered section, modal and settings group and reads the rendered page. It refuses a `Surface` inside a `Surface` of the same tier (§3), a boxed `Card` inside a boxed `Card` (CD2), and a second visible primary control in one region (the rendered form of CD3). It does not judge whether a grouping is read-only (CD1) or count accent fills on elements other than the primary button; those stay review work.

### 5.2 Grant policy

D333 ends custom density allowlists and waiver markers. No custom static checker enforces these visual rules.

### 5.3 Computed-value CT assertions

The external legacy source contains `legacy-source/ui/density-tier.suite.ct.tsx` as a reference. It is not part of this repository's test or CI population. Rebuilt CTs should read rendered values:

1. `getComputedStyle(card).paddingTop` equals the document-resolved `--spacing-row` under `tier="instrument"` — resolve the var from the same document, never compare to a hardcoded px.
2. RELATIONAL: for the same primitive, form-tier padding > instrument-tier padding. This survives any future token retune; an absolute assertion does not.
3. `borderRadius` under `tier="instrument"` equals resolved `--radius-base`, and a nested elevated card equals `--radius-card`.
4. CD3: a fixture surface contains exactly ONE focal-marked element.
5. Nesting: a `form` Surface inside an `instrument` Surface resolves form steps for its own subtree — this proves the descendant selector, not just the root.

Mount once per test (a second `mount()` throws) — N tests, never N mounts in one.

## 6. Extending the map

Adding a surface class, a step, or a voice touches a fixed set. Land them together or the addition is half-registered.

| you are adding | coupled sites |
| - | - |
| a surface class row (§3.1) | the §3.1 row · the `tiers.css` rules for its slots · the surface's `<Surface tier>` call site · a §5.3 CT case if the class introduces a new slot |
| a token step (§2.1/§2.2) | `packages/ui/src/tokens/tokens.json` (with its `$description` stating the assignment) · `pnpm --filter @orb/ui tokens:build` (`packages/ui/src/styles/theme.css` and `packages/ui/src/tokens/index.ts` are GENERATED) · the §2 table · the primitive variant union that exposes it. **A dead/unused token is a build error** |
| a `voice` entry (§2.3) | `packages/ui/src/primitives/text/variants.ts` (the tuple IS the truth) with the discriminator stated beside the class string · the §2.3 discriminator rule, NOT a new doc row · state the product discriminator beside the voice entry |
| a `data-slot` the map keys on | the primitive that EMITS it · the `tiers.css` rule |

A sweep stage that converts call sites ends with a `side-eye` pass against the surface, and side-eye findings are fixed in full before the stage closes — side-eye is the polish authority here, not an advisory.

## 7. Ruled decisions (owner, standing)

| # | decision | ruling |
| - | - | - |
| D1 | instrument island padding: `row` (8px) or `field` (6px) | `row` — the approved mocks measure 8px vertical |
| D2 | add `--spacing-tight` (4px), or round the 3–5px cases up to `field` | ADD it — 4px is the 4pt-grid floor and the instrument internals live in that band |
| D3 | `--spacing-field` = 6px is off the 4pt grid; retune to 4px? | LEAVE it — with `tight` present it is the deliberate 2pt sub-step |
| D4 | re-derive the type scale on a 1.2 minor-third ratio | NO — no measured defect; a re-derivation churns every surface for aesthetics |
| D5 | the `datum` voice's face, figures and step | the body face with tabular figures at the gloss step, in the foreground ink; machine text takes the `code` voice |
| D6 | demote `rounded-card` to ELEVATED-only | YES — the single highest-leverage line in this law, and the biggest visible change |
| D7 | retire `Card.padding` (a breaking primitive API change) | RETIRE — a surviving prop is a surviving escape hatch |
| D8 | two tiers, or a third `gallery` tier for library grids | TWO — library grids map cleanly onto `form` |
| D9 | keep the user-pref `data-density="comfortable\|compact"` axis alongside tiers | KEEP, orthogonal |
| D10 | the exact instrument paddings in §3.1 are taste-level | ship the table; tune from a side-eye pass, never in the abstract |
| D11 | preset editor's compressed type ramp (10.5/13/15/16px, ratio 1.524:1) — accept and record, or widen a step | ACCEPT AND RECORD — a dense `form` may run a compressed size ramp (≥1.5:1 across its body sizes) when grouping is carried by the `kicker` voice + `Section` rules, not by size. Measured on the preset editor (`e51663b49`): `13px/500` ×28 (control labels), `15px/400` ×12 (body), `13px/400` ×5, `10.5px/600` ×5 (kickers), `16px/600` ×1 (the h2); the kicker's discriminating class string is the `kicker` entry in `packages/ui/src/primitives/text/variants.ts` (`font-sans text-micro leading-micro tracking-micro font-semibold uppercase text-muted-foreground`). Keep the page font-size census as descriptive evidence. Judge hierarchy through semantic roles, governed voices and rendered review. |
