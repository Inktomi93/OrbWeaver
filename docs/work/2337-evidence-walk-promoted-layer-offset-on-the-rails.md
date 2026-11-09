---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: promoted-layer-offset on the rails and Characters, Chat, Config

## What

The design audit rule promoted-layer-offset fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/native/home.jump/0 at \[aria-label="Chats details"]::before; Chat: checkpoint chat-delayed-media-reserved-frame at \[data-slot=message-bubble]; Config: checkpoint config/personas-Your personas-landing at \[aria-label="Settings details"]::before. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The promoted-layer-offset finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
