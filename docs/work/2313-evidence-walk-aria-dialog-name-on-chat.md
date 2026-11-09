---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: aria-dialog-name on Chat

## What

The axe rule aria-dialog-name fails in the desktop-1440-all-panes-evidence walk on Chat. Runs: surface-q297LL under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

A dialog with no accessible name opens without telling a screen reader what it is.

## Done when

The aria-dialog-name finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
