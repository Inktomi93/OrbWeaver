---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: contrast on the rails and Characters, Chat

## What

The design audit rule contrast fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat. Examples: the rails and Characters: checkpoint home/native/chat.alsoOpen/1 at \[data-slot=chat-room-surface] > div.flex\[data-slot=character-bar]:nth-of-type(1) > div.flex\[data-slot=character-chip]:nth-of-type(2) > span.relative\[data-slot=a; Chat: checkpoint message-operations/reaction-added at \[data-slot=message-reaction-pill] > span.font-sans\[data-slot=text]:nth-of-type(2). Runs: surface-Nn5cKU, surface-q297LL under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The contrast finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
