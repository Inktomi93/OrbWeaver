---
kind: work
status: doing
updated: 2026-10-12
priority: P2
area: tests
lane: wt/agent-a10b87c404dc69c69
plan: test-mirror
---

# Burn down the test-reach verb grants

## What

Item 899 baselined unreached modules as reviewed-grant rows in tooling/src/verify/lib/reviewed-grants-test-reach-verbs.ts and reviewed-grants-test-reach-modules.ts, counted by the waiver budget in tooling/src/verify/lib/waiver-budget.ts. Most verb rows are tests that drive the verb through the feature service.ts composition. For each, either add an @subject header naming the verb to the test that exercises it, or add a direct test; delete the grant row and lower the budget row in the same commit. Inference, router, domain, infra and tier rows follow the same rule.

## Why

Each grant is a module the law says must be reached by a test; the ratchet only stops growth, it does not burn the list down.

## Done when

The test-reach grant files are empty and the test-reach budget row is zero.

## Evidence

Filled at landing: what ran and where its output is.
