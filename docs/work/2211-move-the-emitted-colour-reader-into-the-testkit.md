---
kind: work
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# Move the emitted-colour reader into the testkit

## What

emittedGrey and emittedInk have one home, but it is a tests/ui file rather than the testkit, against 2197's title.

## Why

Other test trees reach a tests/ui file by a relative cross-directory path.

## Done when

The reader lives in the testkit and every importer reads it there, or its tests/ui home is ruled with a cited reason.

## Evidence

Filled at landing: what ran and where its output is.
