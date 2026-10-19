---
kind: bug
status: doing
updated: 2026-10-19
priority: P1
lane: wt/agent-ab34ba7b0261ff67a
---

# schema-data-grants real-corpus run runs out of heap at 16 GB

## What

tests/tooling/verify/gates/schema-data-grants.suite.repo.int.test.ts on main fails after about 20 minutes: the contract-verb-presence native inventory fixture dies with a V8 out-of-memory at about 16 GB. Same family as 1098 and 965.

## Why

The hosted CI runner has 16 GB, so this suite cannot give a verdict in CI.

## Done when

The suite completes under 16 GB on main with a measured peak, with no heap increase and no hidden population cut (D328).

## Evidence

Filled at landing: what ran and where its output is.
