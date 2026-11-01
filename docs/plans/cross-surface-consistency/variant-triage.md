# Variant values nobody writes: triage

Source: `pnpm ui-facts`, section "Zero uses on an axis with nothing unresolved". A spread of an object literal now counts as a write, and any other spread makes every axis of its door unclaimable, so the list holds only axes the syntax can fully read. The client layer is scanned; a value a `packages/ui` composite writes itself is not visible to the report and must be checked before any delete.

Nothing is deleted yet. Every value below needs a per-recipe read of `packages/ui` (internal writers, CSS keyed on the `data-*` stamp) before it goes, and the `rounded` and `shadow` arms belong to the lane that owns those axes.

## Stay: shared scale steps

The value is a step on a scale other doors share, so removing it forks the scale.

| door.axis | values |
| - | - |
| autocomplete.size, combobox.size, number-field.size, select.size | chip, sm, md, lg (`lib/control-size.ts`) |
| color-field.size | chip, md, lg |
| color-field.swatchSize | md, sm |
| spinner.size | md, lg, hero (icon scale, `--size-icon-*`) |
| icons.size | fit |

## Stay: default arm or internal state

The value is the recipe default, a boolean `false` that is the absent state, or state the component sets from its own data.

| door.axis | values |
| - | - |
| card.dashed, card.focusable, card.interactive, card.nested, card.receded | false (true for receded) |
| chart.fill, command.elevated, crossfade-image.revealed, icons.openTurn, icons.yieldOnHover, icons.flowTurn, icons.shadow, select.strong, swatch.indeterminate, theme-swatch.lifted, toggle-group.fill, web-weave.anim, web-weave.interactive | false / true |
| skeleton.variant, selection-bar.placement, separator.orientation, separator.tone, switch.tone, slider.tone, highlighted-text.skin, save-bar.sticky, table.align, tabs.layout, toggle.variant, toggle.shape, empty-state.titleStep, drawer.side | the `defaultVariants` arm (verified for skeleton, selection-bar, separator, switch, highlighted-text, save-bar, table, tabs, toggle, empty-state, drawer) |
| diff.kind, compare-blocks.side, compare-blocks.decision, log-viewer.level, table.sortActive, option-strip.highlighted, room-island.dropTarget, room-island.holdsField | state a component stamps from its data |

## Owner list: deliberate-looking, not deleted

| door.axis | values | why it reads as deliberate |
| - | - | - |
| drawer.side | left, right | full arms with swipe wiring (`SWIPE_BY_SIDE` in `drawer.tsx`); also sets corner radius, which another lane owns |
| tabs.layout | stacked | long recipe history; `cell` repeats its classes instead of extending it, so deleting it needs `cell` rewritten |
| tabs.listRule, tabs.topRule, tabs.panelGround | bottom/none, none, none/sidebar | rail-band skins with their own comments |
| picker-cell.shape | standard, square, none | shape arms beside the default `landscape` |
| selection-bar.placement | floating | placement arm beside the default `sticky` |
| highlighted-text.skin | code | skin arm beside the default |
| icons.weight | hairline | weight arm beside `regular` and `bold` |
| card.layout, card.shape, card.glow, card.padding, theme-swatch.shape, theme-swatch.padding, theme-swatch.size, message-bubble.shape | stack, island, none, tier, row/card | island and tier are `defaultVariants` of the theme-swatch preview pane; card arms need a read of `Card` |
| media-tile-grid.interactive, picker-cell.detail, kbd.size, input.layout, number-field.layout, select.layout, room-island.layout, compare-blocks, collapsible.holds, command.listSize | various | arms beside a used arm; not read yet |

## Not yet read

background-video.rounded and crossfade-image.rounded are `rounded` arms (the other lane's axis). Everything in the "unresolved uses: not claimable" table is out of scope until its spreads and props resolve.
