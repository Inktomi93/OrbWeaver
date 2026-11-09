---
kind: bug
status: open
updated: 2026-11-09
priority: P3
area: client
plan: cross-surface-consistency
---

# Item enable switches use one stable name grammar

## What

Item enable switches name themselves three ways: Turn X off (plugins, flips with state), Enabled: name (Admin users) and Allow background work on name (Connections). Ruling: one stable name that names the item, from action-names.ts, with aria-checked carrying the state.

## Why

A switch name that changes with its state reads as an action, and three grammars for one control break the family.

## Done when

Every item enable switch reads one grammar from one home, a CT finds each by its stable name across two items and asserts aria-checked, and the plugin row comment states the ruling. Source: acceptance part 4 report A SET-R1.

## Evidence

Filled at landing: what ran and where its output is.
