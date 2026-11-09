---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: inactive-control-legibility on the rails and Characters, Chat, Config

## What

The design audit rule inactive-control-legibility fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint greeting-discarded at \[data-slot=greeting-studio] > div.flex:nth-of-type(5) > button.inline-flex\[data-slot=button]:nth-of-type(2); Chat: checkpoint composer-chat_00000000000000000000000295-empty-menu-0-safe-drill-Corrections… at \[data-slot=dialog-footer] > button.inline-flex\[data-slot=button]:nth-of-type(2); Config: checkpoint config/roster-original-member-seats-rules at \[data-slot=roster-member-editor] > div.flex:nth-of-type(4) > button.inline-flex\[data-slot=button]:nth-of-type(1). Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The inactive-control-legibility finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
