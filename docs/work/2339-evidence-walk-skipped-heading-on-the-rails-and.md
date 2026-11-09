---
kind: bug
status: doing
updated: 2026-11-09
priority: P3
area: client
lane: wt/agent-a909969761f089d33
plan: cross-surface-consistency
---

# Evidence walk: skipped-heading on the rails and Characters, Chat

## What

The design audit rule skipped-heading fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat. Examples: the rails and Characters: checkpoint home/native/chat.alsoOpen/5 at \[data-slot=rpg-status-tab] > div.flex:nth-of-type(1) > h3.font-sans\[data-slot=heading]:nth-of-type(1); Chat: checkpoint chat-room-chat_00000000000000000000000420 at \[data-slot=rpg-status-tab] > div.flex:nth-of-type(1) > h3.font-sans\[data-slot=heading]:nth-of-type(1). Runs: surface-Nn5cKU, surface-q297LL under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The skipped-heading finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
