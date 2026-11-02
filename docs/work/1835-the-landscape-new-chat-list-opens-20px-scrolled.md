---
kind: bug
status: open
updated: 2026-11-02
priority: P3
area: client
plan: css-system
---

# The landscape New chat list opens 20px scrolled in the short step

## What

The change, in a sentence.

## Why

The symptom or the ruling behind it.

## Done when

The observable bar a verifier can check.

## Evidence

Filled at landing: what ran and where its output is.

- Cause: New chat's short step (`dialog-short`, `packages/ui/src/styles/primitives.css`) stopped at 20rem. A landscape phone's dialog box is 326px, so it took the tall layout. The list got 54px, and the pinned footer covered 31 of them. The heading inset plus one 44px row did not fit, so cmdk scrolled the first row into view by 20px.
- Fix: the short step is now the 24rem height step. There the list drops its heading and inset, so the first row is whole at scroll position 0. No scroll reset.
- Test: `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx`, "on a landscape phone". It failed on the old source (list scrolled 20px, footer over the row) and passes now.
