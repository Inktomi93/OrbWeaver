---
kind: tooling
status: open
updated: 2026-10-11
priority: P2
area: tooling
---

# A lane's commit check catches a new waived site with no census row

## What

Twice in one day a lane added an @orb-waive caught-failure site without its row in tooling/src/verify/gates/caught-failure-ownership.population.json. The pre-commit verify --static --changed staged passed both times because caught-failure-ownership-health and ledgers:fresh only run whole-tree, so the miss surfaced after merge.

## Why

The census drift should fail at the lane's commit, not at the orchestrator's barrier.

## Done when

The staged static check fails when a staged file adds a waived caught-failure site with no census row, naming the row to add; a test covers it.

## Evidence

Filled at landing: what ran and where its output is.
