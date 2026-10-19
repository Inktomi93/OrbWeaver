---
kind: tooling
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-aeb0038906b746d66
---

# Delete the caught-failure census and health gates with their census file

## What

The gate audit rules caught-failure-census-row and caught-failure-ownership-health DELETE with their family: the committed census tooling/src/verify/gates/caught-failure-ownership.population.json duplicates the @orb-waive reasons. Delete both gates, the census file, its generator (tooling/src/verify/ops/gen/caught-failure-population.ts), its ledgers-fresh derivation and baseline entry, their waiver-budget rows, catalog rows, family tests and liveness cases. Owner ruling: caught-failure-ownership itself stays, bounded under D328.

## Why

Their census regeneration runs the client inventory that does not fit 16 GB, blocking 1049, ledgers-fresh and CI, for gates the audit already ruled out.

## Done when

Both gates, the census file, its generator and every reference are gone in one commit per .claude/rules/verify-and-gates.md item 7; ledgers-fresh no longer derives the census; caught-failure-ownership's own tests pass.

## Evidence

Filled at landing: what ran and where its output is.
