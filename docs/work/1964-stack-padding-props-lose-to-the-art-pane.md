---
kind: bug
status: open
updated: 2026-11-06
priority: P2
area: ui
plan: cross-surface-consistency
---

# Stack padding props lose to the art pane's reserved inset

## What

ReadingBox serves flat and document, which paint no art, yet it accepts artDecoration, so the recipe holds states no chat style reaches and PLATE_INSET and PAGE_INSET stay as classes. Remove artDecoration from ReadingBox's props so the case cannot compile, and move its insets to padding props. Only echo's bubble box takes a portrait; check its reservation still clears the text. Give the name row's reach and tide's px-field one owner, so no class order decides the padding. Remove the rule's skip for these sites.

## Why

A padding prop and a padding class render differently on the same element only for states that cannot occur, and the rule skips real sites because of them. Keeping a class because moving it changes pixels is the problem this initiative exists to fix.

## Done when

ReadingBox takes no artDecoration and writes no inset class, echo's text clears its art pane in a CT on both sides, the name row keeps its reach and inset through one owner, no class order comment remains, and the rule refuses these classes with no skip.

## Evidence

Filled at landing: what ran and where its output is.
