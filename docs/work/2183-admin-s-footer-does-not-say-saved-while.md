---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-aeb8f21def3afc3d1
plan: cross-surface-consistency
---

# Admin's footer does not say Saved while a draft is pending

## What

The Admin pane's aggregate footer shows Saved while an explicit-submit draft in the pane is still pending.

## Why

A Saved line over an unsaved draft tells the user their change is safe when it is not.

## Done when

While any explicit-submit draft in the pane is pending the footer does not say Saved, with a CT that edits a draft and reads the footer. Source: acceptance part 1 report.

## Evidence

Filled at landing: what ran and where its output is.
