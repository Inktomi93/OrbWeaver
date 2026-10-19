---
kind: bug
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a70a1405425980a02
---

# Clear the native lint findings the latest main merges introduced

## What

Native lint over packages, tooling and tests reports findings absent at the 1101/1102 merge base, in files that lane did not touch. no-floating-promises: packages/client/src/data/invalidation.ts:270, data/use-card-frame.ts:94, data/use-plugin-frame.ts:69 and :91, features/app-shell/hooks/use-is-mobile-viewport.ts:174, features/rpg/components/rpg-game-tab.tsx:357, features/rpg/components/rpg-populate-control.tsx:84. orb/tooling-clock-budget: tests/tooling/verify/ops/dark-variant-native.test.ts:95, flip-inversion-native.test.ts:150, sub-floor-disclosure-native.test.ts:52, surface-a11y-focus-native.test.ts:75 and :80, tailwind-syntax-native.test.ts:37, theme-override-native.test.ts:58. no-unsafe-type-assertion: tests/contracts/chat/message-kind-policy.repo.int.test.ts:43. no-unnecessary-condition: tests/tooling/floor/testing/test-kinds.test.ts:48.

## Why

Merges that lint only their own scope let new reds onto main, so the lint stage is red again outside 1099, 1129 and 1130.

## Done when

Direct lint over each listed file reports none of these; every promise is awaited, returned or ends in a catch that owns its failure; every timeout is a named base through scaledBudget; the assertion becomes real narrowing; nothing is suppressed; the touched tests pass.

## Evidence

Filled at landing: what ran and where its output is.
