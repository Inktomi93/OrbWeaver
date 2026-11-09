---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: truncated-to-nothing on the rails and Characters

## What

The design audit rule truncated-to-nothing fails in the desktop-1440-all-panes-evidence walk on the rails and Characters. Examples: the rails and Characters: checkpoint corpus/explore/whole/context/tabs-0/0/scroll-1-0.5 at div.flex:nth-of-type(1) > section.flex:nth-of-type(2) > div.flex:nth-of-type(1) > div.flex:nth-of-type(6) > div.flex:nth-of-type(2) > span.gap-field\[data-slot=b. Runs: surface-Nn5cKU under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The truncated-to-nothing finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
