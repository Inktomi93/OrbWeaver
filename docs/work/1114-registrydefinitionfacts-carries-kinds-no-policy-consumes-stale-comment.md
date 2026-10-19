---
kind: work
status: open
updated: 2026-10-19
priority: P3
---

# registryDefinitionFacts carries kinds no policy consumes; stale comment in warning-code-coverage

## What

After the 1041 registry shards, registryDefinitionFacts has one consuming kind (section); its modal, home-tile, chrome, group and collection kinds have no consumer, the same shape as the deleted id-brands family. tooling warning-code-coverage.ts line 22 carries stale comments after the gate moves.

## Why

Unconsumed fact kinds are analysis cost with no claim behind them, and a stale comment is a defect under the comment rules.

## Done when

A consumer census decides each kind: deleted with its provider and tests, or named with its live consumer; the warning-code-coverage comment matches the code.

## Evidence

Filled at landing: what ran and where its output is.
