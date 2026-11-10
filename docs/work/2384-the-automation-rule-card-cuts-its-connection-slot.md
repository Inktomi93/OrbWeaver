---
kind: bug
status: doing
updated: 2026-11-10
priority: P2
area: client
lane: wt/agent-a25c03bac14ebf059
plan: cross-surface-consistency
---

# The automation rule card cuts its connection slot text at 200% text on a phone

## What

At 200% browser text on a phone, the rule card in the automation rule editor clips the connection slot's text and badge, its picker reads a single letter and an ellipsis, and the role heading row pushes its hint control wholly outside the panel, out of a touch user's reach. The cuts predate the Model roles change; the hint push came with the heading row losing its wrap. Evidence is in the cb-start ux-reviewer report under reports/ux-reviewer.

## Why

Enlarged-text readers cannot read or choose a rule's connection when its label is cut to one letter.

## Done when

At 200% text on the phone profile the rule card's connection slot shows its full label, badge, picker value and hint control inside the panel, with the heading text shrinking before the hint leaves, proven by a production-mounted CT that runs the enlarged-text geometry probe over the rule card.

## Evidence

Filled at landing: what ran and where its output is.
