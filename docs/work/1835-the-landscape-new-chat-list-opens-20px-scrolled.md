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
- The side-eye review `reports/side-eye/2026-11-02-short-regime.md` found the wider step hid Blank chat and the saved-roster door. A short dialog under the 32rem width step keeps its stacked footer. A wider one keeps Blank chat with Start in the pinned row and the saved-roster door in its row above the list, all on screen at open.
- The same review found New chat at 200% and 300% in landscape opened scrolled past its title. Three arrival moves scrolled the dialog: the dialog's own first focus on its body, the search box's focus, and cmdk's reveal of the first row. None of them scrolls the dialog now, so it opens on its title and Close.
- Tests: `tests/client/features/app-shell/surfaces/app-shell-modals.ct.tsx`, the 844x390 and 1024x420 cases and the "opened at … text" cases. Each failed on the source before it and passes now.
