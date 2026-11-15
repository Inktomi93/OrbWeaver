---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: ui
plan: cross-surface-consistency
---

# A disclosure ListRow's body holds its inline inset at enlarged text on a phone

## What

The ListRow body in `packages/ui/src/primitives/list-row/variants.ts` pads its inline edges with the raw `px-row`, which grows with the text. The disclosure panel under it now takes the held `px-inset-row`, so at 300% text on a 390px phone the body's title sits 24px in and the panel's controls 8px in.

## Why

The open row's title and its panel no longer share a start edge at enlarged text on a phone, and the body spends the phone's width on its sides as the text grows.

## Done when

The body takes the held row inset on a phone-width row, and a CT at 300% on a phone measures the body's and panel's start insets equal. Every CT the ListRow affected set names passes.

## Evidence

Filled at landing: what ran and where its output is.
