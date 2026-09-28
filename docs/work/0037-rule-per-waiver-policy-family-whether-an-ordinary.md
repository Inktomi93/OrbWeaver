---
kind: decision
status: open
updated: 2026-09-28
priority: P2
area: verify
---

# Rule per waiver policy family whether an ordinary waiver must state an end condition

## What

The owner has ruled that ordinary waiver end conditions are decided per policy family. Item 0034 must propose a table of must, conditional or not required, with sampled evidence, for owner approval. Each 'must' family gets engine enforcement. After approval, add the required end conditions to non-conforming waivers or remove the waivers and fix their findings. Do not bulk-delete or bulk-grant.

## Why

If a waiver has no stated end condition, it stays in place after its cause is gone, and nobody reading it can tell whether it still guards a real exception. The triage artifacts say themselves that they certify binding, not continued necessity. So the open-ended population can only shrink after a ruling for each family.

## Done when

The ledger finding records one ruling for each ordinary-waiver policy family: must, conditional with the named cases, or not required. For every 'must' family, re-running the end-condition reader finds no waiver in that family without an end condition. A 'must' family enforced by the engine rejects a planted waiver with no retirement clause as malformed. A spot-check sample from each 'conditional' family matches its named cases. The finding's status moves off review-pending.

## Evidence

Filled at landing: what ran and where its output is.
