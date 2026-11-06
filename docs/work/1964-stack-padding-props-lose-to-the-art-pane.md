---
kind: bug
status: open
updated: 2026-11-06
priority: P3
area: ui
plan: cross-surface-consistency
---

# Stack padding props lose to the art pane's reserved inset

## What

Stack's padding axes sit before artDecoration, so a padding prop never replaces the art pane's ps and pe classes while a padding class does. ReadingBox in message-box.tsx and the name row's px-field against REACH_CARD depend on that order, so both stay as classes. Decide whether the reservation should win, then reorder the axes or keep the classes with a coded reason.

## Why

A padding prop and a padding class render differently on the same element, so these sites cannot move and the rule skips them.

## Done when

With a portrait set, ReadingBox and the name row render the decided inset through a prop, or the census carries a coded keep with the reason.

## Evidence

Filled at landing: what ran and where its output is.
