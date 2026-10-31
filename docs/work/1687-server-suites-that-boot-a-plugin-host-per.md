---
kind: bug
status: open
updated: 2026-10-31
priority: P2
area: tests
plan: test-foundation
---

# Server suites that boot a plugin host per case time out under load

## What

tests/server/domain/chat/persistence/continue-return-rows.suite.int.test.ts (privateContinuation) and the chat verbs and engine suites turn-rpg-teaching-policy, turn-rpg-tool-metadata, turn-cancellation, turn-lifetimes-draft and managed-compaction-thresholds boot the composed root and a plugin host per case; under contention the boot alone eats the timeout. Share one room per file the way continue-physical.ts signedRoom() now does, with a fresh chat per case. Also check that budget() reads the box load only once at config load.

## Why

These suites are red on main under load, which hides real regressions.

## Done when

Each suite passes ten runs in a row while another suite runs; no timeout raised and no assertion weakened.

## Evidence

Filled at landing: what ran and where its output is.
