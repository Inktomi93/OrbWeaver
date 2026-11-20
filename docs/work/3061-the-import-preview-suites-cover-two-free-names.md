---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: server
plan: test-foundation
---

# The import preview suites cover two free names minted in one batch and an aborted library-kind dry run

## What

Two working behaviours of the library-kind batch writes have no case in `tests/server/domain/import/persistence/`. First, two different presets, themes or books under one held name in one upload: the dry run and the run both mint the next two free names through the shared decide step in `packages/server/src/domain/preset/verbs/import.ts`, `packages/server/src/domain/settings/verbs/import-theme.ts` and `packages/server/src/domain/world-info/persistence/import-write.ts`. Second, an aborted dry run stops between files through `mapYielding` in `packages/server/src/primitives/abort/index.ts`; the deleted preset and theme preview reads carried that case and nothing replaced it.

## Why

A mint the dry run did not record would make the preview count fewer writes than the run makes, and an aborted dry run that reads a whole folder holds the interactive lane for the rest of it.

## Done when

Through the real tree door: one case per kind shows two namesakes preview the same writes the run makes and land under the next two free names; one case aborts a dry run over many presets, themes and books and shows it stops before it reads the rest.

## Evidence

Filled at landing: what ran and where its output is.
