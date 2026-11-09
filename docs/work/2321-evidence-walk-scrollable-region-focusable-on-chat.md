---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: scrollable-region-focusable on Chat

## What

The axe rule scrollable-region-focusable fails in the desktop-1440-all-panes-evidence walk on Chat. Runs: surface-q297LL under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

A scroll region no keyboard can reach hides its content from keyboard users.

## Done when

The scrollable-region-focusable finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
