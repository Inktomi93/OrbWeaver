---
kind: bug
status: doing
updated: 2026-11-13
priority: P2
area: client
lane: wt/agent-a9b7b7b15204242ef
plan: import-robustness
---

# The import preview follows the owner's collision choices

## What

`packages/client/src/features/workloads/hooks/use-library-import.ts` sends the dry run with no collision choices and does not run it again when the owner changes an answer. The server judges a same-name persona by the choice it is given, so the preview's count always assumes a merge.

## Why

An owner who picks keep both is told the import writes one fewer persona than it does.

## Done when

The dry run carries the current choices and is judged again when one changes, and a component test flips one collision to keep both and sees the persona count follow, red first.

## Evidence

Filled at landing: what ran and where its output is.
