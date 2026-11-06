---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Per-recipe delete pass over the unwritten variant values once the owner rules on the triage list: each value deleted, wired or kept with a reason

## What

Delete every variant value that nothing writes, unless it has a home: a real internal writer, CSS keyed on its stamp, a default, or a step on a shared scale.

## Why

The owner ruled each unwritten value goes unless it has a home, with the reason recorded, the rounded and shadow axes included, and drawer left and right with no exception.

## Done when

Each value the census lists as unwritten is deleted or kept with its reason in Evidence. pnpm typecheck passes over ui, client and the test worlds, and the CTs for the changed recipes pass.

## Evidence

Method. For each value `pnpm ui-facts` lists as unwritten on an axis it can fully read, the writers inside `packages/ui` and the CSS and `data-` selectors keyed on the value were read. A delete was then proved with `pnpm typecheck` over `packages/ui`, `packages/client` and the test worlds, because a typed write of a removed value fails there. A boolean, a prop renamed onto an axis and a wrapper door that writes another door's axis do not fail there, so those were read by hand.

The census gained three readers in this pass, and each one moved values out of the unwritten list: a `<Track of={X}>` counts as `X`, a door that renders another door's `core.tsx` (`GlyphButton`, `InlineAction`, `PictureButton`) writes the button axes, and a differently named class constant is read by use. The `rounded` and `shadow` values left unwritten are all `defaultVariants` values, so they stay under the same test.

### Deleted

| door.axis | values deleted | why nothing keeps them |
| - | - | - |
| badge.size | md | no writer; the `size="md"` hit in `media-tile-grid.tsx` is an `Icon`. `extracted-marks.dom.test-d.ts` pinned the union, so it now pins `compact` and `sm` |
| card.layout | stack (the axis) | no writer in ui or client; only `card-attributes.dom.test.ts` passed it, and that case is removed |
| card.receded | true (the axis) | no writer; `false` was an empty arm |
| collapsible.holds | prose | empty arm; omitting the prop gives the same classes |
| command.elevated | false | empty arm |
| dialog.spaced, dialog.stickyHeader | false | empty arms |
| drawer.side | left, right | `SWIPE_BY_SIDE` is a map typed on the axis, not a writer; nothing passes `side="left"` or `side="right"`. The owner ruled no exception |
| highlighted-text.skin | code | no `skin="code"` anywhere |
| icons.weight | hairline | the `Icon` default is `regular`; nothing passes `hairline`. `ramp-enforcement` no longer samples it |
| list-row\.revealActions | true, false (the axis) | only `RevealStory` passed `true`, and a test is not a home; the story and its assertions drop the `ListRow` case |
| meter.kind | bipolar | no `kind="bipolar"` anywhere; the geometry, `bipolarMeterVariants` and the law-doc lines are removed with it |
| meter.size (segmented clock) | lg | no writer |
| picker-cell.shape | square, none | no writer; `standard` stays (see below) |
| select.strong | false | empty arm |
| selection-bar.placement | floating | no writer |
| spinner.size | hero | only `ramp-enforcement` passed it; the story samples `xl` instead |
| table.align | center | no column sets it |
| tabs.layout | stacked | no writer; `cell` already carried its own classes, so it needed no rewrite, only its comments |
| tabs.listRule, tabs.topRule | bottom, none | empty arms |
| text.size | display, micro, code | no writer; `Heading` uses `headline` and `title`, `picker-cell.tsx:57` uses `label` |
| text.weight | medium, bold | no writer |
| text.transform | caps | no writer |
| text.halo | false | empty arm |
| theme-swatch.size | card | no writer |

### Kept

Every value below is unwritten in the client and has a home. A real writer the census cannot read is one of: a value computed inside the component, a prop renamed onto the axis (`actionsFloat` to `float`, `ground` to `panelGround`, `sticky` to `stickyHeader`, `size` to `swatchSize`, `rule` to `listRule`), data-borne values, or a wrapper door writing another door's axis (`RadioGroupPicker` to `PickerCell`).

