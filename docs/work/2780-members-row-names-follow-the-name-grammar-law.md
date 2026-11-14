---
kind: decision
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# Members row names follow the name grammar law or axe contiguity

## What

The accessibility scan moves a `label-content-name-mismatch` node to judged-apart when the node passes the house Label-in-Name check: every word it shows is in its name, after the text its `aria-describedby` points at is removed. Its reason cites UI-Primitives-and-Reuse §13.10 N2.

## Why

Axe's rule is stricter than N2 and flags the Members row in every state that prints a state word, so the walk reports a row that meets the law.

## Done when

`tests/support/browser/accessibility-scan.ct.tsx` has a case for a Members row in a state-word state (judged apart) and a control whose shown words are missing from its name (still a violation), and a walk of the room lists no Members row finding.

## Evidence

Filled at landing: what ran and where its output is.
