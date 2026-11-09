---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: obscured-target on Chat

## What

The design audit rule obscured-target fails in the desktop-1440-all-panes-evidence walk on Chat. Examples: Chat: checkpoint chat-room-chat_01m6zzp6hefvkr2qgfrac2etx4 at \[aria-label="Surface walk message operations 00000000-0000-4000-8000-0000800a0001"] > span.flex\[data-slot=list-row-content]:nth-of-type(2) > span.flex\[data-slot. Runs: surface-q297LL under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The obscured-target finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
