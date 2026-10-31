---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-enforcement
---

# Export a production home for every value tests restate

## What

The derivation audit found tests copying module-private production values because no export exists: an RPG_OP_CODES object (rpg verbs throw inline codes, packages/server/src/domain/rpg/verbs/game/update-config.ts), the import and export route constants (packages/server/src/entry/http/import.ts BUNDLE_ROUTE, export.ts LIBRARY_ROUTE), PORTABLE_PARSE_FAILURES as a runtime tuple (packages/contracts/src/portability/index.ts), the Anthropic beta header names, the reaction note builder (packages/server/src/domain/chat/teaching-contribution.ts), the Shared keywords lead (packages/server/src/domain/discovery/themes/generate.ts), the durable-local storage prefix and boot-hint key, the app-ready attribute, the GPU launch switch (tooling/src/floor/browser/browser-acceleration.ts) and the ORB_ENV\_\* keys. Each moves to a zero-import module production itself imports.

## Why

A test can only derive a value production exports; the lint rules in this plan need these homes first.

## Done when

Each listed value has one production home that production reads; the tests that copied it import it; no production export exists only for tests.

## Evidence

Filled at landing: what ran and where its output is.
