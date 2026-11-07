---
kind: work
status: open
updated: 2026-11-07
priority: P3
area: ui
plan: cross-surface-consistency
---

# QueryBoundary reserveBlock takes a CSS length so the picker box needs no render probe

## What

pickerWindowBox resolves its size by probing the DOM in a render initialiser, like the useFirstBootBox sites. A render-free version needs QueryBoundary.reserveBlock to accept a CSS length, which changes the data-tile-reserved vocabulary.

## Why

A DOM probe in render is fragile, and a reserved box should come from a token.

## Done when

reserveBlock accepts a length, and the picker and boot boxes read no DOM in render.

## Evidence

Filled at landing: what ran and where its output is.
