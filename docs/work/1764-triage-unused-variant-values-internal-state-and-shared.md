---
kind: work
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Triage unused variant values: internal state and shared scale steps stay, speculative values go, deliberate-looking ones go to the owner; resolve the spread sites first

## What

Every client JSX spread that could write a variant axis is now spelled as attributes or a literal, so the census reads it, and the unwritten values the census newly shows were triaged with the 1804 rule.

## Why

A spread the syntax could not read made every axis of its door unclaimable, so the unwritten-value list stopped at the axes with no spread. The census also missed a Track of carrier and the doors that render the button core.

## Done when

No client spread of an opaque prop bag remains: orb/no-opaque-variant-spread passes over packages/client/src. pnpm ui-facts lists the axes it can now read, and item 1804 holds the per-value result.

## Evidence

Filled at landing: what ran and where its output is.
