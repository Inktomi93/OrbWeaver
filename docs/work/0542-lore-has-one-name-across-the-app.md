---
kind: work
status: open
updated: 2026-10-04
priority: P3
area: client
---

# Lore has one name across the app

## What

`docs/law/vocabulary-map.md:58` rules the noun "World book" and the library group "World Info". Stray user-facing spellings remain: "lorebook" in `packages/client/src/features/automation/lib/rule-editor-failure.ts:46`, and "Lore" and "Lore application" in `packages/client/src/features/automation/components/rule-analysis-fields.tsx:84,106`.

## Why

Several names for one thing make users think they are different features.

## Done when

Replace each stray with the ruled term in every label, description and help string. A sweep shows no stray spelling.

## Evidence

Filled at landing: what ran and where its output is.
