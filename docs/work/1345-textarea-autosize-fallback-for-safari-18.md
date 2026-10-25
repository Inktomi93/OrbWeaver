---
kind: work
status: open
updated: 2026-10-24
priority: P2
area: ui
plan: css-system
---

# Textarea autosize falls back to script below field-sizing support

## What

The Textarea primitive and the topbar rename field grow through `field-sizing: content`, which Safari ships from 26.2. On the Safari/iOS 18 browser floor (owner ruling, leg 8), the composer keeps its `rows` height and scrolls instead of growing.

## Owner ruling

2026-10-24: add a script fallback inside the primitive.

## Done when

The Textarea primitive keeps `field-sizing: content` where `CSS.supports("field-sizing", "content")` is true and otherwise measures and grows its box in script, within the same min and max rows, with no layout shift on first paint; callers do not change; a CT forces the unsupported arm and asserts growth matches the supported arm's height.

## Evidence

Filled at landing: what ran and where its output is.
