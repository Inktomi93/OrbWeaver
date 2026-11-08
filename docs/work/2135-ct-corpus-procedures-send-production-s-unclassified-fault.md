---
kind: bug
status: open
updated: 2026-11-08
priority: P3
area: tests
plan: test-foundation
---

# CT corpus procedures send production's unclassified-fault message

## What

tests/support/browser/ct-corpus-procedures.ts sends String(error) for a served 500 or a non-Error throw, where production sends its unclassified-fault message.

## Why

A CT that sees a different failure text from production can pass on copy the user never sees.

## Done when

The CT corpus procedures send the production unclassified-fault message for a 500 and a non-Error throw, read from its production home, with a case for each.

## Evidence

Filled at landing: what ran and where its output is.
