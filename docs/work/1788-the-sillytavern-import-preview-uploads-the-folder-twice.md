---
kind: bug
status: open
updated: 2026-11-14
priority: P3
area: client
blocked: owner
plan: import-robustness
---

# The SillyTavern import preview uploads the folder twice

## What

Upload the SillyTavern folder once, and let the preview and the import share the staged upload. Today `use-library-import.ts` posts each batch twice through `importTree` (`packages/client/src/data/import-tree.ts`): once with `dryRun` for the preview and again for the import.

## Why

The preview sends the folder to the server, and the import sends it again, so a large profile crosses the network twice.

## Done when

A test that previews and then imports one folder counts one upload request per batch of files, and the import runs from the staged copy.

## Evidence

Filled at landing: what ran and where its output is.
