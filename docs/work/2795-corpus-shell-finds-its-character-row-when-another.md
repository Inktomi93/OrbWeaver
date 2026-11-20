---
kind: bug
status: open
updated: 2026-11-13
priority: P3
area: testing
plan: test-foundation
---

# corpus-shell finds its character row when another corpus spec ran first in the clone

## What

After `tests/e2e/corpus-conversation.spec.ts` and `tests/e2e/corpus-settings.spec.ts` run in the same corpus clone, the library holds each character twice, so the phone cases of `tests/e2e/corpus-shell.spec.ts` that find a character row by exact name miss it. The spec passes alone.

## Why

A spec that passes alone and fails by run order makes the e2e verdict depend on scheduling.

## Done when

The spec that duplicates the library is named and either restores it or each spec gets its own clone, and the three specs pass together on the phone project.

## Evidence

Filled at landing: what ran and where its output is.
