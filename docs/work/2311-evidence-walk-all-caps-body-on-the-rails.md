---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: all-caps-body on the rails and Characters, Config

## What

The design audit rule all-caps-body fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Config. Examples: the rails and Characters: checkpoint home/requested-pane-composition at \[data-slot=card-root] > div.flex:nth-of-type(2) > div.flex:nth-of-type(2) > span.font-mono\[data-slot=text]:nth-of-type(1); Config: checkpoint config/workloads-Runs-landing at \[data-slot=tabs-root] > div.flex:nth-of-type(1) > div.text-body\[data-slot=tabs-panel]:nth-of-type(2) > div.flex:nth-of-type(1) > div.flex\[data-slot=workload-lan. Runs: surface-Nn5cKU, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The all-caps-body finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
