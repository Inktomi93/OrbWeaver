---
kind: work
status: doing
updated: 2026-11-27
priority: P3
area: chat
lane: wt/agent-af34818252fd77fd2
plan: unwired-code
---

# End-to-end specs own their presets and turn routes drop the per-send intent

## What

send, swipe, continueTurn, generate and forceCharacterTurn accept an intent no production caller sends; only tests/e2e/support/trpc.ts uses it, to shrink maxContextTokens and turn on managed compaction without mutating a shared preset. The preset contract carries both knobs.

## Why

A production input kept only for tests is a door the product does not use.

## Done when

Each spec that needs those knobs creates its own preset carrying them, the intent input leaves the five turn routes and their verbs, and the affected e2e specs and router suites pass.

## Evidence

Filled at landing: what ran and where its output is.
