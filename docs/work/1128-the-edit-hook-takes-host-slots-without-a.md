---
kind: tooling
status: open
updated: 2026-10-19
priority: P3
---

# The edit hook takes host slots without a steal notice

## What

.claude/hooks/biome-check.mjs calls tryAcquireHostSlot(pool) without onNotice (lines 311 and 497), so a slot the hook steals is silent. The 1049 phase 3 audit found the related host-slots.ts defect (an unreadable lock record read as the holder's own), which cb-1049-p319 is fixing.

## Why

A silent steal of a shared host slot makes a concurrent heavy run lose its slot with no trace, which is how heavy runs collide on this box.

## Done when

The hook passes an onNotice that surfaces a steal as advisory context, the edit hook still never blocks, and the p3-19 host-slot fix is on main.

## Evidence

Filled at landing: what ran and where its output is.
