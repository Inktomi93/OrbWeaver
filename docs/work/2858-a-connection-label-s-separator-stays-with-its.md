---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A connection label's separator stays with its provider and a model id breaks at its slashes

## What

In the Model roles pickers and readouts at enlarged text, the label `provider · model` wraps with the dot alone on a line, and a long model id splits inside a name rather than at a slash. The label is built from the minted separator in `connectionSummary` in `packages/client/src/lib/connection-roles.ts`.

## Why

A dot alone on a line and a split model id read as noise where the person is choosing a connection.

## Done when

A component test in `tests/client/features/credentials/components/` renders the Model roles pickers at 390px wide and 200% text. It asserts that no wrapped line begins with the separator and that a split inside a model id falls at a slash. The accessible name of each control is unchanged, and the stored label and the separator constant in contracts stay as they are. It is red before the change and green after.

## Evidence

Filled at landing: what ran and where its output is.
