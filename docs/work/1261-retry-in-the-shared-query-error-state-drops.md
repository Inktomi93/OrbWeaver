---
kind: bug
status: open
updated: 2026-10-24
priority: P2
area: ui
---

# Retry in the shared query error state drops keyboard focus to the body

## What

Pressing Retry in `QueryErrorState` (the shared error state rendered by `QueryBoundary`, `packages/client/src/components/query-boundary.tsx`) refetches, the boundary swaps to the skeleton and then the settled content, and focus lands on `<body>` within about 130 ms. A keyboard or screen-reader user has to Tab from the top of the document again and the recovery is not announced. Measured by side-eye on the RPG card archive but the behaviour is the primitive's.

## Why

Every surface that uses the shared error state inherits the focus loss.

## Done when

After `retry()` resolves, focus moves to the boundary's settled root (`tabIndex -1`) or the first focusable inside it, and the recovery is announced through the existing status region; a CT on one boundary surface asserts the focused element after Retry; no surface-specific workaround.

## Evidence

Filled at landing: what ran and where its output is.
