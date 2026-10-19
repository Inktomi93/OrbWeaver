---
kind: tooling
status: doing
updated: 2026-10-19
priority: P2
lane: wt/agent-a6adcf445a5debd8e
---

# Ambient globals successors keep the raw egress and env reader cases

## What

In the 1041 ambient-globals shard, the no-raw-egress successor drops a case the old gate held under the node types fixture, and the sole-env-reader successor has an unrecorded bypass on the authz path, shown by an old-gate differential. Security: route to security-executor.

## Why

Item 1041 moves the gate only when the successor keeps every claim the old gate made or records a loss with a census proving no live site depends on it; the shard was refuted on this point after three attempts, and the old gate stays in force until it passes.

## Done when

The successor covers the named case with a planted defect red first, or the loss is recorded with a census showing no live site, waiver or grant hits it; an independent verifier confirms; the old gate module is deleted.

## Evidence

Filled at landing: what ran and where its output is.
