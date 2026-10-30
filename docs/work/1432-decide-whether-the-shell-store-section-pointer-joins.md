---
kind: decision
status: open
updated: 2026-10-30
priority: P3
area: client
---

# Decide whether the shell-store section pointer joins no-effect-on-shared-selection

## What

docs/law/ui-architecture-state-and-stack.md §5.1 names packages/client/src/state/shell-store.ts as a shared selection pointer, but orb/no-effect-on-shared-selection covers only \*-selection-store.ts and active-chat-store.ts hooks, so an effect keyed on useActiveSection passes. Either widen the rule to the shell-store pointer hooks or narrow the law's list.

## Why

The law and the rule disagree about which pointers features may not react to in an effect.

## Done when

Owner rules; the rule and §5.1 name the same pointer set, with a planted case for the shell-store hook if it joins.

## Evidence

Owner ruled: widen the rule. `orb/no-effect-on-shared-selection` now counts `useActiveSection` and `useOpenModal` from `packages/client/src/state/shell-store.ts` as shared selection pointers, the two selection reads §5.1 names. The store's viewport and tab hooks stay out: they are device and transient state, not selection. §5.1 in `docs/law/ui-architecture-state-and-stack.md` names the same set.

`tests/tooling/eslint-client-data-gates.test.ts` plants an effect keyed on each pointer hook (two cases) and a control keyed on `useMobileViewport`. On the old rule both planted cases failed (0 findings, 1 expected); with the widened rule all 79 cases pass. `pnpm lint:eslint packages/client/src` reports no finding, so no site needed a fix.
