---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: caveat-outweighed on the rails and Characters, Config

## What

The design audit rule caveat-outweighed fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Config. Examples: the rails and Characters: checkpoint native-name-conflict at \[data-slot=dialog-popup] > div.flex:nth-of-type(1) > form:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > p.font-sans\[data-slot=text]:nth-o; Config: checkpoint config/plugins-Installed-landing at \[aria-label="What Affinity Tracker asks for beyond what you've allowed"] > p.font-sans\[data-slot=text]:nth-of-type(2). Runs: surface-Nn5cKU, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The caveat-outweighed finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
