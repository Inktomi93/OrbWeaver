---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: aria-hidden-focus on the rails and Characters, Chat, Config

## What

The axe rule aria-hidden-focus fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Chat, Config. Runs: surface-Nn5cKU, surface-q297LL, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

A focusable control inside an aria-hidden subtree takes focus but announces nothing.

## Done when

The aria-hidden-focus finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
