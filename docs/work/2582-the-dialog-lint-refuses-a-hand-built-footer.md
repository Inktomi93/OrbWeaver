---
kind: tooling
status: open
updated: 2026-11-11
priority: P3
area: tooling
plan: checked-law
---

# The dialog lint refuses a hand-built footer or exit in a feature

## What

orb/dialog-via-composite matches only Dialog and DialogPopup, so a feature can build a DialogFooter or a DialogClose by hand and nothing fails. It waits for the two items that move the existing sites onto the composites and the host footer.

## Why

The conversions can regress with no failure.

## Done when

The rule refuses DialogFooter and DialogClose in a feature outside an EmptyState action, with a planted control, on at zero.

## Evidence

Filled at landing: what ran and where its output is.
