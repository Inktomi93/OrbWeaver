---
kind: bug
status: doing
updated: 2026-11-12
priority: P2
area: ui
lane: wt/agent-ac2fbba9e3e81b983
plan: surface-walk
---

# A list row's title widens its pane at the largest phone text

## What

At the largest text on a phone the title slot of a list row is wider than its pane on the chat list, home, the corpus finder, characters and corpus digests, so the pane scrolls sideways. The phone walk did not show it before the list row title floor landed; the floor is the suspect and the cause is not yet proved. Evidence: the phone reruns report under reports/cb-walk-text.

## Why

A row title that pushes its pane wider breaks reflow on the most used lists, and it arrived with a recent change to the shared row.

## Done when

The cause is proved by a component test on the production row at the phone width and the largest text, the title keeps its readable floor and never exceeds its row, and the phone walk lists no list row title wider than its pane.

## Evidence

Filled at landing: what ran and where its output is.
