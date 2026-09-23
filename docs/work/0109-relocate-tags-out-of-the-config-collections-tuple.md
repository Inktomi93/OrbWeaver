---
kind: work
status: open
updated: 2026-09-23
priority: P2
area: client
---

# Relocate tags out of the Config collections tuple into chip popovers and a Corpus overview

## What

Config/Settings already merged and the tag editor (packages/client/src/features/tag/) already has full power, but the relocation the config-tag-facets plan called for is not built: tags still sit in the collections tuple in packages/client/src/state/config-group-ids.ts, no tag chip opens an in-place popover reusing the existing editor, and no Corpus overview surfaces taxonomy usage, orphans or bulk cleanup. Build the popover, add the Corpus tag overview under packages/client/src/features/discovery/, drop tags from the collections tuple, and resolve the plan's open questions: whether regex scripts and world-info books pass the CONTEXT-pane test and where each then lives, what Corpus holds today and whether it can host the tag overview, and whether the imagery prompt templates in settings should be renamed so "template" means only the preset templates (D132).

Keep the plan's dividing line: a **thing** is an authored object you own and visit (a character, a preset, a book, a regex script) and earns a home; a **facet** is a property of many things (a tag) and lives on those things, not in a section of its own. Do not just restyle the existing Config tag screen or rebuild the tag editor — the editor already has the needed power; only its home is wrong.

## Why

A tag is a facet of many things, not a destination; leaving it in the collections tuple keeps forcing an empty-feeling CONTEXT pane. The config-tag-facets plan closed with this relocation undone, and the owner has not rejected it.

## Done when

Tags leave the CONFIG_SHELVES collections tuple; every tag chip opens an in-place popover on the existing editor; a Corpus overview lists tag usage, orphans and a bulk action; the three open questions are answered in the item that finishes this work.

## Evidence

Filled at landing: what ran and where its output is.
