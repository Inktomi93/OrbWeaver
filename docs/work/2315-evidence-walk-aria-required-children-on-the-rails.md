---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: surface-walk
---

# Evidence walk: aria-required-children on the rails and Characters, Config

## What

The axe rule aria-required-children fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Config. Runs: surface-Nn5cKU, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

A list or menu role without its required child roles reads as broken to assistive tech.

## Done when

The aria-required-children finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
