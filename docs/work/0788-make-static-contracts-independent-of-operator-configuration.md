---
kind: tooling
status: doing
updated: 2026-10-07
priority: P1
area: ci
lane: wt/static-contract-repair
---

# Make static contracts independent of operator configuration

## What

Repair test lint coverage, native lint proof context, injected skill reconstruction, unused exports and planted Git identity.

## Why

Hosted checks expose proof contracts that depend on local operator state or stale configuration.

## Done when

Affected native suites preserve their assertions and pass with explicit fixture configuration; lint and unused export checks remain strict.

## Evidence

Filled at landing: what ran and where its output is.
