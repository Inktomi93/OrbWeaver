---
kind: bug
status: open
updated: 2026-10-11
priority: P2
area: client
---

# Command palette ranks fuzzy settings above Corpus rows

## What

With the real settings palette source mounted in CT (item 889), typing Insights, Tags or Analytics puts a fuzzy settings match (for Tags, Show generation cost under Appearance) ahead of the Corpus mode rows the command-palette surface CT expects first. Fix the ranking so an exact or prefix label match in any source outranks a fuzzy settings hit.

## Why

The palette is a navigation door; an exact destination losing to an unrelated setting makes it unreliable, and it was invisible until the CT mounted the production sources.

## Done when

The command palette surface CT ranking cases pass with the production sources.

## Evidence

Filled at landing: what ran and where its output is.
