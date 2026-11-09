---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: off-grid-transform on the rails and Characters, Chat, Config

## What

The design audit rule off-grid-transform fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/native/home.jump/3 at div.grid\[data-slot=setting-row-group]:nth-of-type(1) > div.grid\[data-slot=setting-row]:nth-of-type(2) > div.flex\[data-slot=field-root]:nth-of-type(1) > div.flex; Chat: checkpoint context-chat_00000000000000000000000420/tabs-0/1/disclosure-9 at div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex\[data-slot=field-root]:nth-of-type(2) > div.flex\[data-slot=field-control-col]:nth-of-type(2) > span.; Config: checkpoint config/personas-Your personas-landing at \[data-slot=switch-thumb]. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The off-grid-transform finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
