---
kind: work
status: open
updated: 2026-11-14
priority: P3
area: discovery
---

# The discovery landing case reads the question kind from its owner

## What

`tests/server/domain/discovery/persistence/import-landing-reads.int.test.ts` copies the literal `card_answer`, which `packages/server/src/domain/discovery/verbs/analyze.ts` owns and does not export.

## Why

A rename of the kind leaves the case passing for the wrong reason.

## Done when

The kind has one exported home and the case imports it.

## Evidence

Filled at landing: what ran and where its output is.
