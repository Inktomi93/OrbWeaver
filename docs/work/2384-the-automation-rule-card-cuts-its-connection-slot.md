---
kind: bug
status: open
updated: 2026-11-10
priority: P2
area: client
plan: cross-surface-consistency
---

# The automation rule card cuts its connection slot text at 200% text on a phone

## What

At 200% browser text on a phone, the rule card in the automation rule editor clips the connection slot's text and badge, and its picker reads a single letter and an ellipsis. The parent of the Model roles change shows the same cuts; evidence is in the cb-start ux-reviewer report under reports/ux-reviewer.

## Why

Enlarged-text readers cannot read or choose a rule's connection when its label is cut to one letter.

## Done when

At 200% text on the phone profile the rule card's connection slot shows its full label, badge and picker value without clipping, proven by a production-mounted CT that runs the enlarged-text geometry probe over the rule card.

## Evidence

Filled at landing: what ran and where its output is.
