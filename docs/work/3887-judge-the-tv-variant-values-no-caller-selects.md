---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: ui
lane: wt/agent-aecb78d3e3ce1089b
plan: unwired-code
---

# Judge the tv variant values no caller selects

## What

The bloodhound variant pass reads every `tv()` table (confirmed by the call's resolved signature, so the ui `tv` wrapper counts) and every value written into an axis: JSX literals, conditionals, typed values, prop forwards through parameters, carried bags, `variantProps` selections, defaults and the `false` fallback tailwind-variants applies (`values[key || "false"]`). These values have no writer anywhere: packages/ui/src/layout/variants.ts:container = size; packages/ui/src/layout/variants.ts:dividerWeight = hairline; packages/ui/src/layout/variants.ts:ink = inherit; packages/ui/src/layout/variants.ts:feather (whole axis: bubble, userBubble, systemBubble); packages/ui/src/layout/variants.ts:inline (whole axis: true); packages/ui/src/layout/variants.ts:paddingBlockStartNarrow (whole axis: none); packages/ui/src/layout/variants.ts:dividerWeight = hairline; packages/ui/src/layout/variants.ts:cap (whole axis: reading); packages/ui/src/layout/variants.ts:cols = tile, lead, gutterCentred, actionBar; packages/ui/src/layout/variants.ts:size = lg; packages/ui/src/primitives/text/variants.ts:weight = semibold; packages/ui/src/primitives/text/variants.ts:clamp (whole axis: ); packages/ui/src/primitives/text/variants.ts:lines (whole axis: ); packages/ui/src/primitives/text/variants.ts:truncate = inline; packages/ui/src/primitives/collapsible/variants.ts:inset (whole axis: block); packages/ui/src/primitives/list-row/variants.ts:titleQualifierFace = mono; packages/ui/src/primitives/field/variants.ts:floor = title, line, third; packages/ui/src/primitives/field/variants.ts:width = full; packages/ui/src/primitives/picture-button/variants.ts:reach (whole axis: floor); packages/ui/src/primitives/picture-button/variants.ts:painted = true; packages/ui/src/primitives/picture-button/variants.ts:cue (whole axis: replace); packages/ui/src/primitives/color-field/variants.ts:size = chip, md, lg; packages/ui/src/primitives/combobox/variants.ts:size = chip, md, lg; packages/ui/src/primitives/autocomplete/variants.ts:size = chip, md, lg; packages/ui/src/primitives/picker-cell/variants.ts:corners = check; packages/ui/src/content/theme-swatch/preview-pane-variants.ts:height = part; packages/ui/src/content/theme-swatch/preview-pane-variants.ts:fill = sidebarEdge; packages/ui/src/content/theme-swatch/preview-pane-variants.ts:shape = inset; packages/ui/src/content/theme-swatch/preview-pane-variants.ts:lifted = true; packages/ui/src/charts/meter/variants.ts:danger (whole axis: true); packages/ui/src/charts/meter/variants.ts:danger (whole axis: true); packages/ui/src/charts/meter/variants.ts:tone = default; packages/ui/src/primitives/message-bubble/variants.ts:receded = true; packages/ui/src/primitives/message-bubble/variants.ts:share = true; packages/ui/src/primitives/save-bar/variants.ts:sticky = header; packages/ui/src/primitives/aspect-frame/variants.ts:aspect (whole axis: square, portrait, landscape). For example, no caller passes `size` to `Combobox`, `Autocomplete` or `ColorField`.

## Why

A value no caller selects is a design value nobody reaches, or a caller that hand-rolls instead of using it. Judging needs a design call per value, not a sweep.

## Done when

Each value is kept with a design reason, wired at the caller that should use it, or removed from its table.

## Evidence

Filled at landing: what ran and where its output is.
