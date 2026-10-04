---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Settings search completes groups and plugins and says when nothing matches

## What

After 0484, only @shelf: values get completions; typing @in:chat opens an empty 12px dropdown with no message, @plugin: with no value lists all 158 rows (menuTokens in config-search-input.tsx returns \[] for those kinds). A search with no matches renders an empty listbox with no text and nothing announced (pre-existing).

## Why

A user typing a filter gets no guidance and a blank result reads as broken.

## Done when

@in: and @plugin: offer name completions like shelfCompletions; a no-match search shows and announces an empty state; CT covers both.

## Evidence

Filled at landing: what ran and where its output is.
