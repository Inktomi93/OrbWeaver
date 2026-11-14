---
kind: work
status: open
updated: 2026-11-14
priority: P2
area: import
plan: import-robustness
---

# Presets, themes and world books judge a dry run with the write's own batch operation

## What

The dry run judges presets, themes and world books with a read-only key function beside each write, not with the write itself. Make each one a batch owner operation that holds one judge per upload, with a dry-run mode. A single-file door becomes a batch of one, and the free-name step tracks the names minted within the batch. Characters need the card ledger threaded into the character import service. Contracts to change: `packages/contracts/src/preset/owner-ops.ts`, `packages/contracts/src/settings/index.ts` and `packages/contracts/src/world-info/owner-ops.ts`; the server follows in `packages/server/src/domain/import/contract/profile-directory.ts`, `packages/server/src/domain/import/verbs/import-presets.ts`, `packages/server/src/domain/import/verbs/import-themes.ts` and `packages/server/src/entry/compose/portability-runner.ts`.

## Why

The preview must state exactly what the run writes. A twin that copies the write's equality rule can drift from it; one operation called in two modes cannot.

## Done when

The preview and the run call the same batch operation for each of the three kinds, the twin functions are deleted, and a test per kind shows the preview's writes equal the rows the run adds for repeats within one upload and against the library.

## Evidence

Filled at landing: what ran and where its output is.
