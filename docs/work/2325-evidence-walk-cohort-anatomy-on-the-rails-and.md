---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: cohort-anatomy on the rails and Characters, Chat, Config

## What

The design audit rule cohort-anatomy fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint commands-converted-persona-destination at \[data-slot=config-list] > div.flex:nth-of-type(2) > div.flex:nth-of-type(1) > div.flex\[data-slot=config-group]:nth-of-type(7); Chat: checkpoint composer-chat_00000000000000000000000420-empty-menu-0 at \[data-slot=menu-popup] > div\[data-slot=menu-group]:nth-of-type(3); Config: checkpoint config/personas-Your personas-landing at \[data-slot=config-list] > div.flex:nth-of-type(2) > div.flex:nth-of-type(1) > div.flex\[data-slot=config-group]:nth-of-type(7). Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The cohort-anatomy finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