| door.axis | values | home |
| - | - | - |
| autocomplete.size | chip, sm, md, lg | step on the D336 control scale (`CONTROL_SIZES`): every control takes it, and `control-scale.dom.test-d.ts` for the primitive pins `size` to `ControlSize`, so removing a step forks the scale |
| background-video.rounded | none | the `defaultVariants` value, applied whenever the prop is omitted |
| badge.face | text | the `defaultVariants` value, applied whenever the prop is omitted |
| badge.sentenceCase | false | the `defaultVariants` value, applied whenever the prop is omitted |
| button.focal | true | real writer the census cannot read: `ButtonCore` computes `focal` for every button (`packages/ui/src/primitives/button/core.tsx:79`) |
| button.size | lg | step on the shared scale CONTROL_SIZE (shared by 2 recipes); removing it forks the scale |
| button.wrap | false | the `defaultVariants` value, applied whenever the prop is omitted |
| button.hiddenAt | fine | step on the shared scale HIDDEN_AT (shared by 4 recipes); removing it forks the scale |
| button.underline | none | the `defaultVariants` value, applied whenever the prop is omitted |
| button.reserveEdge | false | the `defaultVariants` value, applied whenever the prop is omitted |
| button.focusRing | surface | the `defaultVariants` value, applied whenever the prop is omitted |
| card.shape | island | the `defaultVariants` value, applied whenever the prop is omitted |
| card.artDecoration | tickEnd, portraitStart, portraitEnd | step on the shared scale ART_DECORATION (shared by 3 recipes); removing it forks the scale |
| card.focusable | false | the `defaultVariants` value, applied whenever the prop is omitted |
| card.dashed | false | the `defaultVariants` value, applied whenever the prop is omitted |
| card.glow | none | the `defaultVariants` value, applied whenever the prop is omitted |
| card.nested | false | the `defaultVariants` value, applied whenever the prop is omitted |
| card.padding | tier | the `defaultVariants` value, applied whenever the prop is omitted |
| card.interactive | false | the `defaultVariants` value, applied whenever the prop is omitted |
| chart.fill | true | real writer the census cannot read: `chartVariants({ fill })` with `fill` computed from the height (`packages/ui/src/charts/chart/chart.tsx:44`) |
| chart.fill | false | the `defaultVariants` value, applied whenever the prop is omitted |
| color-field.size | chip, md, lg | step on the D336 control scale (`CONTROL_SIZES`): every control takes it, and `control-scale.dom.test-d.ts` for the primitive pins `size` to `ControlSize`, so removing a step forks the scale |
| color-field.swatchSize | md | the `defaultVariants` value, applied whenever the prop is omitted |
| color-field.swatchSize | sm | real writer the census cannot read: the `ColorSwatch` `size` prop feeds it; the client passes `size="sm"` (`packages/client/src/features/tag/components/tag-collection-rows.tsx:279`) |
| combobox.size | chip, sm, md, lg | step on the D336 control scale (`CONTROL_SIZES`): every control takes it, and `control-scale.dom.test-d.ts` for the primitive pins `size` to `ControlSize`, so removing a step forks the scale |
| command.listSize | content | the `defaultVariants` value, applied whenever the prop is omitted |
| compare-blocks.side | before, after, state | real writer the census cannot read: the pair body picks the side per panel (`packages/ui/src/primitives/compare-blocks/compare-blocks.tsx:90`) |
| compare-blocks.decision | undecided, kept, discarded | real writer the census cannot read: `decisionOf` derives the state from the review tri-state (`packages/ui/src/primitives/compare-blocks/compare-blocks.tsx:44`) |
| crossfade-image.revealed | false | real writer the census cannot read: `slots.image({ revealed })` from the layer state (`packages/ui/src/primitives/crossfade-image/crossfade-image.tsx:98`) |
| crossfade-image.rounded | none | the `defaultVariants` value, applied whenever the prop is omitted |
| dialog.stickyHeader | true | real writer the census cannot read: `DialogHeader` `sticky` feeds it; the client passes `sticky` (`packages/client/src/features/app-shell/components/modal-host.tsx:111`) |
| diff.kind | added, removed, unchanged | real writer the census cannot read: `kindOf` derives it from each change (`packages/ui/src/diff/diff.tsx:47`) |
| empty-state.titleStep | default | the `defaultVariants` value, applied whenever the prop is omitted |
| field.multiline | true | real writer the census cannot read: computed from the description and error nodes (`packages/ui/src/primitives/field/field.tsx:127`) |
| field.multiline | false | the `defaultVariants` value, applied whenever the prop is omitted |
| highlighted-text.skin | default | the `defaultVariants` value, applied whenever the prop is omitted |
| icons.size | fit | real writer the census cannot read: `<Icon size="fit">` in the segmented clock (`packages/ui/src/charts/meter/segmented-clock.tsx:76`) |
| icons.tone | neutral | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:769); a `data-` selector in a recipe keys on it (packages/ui/src/primitives/card/variants.ts:12) |
| icons.tone | info | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:817) |
| icons.ink | foreground, speaker, dialogue, narration, prose, toneForeground, inherit | step on the shared scale INKS (shared by 6 recipes); removing it forks the scale |
| icons.shadow | false | the `defaultVariants` value, applied whenever the prop is omitted |
| icons.openTurn | false | the `defaultVariants` value, applied whenever the prop is omitted |
| icons.yieldOnHover | false | the `defaultVariants` value, applied whenever the prop is omitted |
| icons.flowTurn | false | the `defaultVariants` value, applied whenever the prop is omitted |
| input.size | chip, sm, md, lg | step on the D336 control scale (`CONTROL_SIZES`): every control takes it, and `control-scale.dom.test-d.ts` for the primitive pins `size` to `ControlSize`, so removing a step forks the scale |
| input.layout | field | the `defaultVariants` value, applied whenever the prop is omitted |
| kbd.size | key | the `defaultVariants` value, applied whenever the prop is omitted |
| list-row\.titleQualifierFace | mono | real writer the census cannot read: the `ListRow` prop defaults to `mono` (`packages/ui/src/primitives/list-row/list-row.tsx`, destructure default) |
| list-row\.stackActions | false | the `defaultVariants` value, applied whenever the prop is omitted |
| list-row\.stackActionsAt | cq-32 | the `defaultVariants` value, applied whenever the prop is omitted |
| list-row\.float | true | real writer the census cannot read: `ListRow` `actionsFloat` feeds it, and the client sets `actionsFloat` |
| list-row\.float | false | the `defaultVariants` value, applied whenever the prop is omitted |
| list-row\.subtitlePlacement | block | the `defaultVariants` value, applied whenever the prop is omitted |
| list-row\.clickable | false | the `defaultVariants` value, applied whenever the prop is omitted |
| log-viewer.level | info, warn, error | real writer the census cannot read: the level rides each log line's data (`packages/client/src/features/plugin/components/plugin-log-panel.tsx:41`) |
| media-tile-grid.interactive | true | real writer the census cannot read: computed from `onActivate` (`packages/ui/src/primitives/media-tile-grid/media-tile-grid.tsx:145`) |
| media-tile-grid.interactive | false | the `defaultVariants` value, applied whenever the prop is omitted |
| menu.clamp | viewport | the `defaultVariants` value, applied whenever the prop is omitted |
| message-bubble.shape | island | the `defaultVariants` value, applied whenever the prop is omitted |
| meter.danger | true | real writer the census cannot read: computed from `dangerBelow` (`packages/ui/src/charts/meter/meter.tsx`) |
| meter.size | md | the `defaultVariants` value, applied whenever the prop is omitted |
| meter.hidden | true | real writer the census cannot read: `segmentedClockVariants({ hidden: isHidden })` (`packages/ui/src/charts/meter/segmented-clock.tsx:62`) |
| meter.width | full | the `defaultVariants` value, applied whenever the prop is omitted |
| meter.unset | false | a `data-` selector in a recipe keys on it (packages/ui/src/primitives/color-field/variants.ts:13); the `defaultVariants` value, applied whenever the prop is omitted |
| meter.unset | true | real writer the census cannot read: computed from the clock (`packages/ui/src/charts/meter/waystone.tsx:140`); also keyed by `data-unset` |
| number-field.size | chip, sm, md, lg | step on the D336 control scale (`CONTROL_SIZES`): every control takes it, and `control-scale.dom.test-d.ts` for the primitive pins `size` to `ControlSize`, so removing a step forks the scale |
| number-field.layout | field | the `defaultVariants` value, applied whenever the prop is omitted |
| option-strip.highlighted | true | a `data-` selector in a recipe keys on it (packages/ui/src/primitives/menu/variants.ts:18,packages/ui/src/primitives/menu/variants.ts:22) |
| option-strip.highlighted | false | a `data-` selector in a recipe keys on it (packages/ui/src/primitives/menu/variants.ts:18,packages/ui/src/primitives/menu/variants.ts:22); the `defaultVariants` value, applied whenever the prop is omitted |
| picker-cell.detail | true | real writer the census cannot read: `RadioGroupPicker` `detail` (`packages/client/src/features/chat/components/appearance-chat-style-cards.tsx:48`) |
| picker-cell.shape | landscape | the `defaultVariants` value, applied whenever the prop is omitted |
| picker-cell.shape | standard | real writer the census cannot read: `RadioGroupPickerItem` `shape` (`packages/client/src/features/chat/components/appearance-chat-style-cards.tsx:61`) |
| picture-button.painted | true, false | real writer the census cannot read: computed from `variant` (`packages/ui/src/primitives/picture-button/picture-button.tsx:16`) |
| room-island.holdsField | false | the `defaultVariants` value, applied whenever the prop is omitted |
| room-island.dropTarget | false | the `defaultVariants` value, applied whenever the prop is omitted |
| save-bar.sticky | footer | the `defaultVariants` value, applied whenever the prop is omitted |
| select.size | chip, sm, md, lg | step on the D336 control scale (`CONTROL_SIZES`): every control takes it, and `control-scale.dom.test-d.ts` for the primitive pins `size` to `ControlSize`, so removing a step forks the scale |
| select.layout | field | the `defaultVariants` value, applied whenever the prop is omitted |
| selection-bar.placement | sticky | the `defaultVariants` value, applied whenever the prop is omitted |
| separator.orientation | horizontal | CSS keyed on the stamp (packages/ui/src/styles/primitives.css:208); a `data-` selector in a recipe keys on it (packages/ui/src/primitives/tabs/variants.ts:20,packages/ui/src/primitives/tabs/variants.ts:51); the `defaultVariants` value, applied whenever the prop is omitted |
| separator.orientation | vertical | a `data-` selector in a recipe keys on it (packages/ui/src/primitives/tabs/variants.ts:16,packages/ui/src/primitives/tabs/variants.ts:21) |
| separator.tone | border | the `defaultVariants` value, applied whenever the prop is omitted |
| skeleton.variant | rect | the `defaultVariants` value, applied whenever the prop is omitted |
| slider.tone | neutral | CSS keyed on the stamp (packages/ui/src/styles/theme.css:769); a `data-` selector in a recipe keys on it (packages/ui/src/primitives/card/variants.ts:12) |
| spinner.size | md | the `defaultVariants` value, applied whenever the prop is omitted |
| spinner.size | lg | real writer the census cannot read: `<WebSpinner size="lg">` (`packages/ui/src/charts/chart/chart.tsx:58`) |
| spinner.tone | neutral | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:769); a `data-` selector in a recipe keys on it (packages/ui/src/primitives/card/variants.ts:12) |
| spinner.tone | destructive | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:781) |
| spinner.tone | warning | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:793) |
| spinner.tone | success | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:805) |
| spinner.tone | info | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:817) |
| spinner.ink | muted, foreground, accolade, speaker, dialogue, narration, prose, toneForeground, inherit | step on the shared scale INKS (shared by 6 recipes); removing it forks the scale |
| swatch.indeterminate | false | a `data-` selector in a recipe keys on it (packages/ui/src/primitives/progress/variants.ts:25,packages/ui/src/primitives/checkbox/variants.ts:52) |
| swatch.shape | square | the `defaultVariants` value, applied whenever the prop is omitted |
| switch.tone | accent | the `defaultVariants` value, applied whenever the prop is omitted |
| table.align | start | the `defaultVariants` value, applied whenever the prop is omitted |
| table.align | end | real writer the census cannot read: a column's `align` (`packages/client/src/features/tag/components/labels-suggestions.tsx:119`) |
| table.sortActive | true | real writer the census cannot read: `slots.sortIcon({ sortActive })` from the sort state (`packages/ui/src/primitives/table/table.tsx:227`) |
| table.sortActive | false | the `defaultVariants` value, applied whenever the prop is omitted |
| tabs.layout | inline | the `defaultVariants` value, applied whenever the prop is omitted |
| tabs.listRule | none | real writer the census cannot read: `TabsList` `rule="none"` (`packages/client/src/features/app-shell/components/context-rail.tsx:139`) |
| tabs.panelGround | none, sidebar | real writer the census cannot read: `TabsPanel` `ground` (`packages/client/src/features/app-shell/components/context-bracket.tsx:156`) |
| text.size | headline, title, label | real writer the census cannot read: `Heading` maps its level to `headline` and `title` (`packages/ui/src/primitives/text/text.tsx:17`); `picker-cell.tsx:57` writes `label` |
| text.size | body | the `defaultVariants` value, applied whenever the prop is omitted |
| text.weight | regular | the `defaultVariants` value, applied whenever the prop is omitted |
| text.weight | semibold | real writer the census cannot read: `Heading` defaults `weight` to `semibold` (`packages/ui/src/primitives/text/text.tsx`) |
| text.transform | none | the `defaultVariants` value, applied whenever the prop is omitted |
| text.prose | false | the `defaultVariants` value, applied whenever the prop is omitted |
| text.solidLine | false | the `defaultVariants` value, applied whenever the prop is omitted |
| text.selectAll | false | the `defaultVariants` value, applied whenever the prop is omitted |
| text.pulse | false | the `defaultVariants` value, applied whenever the prop is omitted |
| text.receded | false | the `defaultVariants` value, applied whenever the prop is omitted |
| textarea.size | default | the `defaultVariants` value, applied whenever the prop is omitted |
| textarea.chrome | field | the `defaultVariants` value, applied whenever the prop is omitted |
| textarea.face | text | the `defaultVariants` value, applied whenever the prop is omitted |
| theme-swatch.shape | island | the `defaultVariants` value, applied whenever the prop is omitted |
| theme-swatch.padding | tier | the `defaultVariants` value, applied whenever the prop is omitted |
| theme-swatch.lifted | false | the `defaultVariants` value, applied whenever the prop is omitted |
| theme-swatch.size | row | the `defaultVariants` value, applied whenever the prop is omitted |
| toggle.variant | ghost | the `defaultVariants` value, applied whenever the prop is omitted |
| toggle.tone | primary | step on the shared scale TONE_ARMS (shared by 6 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:757) |
| toggle.tone | neutral | step on the shared scale TONE_ARMS (shared by 6 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:769); a `data-` selector in a recipe keys on it (packages/ui/src/primitives/card/variants.ts:12) |
| toggle.tone | destructive | step on the shared scale TONE_ARMS (shared by 6 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:781) |
| toggle.tone | warning | step on the shared scale TONE_ARMS (shared by 6 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:793) |
| toggle.tone | success | step on the shared scale TONE_ARMS (shared by 6 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:805) |
| toggle.tone | info | step on the shared scale TONE_ARMS (shared by 6 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:817) |
| toggle.ink | muted, accolade, speaker, dialogue, narration, prose, toneForeground, inherit | step on the shared scale INKS (shared by 6 recipes); removing it forks the scale |
| toggle.size | md | step on the shared scale CONTROL_SIZE (shared by 2 recipes); removing it forks the scale; the `defaultVariants` value, applied whenever the prop is omitted |
| toggle.size | lg | step on the shared scale CONTROL_SIZE (shared by 2 recipes); removing it forks the scale |
| toggle.shape | control | the `defaultVariants` value, applied whenever the prop is omitted |
| toggle-group.fill | false | the `defaultVariants` value, applied whenever the prop is omitted |
| web-weave.tone | neutral | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:769); a `data-` selector in a recipe keys on it (packages/ui/src/primitives/card/variants.ts:12) |
| web-weave.tone | destructive | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:781) |
| web-weave.tone | warning | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:793) |
| web-weave.tone | success | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:805) |
| web-weave.tone | info | step on the shared scale TONE_TEXT (shared by 4 recipes); removing it forks the scale; CSS keyed on the stamp (packages/ui/src/styles/theme.css:817) |
| web-weave.ink | muted, foreground, accolade, speaker, dialogue, narration, prose, toneForeground, inherit | step on the shared scale INKS (shared by 6 recipes); removing it forks the scale |
| web-weave.anim | false | the `defaultVariants` value, applied whenever the prop is omitted |
| web-weave.interactive | false | the `defaultVariants` value, applied whenever the prop is omitted |

### Axes left with one value

`drawer.side` (bottom), `highlighted-text.skin`, `selection-bar.placement`, `theme-swatch.size` and `text.transform` keep only their default. Collapsing an axis removes the prop from every caller and, on the theme swatch strip, the `data-size` stamp the audit reads, so it is a separate change.

### For the stylesheet and token lane

No `*.css` file was edited. These tokens lost their only consumer and can go with `tokens.json`: `--stroke-width-icon-hairline` and `--height-picker-art-square`. Both are also listed in `packages/client/owner-css-surface.ts`.

## Owner ruling

Delete each unused value unless it has a home. Check each value in `packages/ui` first: delete it when nothing uses it, and keep it only with a real internal writer or CSS keyed on it, with the reason recorded. The `rounded` and `shadow` axes take the same test. Drawer left and right get no exception.
