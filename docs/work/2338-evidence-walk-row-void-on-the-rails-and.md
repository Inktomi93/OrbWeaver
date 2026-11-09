---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Evidence walk: row-void on the rails and Characters, Config

## What

The design audit rule row-void fails in the desktop-1440-all-panes-evidence walk on the rails and Characters, Config. Examples: the rails and Characters: checkpoint refinery/refinery_session_000000000000000000000001hv/scope-dialog at \[data-slot=dialog-popup] > div.flex:nth-of-type(1) > form:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex:nth-of-type(1) > div.flex\[data-slot=field-root]:nt; Config: checkpoint config/roster-original-member-seats-rules at \[data-slot=roster-member-editor] > div.flex\[data-slot=field-root]:nth-of-type(5). Runs: surface-Nn5cKU, surface-2sWzKu under ~/.local/state/orbweaver/surface-walk; each case's error-context.md lists every subject.

## Why

The design audit flags this as a break in the shared design system on a production surface.

## Done when

The row-void finding is gone from these surfaces' evidence checkpoints, fixed at the shared owner, or each remaining subject is answered with a cited reason. A false positive goes to the audit engine with a fixture instead.

## Evidence

Filled at landing: what ran and where its output is.
