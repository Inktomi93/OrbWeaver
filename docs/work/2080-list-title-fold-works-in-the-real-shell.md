---
kind: bug
status: doing
updated: 2026-11-08
priority: P2
area: client
lane: wt/agent-ab8f7f48d0abd71fe
plan: cross-surface-consistency
---

# List title fold works in the real shell

## What

`panels.css:155` floors the identity at the title floor, so the 2011 fix has no effect (A2). From the rendered recheck under reports/ux-reviewer. Ruling: the name stays whole and actions fold first, so the panels.css floor and its comment change to match.

## Why

"Cha…" and "Charact…" at 1280 with Context docked; contradicting rulings.

## Done when

owner ruling recorded; the chosen order holds in a CT mounted inside the shell; 2011 reopened or re-closed against it.

## Evidence

Filled at landing: what ran and where its output is.
