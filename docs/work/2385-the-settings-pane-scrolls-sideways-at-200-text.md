---
kind: bug
status: open
updated: 2026-11-10
priority: P3
area: client
plan: cross-surface-consistency
---

# The settings pane scrolls sideways at 200% text on a phone because of the Connections list rows

## What

At 200% browser text on a phone, the settings pane overflows sideways; the Connections list rows set the overflow, not Model roles. Evidence is in the cb-start ux-reviewer report under reports/ux-reviewer.

## Why

Enlarged-text readers must not scroll a settings page sideways to read it.

## Done when

enlargedTextFindings over the settings pane on the Connections page is empty at 200% text on the phone profile, with a production-mounted CT that covers the Connections list rows.

## Evidence

Filled at landing: what ran and where its output is.
