---
kind: tooling
status: open
updated: 2026-10-19
priority: P2
---

# Principal brand successor keeps the namespace-member Principal reference

## What

The turn-identity successor in the 1041 principal-brand shard misses a Principal reached as a namespace member (PropertyAccessExpression), which the old gate caught through possibleSealedReference and identityCandidate; the shard recorded no loss. Security: route to security-executor.

## Why

Item 1041 moves the gate only when the successor keeps every claim the old gate made or records a loss with a census proving no live site depends on it; the shard was refuted on this point after three attempts, and the old gate stays in force until it passes.

## Done when

The successor covers the named case with a planted defect red first, or the loss is recorded with a census showing no live site, waiver or grant hits it; an independent verifier confirms; the old gate module is deleted.

## Evidence

Filled at landing: what ran and where its output is.
