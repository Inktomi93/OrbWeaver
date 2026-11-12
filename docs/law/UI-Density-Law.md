---
kind: law
status: active
updated: 2026-10-30
---

# UI density law — the assignment law for the token scales

> Scope: visual density and the token ramps in `packages/ui/src` + `packages/client/src`. Not IA, not color (D71 owns palettes), not motion. Section numbers are stable because code comments and design decisions cite them.

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

`paddingInline` at `block` and `section` holds against the viewport at enlarged text, so a phone keeps its width for the text. It writes `--spacing-inset-block` and `--spacing-inset-section`: the step, capped at a share of the screen and never below its value at the default size. A `section` reach and scroll inset cross the same held inset, and the shell's narrow content pane steps down to the held block inset. `padding`, the one-edge props and the narrow arms do not hold. The nested indent holds through `--spacing-indent`, whose rule lives in its description in [tokens.json](../../packages/ui/src/tokens/tokens.json).

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

- `tone` is colour by meaning, one of the D336 tones in the `TONES` tuple of `packages/ui/src/tokens/index.ts`. It paints the tone's `text` role. `text-info` is a tone, never a voice.
- `ink` names an ink that is not a tone: `muted`, `foreground` (full ink on a quiet voice), `accolade`, the transcript inks `speaker`, `dialogue` and `narration`, `prose` (the reading ink), `toneForeground` (a mark on the enclosing tone's fill) and `inherit` (text inside a filled control). The prop types make `ink` and a non-neutral `tone` exclusive.
- The maps are `TONE_TEXT` and `INKS` in `packages/ui/src/lib/tone-ink.ts`, shared with `Icon`, `WeaveGlyph`, `WebSpinner` and the fill-less Button styles.
- `strike` draws a line-through (a cancelled quest, a disabled section).
- `truncate` clips one line with an ellipsis. A flex child that must give way beside a sibling still adds its own `min-inline-0`.
- `hiddenAt` (the `HIDDEN_AT` table in `packages/ui/src/lib/pointer-visibility.ts`: a pointer class, `always`, `empty`, `print`, a stacked dialog, a container step) and `srOnlyAt` (`coarse`) say when the text leaves layout (§4.3).
- `italic` sets words that are not spoken (a character's thought); `selectAll` makes copyable machine text select whole; `pulse` breathes a working mark, motion-safe only; `hoverCue` (`lift`, `nudge`) is the cue a quiet part gives while its `group` control is hovered.
- `halo` keeps a wordmark readable over live art through the theme-derived shadow recipe. `artScale` sizes decorative initials to their portrait or banner container.

`receded` dims the whole element to the `opacity.receded` token (`opacity-receded`), on Text, Icon, Row, Stack and ListRow. It replaces hand-spelled `opacity-50`, `opacity-60` and a `/60` muted ink with one step, so an archived row and a secondary glyph recede alike.

The other opacity steps name what the element is and are spelled only by `@orb/ui` recipes and stylesheets, never by a feature: `opacity-disabled` (a control, label or item that cannot be used), `opacity-dragging` (an item held by a drag), `opacity-loading` (a surface waiting on its own work), `opacity-hover` (the dim a quiet tap target gives under the pointer), `opacity-faint` (chrome that only hints at itself), `opacity-quiet` (a resting caption a step quieter that still reads as body text), `opacity-resting` (the mark of a control that is off) and `opacity-grain` (the surface grain film). A neutral colour never takes an opacity modifier (`bg-foreground/45`, `text-muted-foreground/60`): a recipe paints an opaque role or colour token, or an element opacity step. The `opacity` group in `packages/ui/src/tokens/tokens.json` is the truth. No step is a number, and an animation keyframe waypoint stays a literal.

The `code` voice is Geist Mono at the code step in the foreground ink, for machine text you read or copy: ids, hashes, keys, addresses. `numeric` (tabular figures) is a modifier for a composite that sets its own step, such as `TrackerValue`; a feature readout takes a voice.

### 2.4 Ramps

- Derive ramp values from this law: touch floors, density, reading measure, integer line boxes and the type hierarchy. Change a law-pinned value only with its reason, a stronger standard, its visible effect and the matching law edit.
- Semantic dimension tokens alias a step of their own primitive ramp; structural geometry keeps its documented exceptions. A sum across ramps is one such exception, as is the difference of two steps of one ramp, and each lives in `orb.cssValues` with its provenance: `--size-control-clearance` is the room kept clear of a floating control (the `control-sm` box and one `row` step), `--dimension-room-flank` is the inline room the plugin column and its gap take (the transcript and the composer both keep it clear), `--dimension-room-flank-fit` is the room width that seats the column beside the reading floor, and `--size-room-island-inset-narrow` is the side padding a room island keeps at a narrow width (the `field` step less the `tight` step). The room steps the composer in by the avatar reach to meet the transcript's rows, and the island gives up the `tight` step from its own padding so what it holds keeps its place. None is a spacing step. A value that reads a density step resolves at the element that declares it, so `packages/ui/tokens.build.ts` declares each such entry again under `[data-density]`, read off its value, and the formula keeps its one home in `orb.cssValues`. Primitive variables stay private. Semantic variables are served whether or not a utility uses them.
- Name space, size and leading steps by their integer px at the 16px root. Radius and type steps are ordinal. A value never changes under a stable px name.
- Border and ring weight is one ordinal ramp, `--border-width-*`: `default`, `hairline`, `control`, `rule`, `heavy`. `default` backs every plain `border`, `border-s`, `divide-*` and `ring` through `--default-border-width` and `--default-ring-width`, and `control` aliases it. A heavier edge is a named step (`border-s-rule`, `ring-(length:--border-width-rule)`); a numeric width (`border-2`, `ring-2`) is never written. The two `--default-*` variables are Tailwind's compile-time defaults, private to the build; an owner retunes `--border-width-default`. A focus ring takes its weight from `--border-width-rule` (`ring-` and `outline-`) and its offset from `--focus-ring-offset`; a numeric `ring-offset-*` or `outline-*` width is never written, and a ring that must stay inside its own box is inset. The step is not named `accent`, because `border-accent` reads the accent colour.
- Reset the governed Tailwind namespaces. Retained lint owns class vocabulary, arbitrary values, inline dimensions and built class strings.
- Rename a token, utility or primitive choice and migrate its consumers in one change. Add no compatibility alias and no unused condition.
- Tokens hold one condition vocabulary. A condition names a layout fact, a capability or a preference, never a device class. Tokens own the queries and the generated `MEDIA_QUERIES`.
- Fix generator output at the generator. Never widen a lint exception for invalid generated bytes.

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
- **CD3 — one focal element per surface.** Exactly one element per surface may carry accent fill, glow, or elevated shadow at rest. The visual twin of the one-focal-Button-per-region rule: everything around the focal is deliberately quiet so it stays the one bold thing.

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

[D336](../adr/0336-tone-roles-and-one-variant-vocabulary.md) rules the colour, fill and size axes below: `tone` is colour, `variant` is fill style, `ink` is a named ink and `size` is the control scale. The use-specific components that left `Card`, `Button`, `Badge`, `ListRow`, `Row`, `Stack`, `Section` and `Grid` own their skins in their own `variants.ts`.

| primitive | delta | why |
| - | - | - |
| `Surface` | `tier` (required) | the one tier writer |
| `Card` | No spacing-scale padding axis; `padding="none"` delegates the inset; `elevated?: boolean` | Padding stays tier-resolved. The owner-ruled delegation exception supplies no alternate spacing value. `elevated` opts into the floating radius and shadow. |
| `Text` / `Heading` | `voice` (§2.3); `clamp` (`1` to `4`: caps the lines and reserves none) beside `lines` (caps the lines and reserves them; a run takes one of the two); `grow` (`true`, `content`, `double`: the run's flex share) and `floor` (`title`, `field`, `line`: the width the run starts from); `cap` (the widest the run grows, from the box's `CAP` table in `packages/ui/src/lib/width.ts`: `prose` is a paragraph's measure, `reading` the transcript's, `fit` the parent's width); `width` (the box's `WIDTH` table); `textAlign` (`start`, `center`, `end`, also on `Stack`, `Button` and `Input`; `Stack` adds `endWide` above the `cq-40` step); `inset` (`control`: a run set in line with the labels of the controls beside it, also on `Button`; `island`, `block`, `blockInline`: the run is the whole of its box); `flow` (`block`: a line of its own; `cluster`, `clusterTight`, `clusterField`: a run that holds a glyph or a chip beside its words; `lineField`, `baselineRow`: the same on a whole line); `push`, `self`; `passThrough` (the `Row` meaning); `maxHeight` and `scroll` (a run that scrolls in its own box); `wrap` (`word`, `anywhere`, `all`: where a long run may break; `all` breaks machine text at any character); `scroll` (`both`: a preformatted payload that runs past its box on either axis); `tone`, `ink`, `strike`, `receded`, `hiddenAt`, `srOnlyAt`, `solidLine` (a mark sized by its container takes its own em as the line box); `size`/`weight` are `@orb/ui`-internal | collapses 336 taste combinations to named intents; meaning colour and pointer-class swaps are props, never classes |
| `Card` | `width`, `cap`, `height` (`fill`) and `centres` (the card holds one mark in its middle); `shape`: `island` (default) · `row` (one operable or listed row as its own box, `--radius-control`) · `float` (a composer-class island in a room's column: `--radius-card` and the field inset, no shadow) · `inset` (`--radius-inset`, a pane in a preview) · `plate` (the fill alone under a line that crosses art) · `pill` · `bubble` (the transcript's bubble box, `MESSAGE_BUBBLE_BOX`); `variant`: `surface` (default: the card fill and the tone's edge) · `soft` (the tone's tint and on-tint ink) · `outline` (the edge alone), where a colour tone's `soft` or `outline` box is a status box whose border paints the tone's `solid`; `tone` (a D336 tone), plus the use-specific surfaces `background`, `accent`, `sidebar` (the rail's fill and edge), `sidebarEdge`, `translucent` (the reading plate's fill and ink), `popover` and the role bubbles `bubble` · `userBubble` · `systemBubble` (`MESSAGE_BUBBLE_FILL`) until their named components land; `dashed`; `rail` (a 2px leading edge for a set state); a static card takes no shadow, an `interactive` card follows the user's elevation and an `elevated` card always lifts, with `shadow="overlay"` for a floating chip or a preview island; `holdsField` and `dropTarget` (the composer island's hover, focus and armed-drop states); `presence` (a floating chip that comes and goes); `spoiler`; `receded` (a message held out of the model's context); `focusable` (a programmatic focus region draws the ring); `ownSlot` | a bordered, rounded, filled `Row` or `Stack` is a `Card`, not a layout box with paint (owner ruling); `tiers.css` re-declares the shape radius inside a tier, and `ownSlot` keeps an owner-CSS hook's slot, which takes the card out of the tier map |
| `MessageBubble` | `flow` (`weld`: the body beside its portrait; `stack`: the body down the card) | the transcript's card owns how its content lays out, so a skin picks a `flow` value and never writes the flex itself |
| `Avatar` | `cardCorners` (`start`, `end`: a portrait welded to a card's side) | a welded portrait's outer corners follow the card it welds to |
| `Icon` | `tone` and `ink` (the Text maps) · `shadow` (`drop-shadow-sm`, for a glyph over art or a bubble) · `receded` · `pulse` · `openTurn` (a placed disclosure chevron turns with its panel) · `yieldOnHover` (a marker steps aside while its row's revealed cluster shows the same fact) | an icon's ink is a meaning, like text's |
| `Button` | `variant`: `solid` (default) · `outline` · `ghost` · `link` (an underlined action, no fill) · `bare` (a button that wraps a picture and draws nothing); `tone` (a D336 tone; `primary` by default on `solid` and `link`, `neutral` on the others, where a neutral style takes its host's ink); `ink` (the Text map) on a fill-less style; `focal={false}` keeps a solid primary without the CTA lift (a ready glyph disc); `size` (the control scale `chip`, `sm`, `md`, `lg`, from `CONTROL_SIZE`: the step is a height floor, and a label wider than its column wraps between its words, so Button and Toggle never outgrow a phone column); `square` (icon-only), `wrap` (multiline, which breaks a long word and stays inside its parent) and `stacked` (a block of lines in a start-aligned column that grows from the step's height) each reshape a scale step and never combine; `width` (the `WIDTH` table), `cap`, `grow`, `floor`, `minHeight`, `minWidth`, `self`; `explainsDisabled` (a disabled control keeps the pointer, so the tooltip that says why can open); `justify` (`start`: the label set at the line's start; `between`: the label and its mark at the two ends); `stretch` (`row`: the room left beside siblings; `line`: a whole list line with the field inset; declared after `size` so its inset wins, and both set the label at the start, `line` at the full width, so a call site names no `justify` or `width` beside it and a `square` takes none); `whitespace` (`normal`: a label that wraps at spaces, on `Badge` too); `inset` (`control`; `none`: the mark inside is the whole visible box); `selection="rail"` (the start rail and tint of a selected row); `underline="dotted"`; `reserveEdge` (a click-to-edit value holds its editor's 1px edge); `confirming` (the accent ring for a change that landed); `quietDisabled` (a teaching control keeps full strength); `focusRing="sidebar"`; `hiddenAt`; `touchFloor="inline"`; `cardCorners` (a button over a part flush in a card's corners traces them) | a link-styled action is a Button style; navigation is an anchor |
| `PictureButton` | `caption` (`start`, `centre`: a tile with its caption under the picture, or a lone mark in the middle of the tile), and every family axis through `ButtonCore`, as `InlineAction`, `GlyphButton`, `HintTrigger`, `CopyButtonTrigger` and `CommandAuxiliaryButton` take them | a picture tile's stack is one idea, so a caller never lays it out |
| `BandButton` | the ghost control that names a region in a list pane: the sm height with the tight gap and inset, and every other Button axis | a list pane's region is not a scale step, so D336 makes it a named component |
| `Row` / `Stack` | `padding` (a spacing step on all four sides) with `paddingInline` and `paddingBlock` (the same steps on one axis, writing `px-*` and `py-*`), `paddingBlockStart`, `paddingBlockEnd`, `paddingInlineStart` and `paddingInlineEnd` (the same steps on one edge, for an edge that clears something: `clearance` on a block-start or inline-end edge is the room kept clear of a floating control), `paddingInlineNarrow` (the inset a box gives up at a phone-width pane), `paddingInlineEndNarrow` (the same on the inline-end edge alone), `paddingBlockStartNarrow` (`none`: the block-start inset given up there), and `gapNarrow` (`none`, `tight`, `field`, `row`: the gap a box gives up at that pane, on `Row` and `Stack`); `indent` (a nested level: what hangs under a parent row or beside a leading rule, one `block` step at every level, so a feature picks no indent); `layer` (`raised`, `overlay`: the box's layer in its stacking context); `push` (`inlineEnd`, `inlineStart`, `blockEnd`, `blockCentre`: where a flex child sends its line's free space, an auto margin and never a spacing step, so no feature picks a length; on `Text`, `Button`, `EmptyState` and `DialogFooter` too); `self` (the `SELF` table in `packages/ui/src/lib/flex-share.ts`: a child's own place across its parent's line, against the parent's `align`; `railEnd` and `railStart` hug the centred column from a rail, on `Text`, `Button` and `CollapsibleTrigger` too); `placed` (the `PLACED` table in `packages/ui/src/lib/placed.ts`: a box out of its parent's flow, by what it is, on `Button`, the button family and, for the entries each needs, `Avatar`, `Skeleton`, `WebWeave` and `ThemePreviewPane` too); `passThrough` (a box laid over content takes no pointer, so clicks fall through to what lies under it and only a child that asks for the pointer takes it, on `Text`, `Avatar`, `Swatch` and `TooltipPopup` too); `reach` (`row`, `section`: the box crosses its parent's inset and pays it back, on `Grid` too; on `Row` also `column` and `page`, the two reading boxes' insets, and `header` and `foot`, a message card's edges; the reading insets and their reach are one table, `READING_INSET` in `packages/ui/src/lib/reading-inset.ts`); `width` (the box's own inline size: `full`, `fit`, a control's or a picture's width, a named column, on `Grid` and `Container` too, where `cap` is the widest it may grow); `Stack` `centred` (on `Container` too); `minHeight` and `minWidth` (`MIN_HEIGHT` and `MIN_WIDTH` in `packages/ui/src/lib/width.ts`: the least size a box holds, by what must fit in it) with `maxHeight` (`MAX_HEIGHT`: the most block size a box takes before it scrolls); `hiddenAt` (the `HIDDEN_AT` table: a pointer class, `always`, `empty`, `emptyBody`, `print`, a short or stacked dialog, a container step; `untilFocus` and `focusInFlow` are a skip link, out of sight until the keyboard reaches it) · `srOnlyAt` · `touchFloor` (`block`: the box's own block size; `gap`: `gap-block` between tiled control cells) at a coarse pointer; `divider` (`start`, `end`, `top`, `bottom`: one edge at the default border width in `--color-border`; `between`: a hairline under every sibling but the last) with `dividerWeight` (`rule`, the `rule` border-width step), `dividerTone` (`sidebar`), `tone` (a colour tone stamps the box and paints its divider edge in the tone's `solid` role) and `dividerStyle` (`dashed`, a doorway); `receded` (a `Stack` eases its opacity both ways); `ground` (a band's or a page's fill with no edge or radius, from `packages/ui/src/lib/ground.ts`; `backgroundUnlessArt` steps aside over a wallpaper; `bubble`, `userBubble` and `systemBubble` are a band inside a message bubble, `readingBand` the opaque reading plate); `plate` (the wallpaper-gated plates, `WALLPAPER_PLATE`: `band`, `chrome`, `island` (the chrome plate without its inset), `reading` (a reading column's plate and prose ink), `loading`, `error`, `card` (the opaque card pair as an inset island)); `cardCorners` (`all`, `top`, `bottom`, `topStart`, `topEnd`, `start`, `end`: a part flush in a card's corners takes the card radius on those corners, from `packages/ui/src/lib/card-corners.ts`; it draws no edge); `focusTarget` (a programmatic focus target draws no outline); `scrollFade` (`x`, `y`); `Row` `stackBelow` (`cq-28`, `cq-32`, `cq-40`, `cq-64`: the row turns into a column below that container step) with `alignBelow` (`stretch-<step>`: the stacked children take the full width; `end-cq-28`: they pack to the end, for a row that reads from the trailing edge) and `endBelow` (the trailing cluster lines up at the end); `Row` `inline` (the row sits inside a line of text, as wide as its content); `Row` `wrap` (`true`, `cq-20` below that container step, or `untilCq28` until a phone-width pane stacks them: children that run out of room take a second line instead of squeezing; on `DialogHeader` too) and `reverse` (`true`: the row reads from its end at every width; `cq-28`, `cq-32`, `cq-40`, `cq-64`: below that container step, beside `stackBelow`) and `outOfFlow` (a box parked out of flow, unpainted and inert, so a measure can read it); `Row` `reveal` (`setting`, a named field group; `hover`; `faint`; and `interactive` and `focus`, which are also inert while hidden), `inertUntilHover`, `tracks` (`gutterCentred`, the `Grid` tracks on a row that must keep its element); `Stack` `readingFlow` (`weld`, `page`: a reading box keeps its element across the skins, so its flow is a choice here) and `fade` with `fadeFrom`, `ink` (`prose`, the reading ink; `muted`, which holds over a wallpaper plate), `hoverDim` (`self`, `parent`: art that is its own tap target dims under the pointer), `arrival` (`from`, `settle`: a list item that genuinely arrives), `imageFit` (`cover`, `underFeather`: how a background image fills the box, kept off inline style so owner CSS can restyle it); `Container` `ground` | pointer capability is a primitive prop, never a feature's pointer variant; the strings live in `packages/ui/src/lib/pointer-visibility.ts`, `packages/ui/src/lib/touch-floor.ts` and `packages/ui/src/lib/hover-reveal.ts`; a box with an edge is a `Card`, never a `ground` |
| `Row` / `Stack` / `Grid` flow | `align` and `justify` (the cross and main axis; `center` and `end` are the safe forms, so a line its content outgrows falls back to the start); `order` (`lastUntilWide`: a wrapped child queues behind its siblings until the container seats it beside them); `Row` `pinned` (`dialogFooter`, `header`, `headerOutside`: a row pinned to the foot of a scrolling dialog body, or a message's name row pinned to the scrollport's top); `height` (`fill`, the parent's whole block size, or a named fixed one; `Row` `none` takes no room, for a box only a measure reads); `Stack` `scroll` (`y`: the box scrolls on the block axis inside a bounded parent); `Stack` `rows` (`control`: every direct child floors at the control height); `Stack` `container` (the box is the container its descendants query); `Stack` `artDim` (`rest`, `lift`: art that rests dimmed) and `featherToward` (`left`: the side a feathered band dissolves toward); `Grid` `cols` (the track sets, whose tuple in `packages/ui/src/layout/variants.ts` is the truth) with `gapInline` and `gapBlock` (the two axes of a grid are different jobs: columns and rows) and `scrollInset` (a snapping track keeps its edge item clear of the scrollport); `Container` `scroll`; `Contents` (an element that adds no box, for a landmark, a role or a data slot that must not move its children) | the flow axes the other rows do not name; each is a design idea on a ramp or a meaning |
| `ListRow` | `receded` | the whole row at the receded step, for a row that stands behind its live siblings |
| `Badge` / `CollapsibleTrigger` | `touchFloor="block"` | a chip or a text-height disclosure takes the touch floor on its own box at a coarse pointer |
| `Input` | `numeric` (tabular figures); `width` reaches the element; `grow`, `floor`, `textAlign`; `typeStep="title"` (held inside a tier by `tiers.css`); `italic`; `clearsGlyph` (the text stops short of a glyph floating over the inline end, by the `clearance` step) | the edit twin of a value keeps its columns, step and slant |
| `Input` / `Select` / `NumberField` / `Combobox` / `Autocomplete` / `ColorField` | `size` (the control scale, default `sm`); `NumberField` `layout="inline"` (the knob cell) | a field sits level with the buttons and toggles of its row; its type stays `text-field` at every step, the focus-zoom floor |
| `Swatch` | `fill` · `shape` (`square`, `pill`) · `size` (`dot`, `dotLg`, `avatarMd`: steps of the `--size-*` ramp; `fill`, `line`) · `edge` (`none`, `ring`, `outline`, `dashed`) | a decorative mark that is its colour (a palette sample, a presence dot, a pane in a preview) is a primitive, never a painted layout box |
| `Corner` | `inset` (`field`, `tight`) | a count, lock, dot or close pinned to its host's block-start, inline-end corner is a `Corner` around the mark, never a prop on the mark; its placement lives in `packages/ui/src/lib/placed.ts` |
| `Tabs` | `topRule`; `TabsList` `rule="none"` and `fold`; `TabsTab` `layout="cell"` and `quiet`; `TabsPanel` `ground` | a rail of view switches owns its selected cell's tint and bar |
| other parts | `Field` `width="content"` · `CollapsibleTrigger` `width`, `grow`, `floor`, `textAlign`, `inset` (`block`: a disclosure that is a whole block of its parent) · `CollapsiblePanel` `holds="controls"`, `offset` (`row`, `block`: the room below the disclosure, inside the panel so a closed panel keeps none) · `VirtualList` `grow`, `height`, `maxHeight` · `MessageList` `height`, `paddingInlineNarrow` · `MessageMedia` `centred`, `fill`, `maxHeight` · `MessageBubble` `width`, `gap`, `minHeight`, `self` · `MediaGrid` `width`, `maxHeight` · `LogViewer`, `CommandList` and `ScrollArea` `maxHeight` · `CommandList` `listSize` (`compact`, `grow`, `pickerWindow`) · `ScrollArea` `contentFull` · `DialogTitle` `truncate` · `ScrollArea` `grow` · `MenuItem` `cap`, `truncate`, `stacked` (a name over its detail) · `MenuPopup` `cap` · `PopoverPopup` `maxHeight` · `TabsList` `track` (`cells`, `strip`) · `TabsPanel` `grow`, `inset`, `scroll` · `Tabs` and `Badge` `flush` (the box adds no gap or padding, because its parts hold their own) · `Table` `width`, `cap` · `Select` `floor` · `Textarea` `width`, `grow` · `MacroTextarea` `minHeight` · `ListRow` `align` · `RadioGroupPickerItem` `width` · `RoomIsland` and `TrackBar` `grow` · `Swatch` `centres` · `BackgroundVideo`, `CrossfadeImage` and `Scatter` `size` (`PICTURE_SIZE`: `fill`, `hero`) · `WebWeave` `placed` (`fill`, `pinned`) · `Avatar` `width`, `aspect` · `Card` `glow`, `nested` · `Icon` `flowTurn` · `Swatch` `indeterminate` · `MessageBubble` `messageRole` · `Section` `hiddenAt` · `ThemeScope` `box` (`contents`, `fill`, `glyph`, `hidden`: how a carrier takes part in layout) · `ThemePreviewPane` `width`, `grow`, `height`, `placed`, `holdsLine` · `Separator` `tone`, `grow` · `Swatch` `grow` · `Field` `grow`, `cap` · `Badge` `cap`, `whitespace` · `InlineToken` `leads` (a token that leads a run of words keeps a `field` step before them) · `Skeleton` `variant="portrait"` and, because a skeleton stands in for a real box, that box's own sizes: `height` (a control step, `chip`, a voice's line box `lineLabel` or `lineMicro`, the placeholder `row`, a picture), `width` (the `WIDTH` table, or `sixth` to `threeQuarters`: the share of its line a stand-in sentence takes), `cap`, `grow`, `placed` (`fill`: lies over the whole of a positioned host) · `Textarea` `chrome="bare"` and `face="code"` · `Badge` `face="code"`, `sentenceCase` · `Select` `strong` · `DialogHeader` `sticky` · `Command` `elevated` · `BackgroundVideo` `fit` and `rounded` · `CrossfadeImage` `rounded` · `MenuItem` `hiddenAt` · `WebSpinner` and `WeaveGlyph` `tone` and `ink` | each was a feature className; the paint is the primitive's own variant |
| `Section` | `kicker` (caps micro label + hairline rule) + `kickerLayout: "stacked" \| "inline"`; `trailing` (content after a stacked kicker's rule; the type refuses it on any other heading); `width` (`full`: the section's whole inline size) and `cap` (`reading`: the widest its rows grow); `height` (`fill`), `divider` and `container` | the CD1 replacement for a box. The INLINE spelling makes the rule the section's own `border-top` and lets the kicker LEAD the control line — naming two groups costs +2px inline against +22px stacked |
| `Stack` / `Row` / `Grid` | `gap` carries `tight` | the small-end step |
| `ListRow` | no per-row border; selection is a bg tint + `rounded-control` | CD1 for the LIST class |
| `Button` | `variant="outline"` · `size="chip"` · the `selection: none \| on \| negated` state layer | a filter chip needs the edge that makes its radius read; a TRI-STATE facet cannot be a `Toggle` (`aria-pressed` has two values) |
| `Toggle` | `variant` (`ghost`, `outline`) · `tone` · `ink="foreground"` · `size="chip"` · `shape` (`control`/`pill`) | a scope filter and a tag filter share one rail and must share one box; a view COMMAND that redraws the pane is not one of the words beside it; pressed, every tone wears the one selected fill |
| `packages/ui/src/lib/control-size.ts` | `CONTROL_SIZES` and the per-step `CONTROL_SIZE`, `CONTROL_BLOCK`, `CONTROL_MIN_BLOCK` and `CONTROL_INLINE` | one home for the scale every control takes. The `chip` step's height is `--size-touch-target`, not a control step: pointer-conditional, so the box IS the tap floor |

A feature className is default-deny. On an `@orb/ui` element it holds only the plain-layout set: `PLAIN_LAYOUT` in `tooling/src/eslint/ui-classes/plain-layout.ts`, the one list `orb/feature-classname-layout-only` and the census read, with a reason for each mechanism. The rule refuses every other class, whether or not a table has seen it. A class that needs an exception gets an owner: a variant on a primitive, never an entry in the list. Positioning is not plain: `sticky`, `absolute` and `fixed` with their insets are placement, and `packages/ui/src/lib/placed.ts` owns them. `relative` stays plain as a containing block. A client component takes no class: `className` and any `*ClassName` on one is an error, and a className value read from a parameter is an error (`orb/no-built-class-string`), so a wrapper names what its caller wants with a prop. `Track` in `packages/client/src/features/chat/lib/chat-track.tsx` writes no class: it stamps `data-track`, the client stylesheet owns the track's box, and a class at the call site is judged against the primitive its `of` names. A class expression the lint cannot read is an error too (a computed key, a spread, a tagged template, a reassigned or destructured name), as is a class object at any depth handed to a component or passed to an element factory, one returned or exported, one merged by `Object.assign`, and a class key written onto an object. `orb/no-opaque-class-spread` refuses a spread whose type can carry a class key, so a wrapper's rest type omits `className`.

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

A sweep stage that converts call sites ends with a `ux-reviewer` pass against the surface, and its P0-P2 findings are fixed before the stage closes. P3 findings are filed, not fixed in the stage. ux-reviewer is the polish authority here, not an advisory.

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
| D10 | the exact instrument paddings in §3.1 are taste-level | ship the table; tune from a `ux-reviewer` pass, never in the abstract |
| D11 | preset editor's compressed type ramp (10.5/13/15/16px, ratio 1.524:1) — accept and record, or widen a step | ACCEPT AND RECORD — a dense `form` may run a compressed size ramp (≥1.5:1 across its body sizes) when grouping is carried by the `kicker` voice + `Section` rules, not by size. Measured on the preset editor (`e51663b49`): `13px/500` ×28 (control labels), `15px/400` ×12 (body), `13px/400` ×5, `10.5px/600` ×5 (kickers), `16px/600` ×1 (the h2); the kicker's discriminating class string is the `kicker` entry in `packages/ui/src/primitives/text/variants.ts` (`font-sans text-micro leading-micro tracking-micro font-semibold uppercase text-muted-foreground`). Keep the page font-size census as descriptive evidence. Judge hierarchy through semantic roles, governed voices and rendered review. |

## 8. Platform and system rulings

The platform and system rulings (§8.1 styling, §8.2 fonts and text scale, §8.3 appearance preferences, §8.4 browser floor and platform CSS, §8.5 evidence) live in [ui-platform-rulings.md](ui-platform-rulings.md).
