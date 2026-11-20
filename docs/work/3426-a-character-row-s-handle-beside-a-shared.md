---
kind: work
status: doing
updated: 2026-11-20
priority: P1
area: client
lane: wt/agent-a0f363f919c3e186a
plan: cross-surface-consistency
---

# A character row's handle beside a shared name reads as a second, different name

## What

When two characters share a name, `packages/client/src/features/character/components/character-card.tsx` shows each row's handle after the name as `titleQualifier`, in the mono datum face. Some handles repeat the name and some differ, and rows whose name is unique show none.

## Why

The owner read it as an unexplained second name in a different font on some rows. A handle that repeats the name tells two rows apart no better than the name does.

## Done when

The owner has ruled how rows that share a name are told apart on the list, and the row follows it: what is shown, in which type voice, and that a qualifier equal to the name is never the only difference shown.

## Evidence

Filled at landing: what ran and where its output is.
