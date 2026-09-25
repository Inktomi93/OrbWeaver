---
kind: work
status: open
updated: 2026-09-25
priority: P3
area: chat
---

# Warn in the preset editor when per-turn content sits above Chat History

## What

The preset editor warns when a section whose content changes per turn (fired lore, a per-turn macro) is placed above Chat History, because that placement invalidates the history cache on every turn (D251).

## Why

Ruled with 0160: the static and dynamic split protects only the text above per-turn content, and an author can drag per-turn content above the history without knowing the cost.

## Done when

A CT shows the warning for a per-turn section above Chat History and no warning for a static one or for per-turn content below it, red on the current source first.

## Evidence

Filled at landing: what ran and where its output is.
