---
kind: bug
status: open
updated: 2026-10-26
priority: P2
area: client
---

# Constrain narrow Ripple cards and reflow their headers

## What

Ripple welded cards exceed the narrow transcript scrollport. Both role boxes overflow; measured assistant text extends 12px beyond the scrollport.

## Why

Fixed portrait width and intrinsic header/content sizing let fit-content cards exceed the available parent width. Unchanged parent source supports an existing layout defect; no parent runtime replay was performed.

## Done when

At narrow widths, both roles keep paragraph boxes and rendered text inside the scrollport. Preserve the portrait, readable header reflow, desktop width cap, and row-bounded sticky identity. Verify PNGs and bounds through production components.

## Evidence

Filled at landing: what ran and where its output is.
