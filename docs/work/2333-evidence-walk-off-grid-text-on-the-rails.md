---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: off-grid-text on the rails and Characters, Chat, Config

## What

The design audit rule off-grid-text fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint original-context/tabs-0/2/dialog-0 at \[data-slot=dialog-footer] > button.inline-flex\[data-slot=button]:nth-of-type(1); Chat: checkpoint message-operations/reaction-added at \[data-slot=message-reaction-pill] > span:nth-of-type(1); Config: checkpoint config/world-info-details at \[data-slot=dialog-footer] > button.inline-flex\[data-slot=button]:nth-of-type(1). Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The off-grid-text finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
