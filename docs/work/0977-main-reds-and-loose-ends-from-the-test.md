---
kind: bug
status: open
updated: 2026-10-12
priority: P2
---

# Main reds and loose ends from the test-mirror lanes

## What

Known reds and loose ends surfaced by lanes and verifiers: the release-please-config cmdk dependabot-ignore case fails on main; real-corpus-liveness-manifest is red for policies that lack liveness pins (contract-structural-copy, json-column-read-parsed, test-file-size, test-production-clone, trpc-input-declarations, wire-json-parsed-at-consumer and test-hand-shape); the no-inline-types waiver budget disagrees with its measured count; dependency-cruiser-worlds and application-knip failed from tests/support/node_modules before the vitest exclusion fix and need a clean rerun; session-daemon.int T5 failed twice under load and is unproven either way; gate-spelling-twins.int has no verdict yet because it times out under load.

## Why

Reds on main poison every lane's evidence and hide new failures.

## Done when

Each listed check is green on main or has a recorded cause and owner.

## Evidence

Filled at landing: what ran and where its output is.
