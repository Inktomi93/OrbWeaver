---
kind: tooling
status: open
updated: 2026-11-10
priority: P2
area: tooling
plan: surface-walk
---

# Every enlarged-text walk failure is proved real or its instrument is fixed

## What

The surface walk at 200 and 300 percent text on desktop 1440 all panes and phone portrait failed many cases. reports/cb-walk-text/README.md indexes the evidence: walk-groups.md groups every failing assertion, geometry-by-kind.md groups every text-geometry finding with each checkpoint, and raw/ keeps the Playwright report and attachments. The largest groups are buttons clipped on x, values cut in buttons, popovers and config-content scrolling sideways, coverage gaps in chat reading and game inventories, read-recovery scenario mismatches, the Admin repeated Save census control, and accessible names that now carry a message ordinal. Items 2426 and 2427 are already split out.

## Why

An unproved finding is a question nobody answered. A false positive left standing trains everyone to ignore the walk, and a real one hides behind it.

## Done when

Every group in reports/cb-walk-text has a verdict with its evidence: a real defect boarded as one item per rule per surface, or an instrument fix with a red-first fixture and a control that still fires. A rerun of the same four projects lists only boarded findings.

## Evidence

Filled at landing: what ran and where its output is.
