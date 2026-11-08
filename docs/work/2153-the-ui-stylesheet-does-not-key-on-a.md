---
kind: work
status: doing
updated: 2026-11-08
priority: P3
area: ui
lane: wt/agent-a7572929e5e574748
plan: cross-surface-consistency
---

# The ui stylesheet does not key on a client-only attribute

## What

packages/ui/src/styles/primitives.css keys a rule on \[data-reserve-key], an attribute only the client's QueryBoundary writes. Move the rule into a Stack reserve variant so the ui package owns both sides.

## Why

A ui rule that depends on a client attribute couples the packages in the wrong direction, and the rule breaks silently if the client renames it.

## Done when

No ui stylesheet selector names an attribute only the client writes, the picker door row still collapses under the stacked dialog, and the skeleton reservation CT passes.

## Evidence

Fixed. The `[data-reserve-key]` rule left `packages/ui/src/styles/primitives.css`; the `orb-reserve-picker-door-row` utility rides `Stack reserve="gives"`, so the ui package owns both sides. No ui stylesheet selector names `data-reserve-key` (`rg` over `packages/ui/src`). `tests/client/features/app-shell/surfaces/new-chat-picker-skeleton.ct.tsx` (the stacked 390x844 and 1440x900 cells at 300% with rosters) and `tests/client/components/skeleton-reservation.ct.tsx` pass.
