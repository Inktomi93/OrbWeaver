---
kind: bug
status: open
updated: 2026-10-21
priority: P2
area: testkit
plan: test-foundation
---

# Qualify maintained corpus producer, clone and search lifetimes

## What

Qualify maintained corpus producer, clone, search and cleanup cases through existing testkit and production entries. Diagnose fixture or product failures without expanding checker machinery.

## Why

Corpus-based replacements depend on correct ownership, published search results and joined resource lifetimes.

## Done when

The named suites complete with correct ownership, outputs and joined lifetimes. Preserve meaningful assertions and diagnose failures before changing timing. Use synthetic corpus data.

## Evidence

Run `tests/support/node/corpus-seed.int.test.ts`, `corpus-fixture.int.test.ts`, `corpus-library-clone.int.test.ts`, `corpus-search.int.test.ts`, `corpus-search-publication.int.test.ts` and `corpus-fixture-lifetime.int.test.ts`. All paths share `tests/support/node/`.
