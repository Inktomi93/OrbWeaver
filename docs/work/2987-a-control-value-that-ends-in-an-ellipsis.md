---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
plan: cross-surface-consistency
---

# A control value that ends in an ellipsis in the character picker, regex script picker and tag chip

## What

The character picker row name, the regex script picker row name and the editable tag chip name each truncate a value the reader chose the control for, with no reveal. Rows in the pickers sit in a command list, so the choice between wrapping the name and revealing it is a design call for each. Decide it per surface and prove it with a phone reflow case at enlarged text.

## Why

A cut value reads as another value, and the enlarged-text probe lists a control value cut by an ellipsis as a finding.

## Done when

Each of the three names either wraps between its words or opens its whole text, and a component test at enlarged text on a phone was red before the fix.

## Evidence

Filled at landing: what ran and where its output is.
