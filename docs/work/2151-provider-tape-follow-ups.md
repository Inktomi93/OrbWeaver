---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Provider tape follow-ups

## What

Bundle from lane F: the record command never clears reports/provider-tapes, so a stale tape can be promoted. guided-generations.spec.ts uses Date.now() in a test title, and older copies sit beside it. scripts/surface-walk.ts and scripts/corpus-fixture.ts load the operator .env the same way the runner did. No ruling covers random run nonces. The OpenRouter-specific response fields go untested because the tapes replay through custom-openai. The record script cannot take -g. Other requireWireCaptures callers may read the newest capture where they mean the oldest.

## Why

Each is a small gap in the tape and e2e harness that lane F found while building it.

## Done when

Each finding is fixed or answered with a cited reason in this item's Evidence.

## Evidence

Filled at landing: what ran and where its output is.
