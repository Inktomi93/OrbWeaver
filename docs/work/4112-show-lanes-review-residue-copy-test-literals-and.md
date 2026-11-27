---
kind: work
status: open
updated: 2026-11-27
priority: P3
area: client
---

# Show-lanes review residue: copy, test literals and small UI rough edges

## What

From the show lanes' batch review: a doc comment stacked on the wrong function in portability-model.ts; a value: unknown parameter and inline copy in the admin global settings section; tests that copy literals (an ellipsis, the journal page size, a test id, a dollar string) instead of importing them; the import toast says this card for a multi-card batch; the failed-document row shows the raw document id while loading; the embedding-calls section disappears when empty; the recall-hit span shows character offsets instead of opening the passage.

## Why

Each is small, but together they leave copy, types and tests that drift from their homes.

## Done when

Each listed spot is fixed or ruled with its reason, the literals are imported from their homes, and a ux-reviewer pass covers the three UI items.

## Evidence

Filled at landing: what ran and where its output is.
