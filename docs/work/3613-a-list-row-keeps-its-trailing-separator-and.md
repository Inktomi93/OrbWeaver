---
kind: bug
status: doing
updated: 2026-11-20
priority: P2
area: ui
lane: wt/agent-a08e6a0b2439f66f2
plan: cross-surface-consistency
---

# A list row keeps its trailing separator and date at one place

## What

The list row title stretches to fill the line (packages/ui/src/primitives/list-row/variants.ts), so in the chat list the separator dot and the date are pushed to the line end and the dot lands at a different x for each date length; rows with a unique name show the date with no dot at all.

## Why

A separator that moves with its neighbour and sometimes vanishes reads as broken alignment down the whole list.

## Done when

The row's trailing meta sits in a fixed slot with one separator rule for every row, measured across date lengths, with a component test.

## Evidence

Filled at landing: what ran and where its output is.
