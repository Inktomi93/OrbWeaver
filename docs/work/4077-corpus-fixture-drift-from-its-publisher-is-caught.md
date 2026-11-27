---
kind: tooling
status: open
updated: 2026-11-27
priority: P3
area: tests
plan: test-foundation
---

# Corpus fixture drift from its publisher is caught before a lane meets it

## What

The committed corpus fixture under tests/support/node/corpus-data drifted from what scripts/corpus-fixture.ts publish writes at HEAD (a provider field, db bytes, an asset shard), and nothing reported it until a lane had to republish.

## Why

A drifted fixture makes every republish carry unrelated changes and hides which change moved what.

## Done when

A check compares a fresh publish with the committed fixture and names each difference, and the fixture matches it at HEAD.

## Evidence

Filled at landing: what ran and where its output is.
