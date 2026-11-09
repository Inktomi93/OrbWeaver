---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: tap-target on the rails and Characters, Chat, Config

## What

The design audit rule tap-target fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Examples: the rails and Characters: checkpoint home/native/home.jump/3 at \[aria-label="More info about Avatar size"]; Chat: checkpoint composer-chat_00000000000000000000000420-empty-menu-0 at \[data-slot=hint-trigger]; Config: checkpoint config/persona-original-editor/select-0 at \[aria-label="More info about Name"]. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The tap-target finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
