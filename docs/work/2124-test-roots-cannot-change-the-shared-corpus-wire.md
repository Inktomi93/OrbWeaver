---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Test roots cannot change the shared corpus wire

## What

tests/support/node/corpus.ts shares one corpus wire object across test roots. Freeze it, or clone it per root.

## Why

One root that mutates the shared wire changes what every later root in that worker reads, which makes failures depend on test order.

## Done when

A root that tries to change the wire either fails at the write or changes only its own copy, with a test that proves the next root reads the original.

## Evidence

Filled at landing: what ran and where its output is.
