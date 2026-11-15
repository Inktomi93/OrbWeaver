---
kind: bug
status: open
updated: 2026-11-15
priority: P3
area: world-info
plan: import-robustness
---

# Concurrent lorebook imports do not mint the same book twice

## What

The import in `packages/server/src/domain/world-info/persistence/import-write.ts` reads for an existing book by content key and then inserts, so concurrent imports of the same book can both insert. Guard the race in the write statement as the database rules describe.

## Why

A double-click or another tab leaves a duplicate lorebook.

## Done when

A test runs concurrent imports of the same book and finds a single book.

## Evidence

Filled at landing: what ran and where its output is.
