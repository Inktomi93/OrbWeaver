---
kind: work
status: open
updated: 2026-11-14
priority: P1
area: ui
plan: cross-surface-consistency
---

# Link the preset limit sliders to the connection override when their ceiling is assumed

## What

In `packages/client/src/features/preset/components/params-limits.tsx`, Max output tokens and Max context tokens stop at the connection's stated limits, and the hint reads 'This model accepts up to N output tokens' even when N is the fallback guess. When the limit is assumed, say so in the hint and give a control that opens the connection's context window and max output override.

## Why

The ceiling shows in the preset editor and its fix is in Settings → Connections → Advanced, with nothing joining the two.

## Done when

With assumed limits, both sliders say the ceiling is a guess and one press lands on the override; with reported limits the hint is unchanged. A CT pins both.

## Evidence

Filled at landing: what ran and where its output is.
