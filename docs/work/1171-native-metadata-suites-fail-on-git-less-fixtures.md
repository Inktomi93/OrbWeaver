---
kind: bug
status: open
updated: 2026-10-19
priority: P2
plan: test-foundation
---

# Native metadata suites fail on git-less fixtures and default timeouts

## What

On main, baseui-metadata, client-lexical-metadata, context-registry-metadata, parallel-map-metadata and native-typed-metadata fail most cases: fixtures run lint in directories that are not git repositories ("not a git repository"), and multi-second native lint cases run on the 5 s default or too-small budgets; source-type-suppression-native expects exit 1 and gets 2.

## Why

Suites that fail for their own fixture reasons hide every real metadata-admission regression; 1151 found real regressions only in the suites that still passed.

## Done when

Each fixture builds a git repository or the door stops requiring one, each long case carries a measured scaled budget, the exit-code expectation is re-derived, and the six suites pass on a quiet run.

## Evidence

Filled at landing: what ran and where its output is.
