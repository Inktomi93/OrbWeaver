---
kind: decision
status: open
updated: 2026-11-12
priority: P3
area: ui
plan: cross-surface-consistency
---

# Decide whether the regex editor wraps lines at enlarged text

## What

CodeMirror's `cm-scroller` scrolls sideways because line wrapping is off. Shows at phone 300% text on: Config independent category regex.

## Why

Reflow at enlarged text competes with code layout.

## Done when

Ruling, narrowed to the item's own subject: the code editor's scroller does not scroll sideways on the regex checkpoints at enlarged text. The page's own sideways scroll and button cuts there belong to the regex page's item. Met on the four text-size walks of main: the editor wraps on desktop and phone.

## Evidence

Filled at landing: what ran and where its output is.
