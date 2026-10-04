---
kind: bug
status: open
updated: 2026-10-04
priority: P3
area: refinery
---

# Refinery workbench says unbound when background work is refused

## What

summarizerFactsOf (domain/refinery/substrate/summarizer.ts) throws RefineryNotConfiguredError whenever RoleClients.resolved returns null, which covers both nothing bound and background work refused.

## Why

The schema editor's plan line and the workbench give the user contradictory causes for the same row.

## Done when

The workbench preflight and runs name background-refused from the same resolveStructuredBinding and canFund source the plan line uses, with a test.

## Evidence

Filled at landing: what ran and where its output is.
