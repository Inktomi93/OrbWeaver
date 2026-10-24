---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Settings search completes groups and plugins and says when nothing matches

## What

`menuTokens` (`packages/client/src/features/config/components/config-search-input.tsx:154-160`) completes only @shelf: values. For @in: and @plugin: it returns no completions. A no-match search renders "No settings match" (line 228); whether it is announced is unchecked.

## Why

A user typing a filter gets no guidance and a blank result reads as broken.

## Done when

@in: and @plugin: offer name completions like shelfCompletions. The no-match empty state is announced to assistive technology. A CT covers both.

## Evidence

Filled at landing: what ran and where its output is.
