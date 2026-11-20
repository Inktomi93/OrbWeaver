---
kind: work
status: open
updated: 2026-11-15
priority: P3
area: regex
---

# Name the standard and comment message kinds before the regex author lists offer them

## What

Pick user-facing words for the standard and comment message kinds, then offer both in the regex editor's Whose messages lists beside Narration.

## Why

The app has no word for either kind, so packages/client/src/features/regex/lib/regex-authors.ts (on its branch) offers only Narration. A stored selector for either kind still lists with a placeholder label.

## Done when

Both kinds have a word recorded in `docs/law/vocabulary-map.md`, and the add menu offers them.

## Evidence

Filled at landing: what ran and where its output is.
