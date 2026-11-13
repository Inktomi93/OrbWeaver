---
kind: decision
status: open
updated: 2026-11-13
priority: P3
area: client
plan: cross-surface-consistency
---

# Members row names follow the name grammar law or axe contiguity

## What

The native axe rule `label-content-name-mismatch` fires on any Members row that prints a state word, because axe wants the shown words as one contiguous run of the accessible name. `docs/law/UI-Primitives-and-Reuse.md` §13.10 says the opposite: every word on screen appears in the name, and a transient status is a description. The row meets the law in every state; `tests/client/features/chat/components/member-row-name.ct.tsx` holds it. Clearing axe means reordering the row-name grammar or moving the marks out of the button.

## Why

The surface walk reports the row on every run until the finding is excused by a cited ruling or cleared.

## Done when

A ruling is recorded, and the walk either excuses the Members row by citing it or the row is changed and the walk is clean.

## Evidence

Filled at landing: what ran and where its output is.
