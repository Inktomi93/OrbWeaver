---
kind: bug
status: doing
updated: 2026-11-10
priority: P3
area: client
lane: wt/agent-a9fb6229d3102fd80
plan: cross-surface-consistency
---

# Evidence walk: double-empty-state on the rails and Characters, Chat, Config

## What

The design audit rule double-empty-state fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/native/home.jump/0 at \[aria-label="Chats details"]; Chat: checkpoint chat-empty-search at \[aria-label="Chats details"]; Config: checkpoint config/roster-original-teaching/teacher/tabs-0/1 at \[data-slot=tabs-panel]. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The double-empty-state finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
