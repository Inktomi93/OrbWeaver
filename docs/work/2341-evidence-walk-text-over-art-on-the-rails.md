---
kind: bug
status: doing
updated: 2026-11-10
priority: P3
area: client
lane: wt/agent-a8e74ba5a06d28c78
plan: cross-surface-consistency
---

# Evidence walk: text-over-art on the rails and Characters, Chat, Config

## What

The design audit rule text-over-art fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/native/home.jump/2 at #context-cell-compare > span.font-sans\[data-slot=context-cell-caption]:nth-of-type(1); Chat: checkpoint chat-delayed-media-reserved-frame at \[data-slot=message-bubble] > div.flex:nth-of-type(2) > div:nth-of-type(1) > p:nth-of-type(9); Config: checkpoint config/connections/menu-0 at \[data-slot=menu-popup] > div.flex\[data-slot=menu-item]:nth-of-type(2) > span.font-sans\[data-slot=text]:nth-of-type(1). Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The text-over-art finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
