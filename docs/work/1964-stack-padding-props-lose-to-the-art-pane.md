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

Stack's padding axes sit before artDecoration, so a padding prop keeps the art pane's ps and pe reservation while a padding class evicts it. ReadingBox writes PLATE_INSET and PAGE_INSET as classes, so a portrait's reservation is dropped and text can run into the art. The reservation is correct design and wins: move ReadingBox to padding props. Give the name row's reach and its px-field one owner, so no class order decides the padding. Remove the rule's skip for these sites.

## Why

A padding prop and a padding class render differently on the same element, and the rule skips them. Keeping a wrong render because moving it changes pixels is the problem this initiative exists to fix.

## Done when

With a portrait set, a CT shows reading text clear of the art pane in every chat style, the name row keeps its reach and inset through one owner, no class order comment remains, and the rule refuses these classes with no skip.

## Evidence

Filled at landing: what ran and where its output is.
