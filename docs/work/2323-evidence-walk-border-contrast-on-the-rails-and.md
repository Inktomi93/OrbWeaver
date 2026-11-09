---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: border-contrast on the rails and Characters, Config

## What

The design audit rule border-contrast fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Config. Examples: the rails and Characters: checkpoint original-context/tabs-0/3/dialog-1 at \[data-slot=color-field-native-input]; Config: checkpoint config/theme-builder/dialog-0 at \[data-slot=color-field-native-input]. Runs: surface-Nn5cKU, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The border-contrast finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
