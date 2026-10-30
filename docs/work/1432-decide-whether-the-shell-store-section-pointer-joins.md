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

Filled at landing: what ran and where its output is.
