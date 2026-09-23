---
kind: decision
status: open
updated: 2026-09-23
priority: P2
area: verify
---

# Rule per waiver policy family whether an ordinary waiver must state an end condition

## What

Ordinary `@orb-waive` markers must carry a reason, but nothing requires the reason to say when the waiver should go away. Many waivers have a substantive reason and no retirement clause. The triage shards put them in the 'owner decision' bucket because a phrase match cannot tell a still-needed waiver from a stale one. For each policy family that carries ordinary waivers, the owner reads a sample of that family's waivers with no end condition against the policy's contract. The owner then rules that the family must always state an end condition, needs one only in named cases, or never needs one. For each 'must' family, record whether the rule is enforced by the waiver engine or by review. Then either add an end condition to each non-conforming waiver or remove the waiver and fix the finding it bound. Do not bulk-delete or bulk-grant.

Owner ruling: rule per family. The waiver adjudication in item 0034 proposes must, conditional or not
required for each family, with sampled evidence. The owner approves the table. Each 'must' family gets
engine enforcement.

## Why

If a waiver has no stated end condition, it stays in place after its cause is gone, and nobody reading it can tell whether it still guards a real exception. The triage artifacts say themselves that they certify binding, not continued necessity. So the open-ended population can only shrink after a ruling for each family.

## Done when

The ledger finding records one ruling for each ordinary-waiver policy family: must, conditional with the named cases, or not required. For every 'must' family, re-running the end-condition reader finds no waiver in that family without an end condition. A 'must' family enforced by the engine rejects a planted waiver with no retirement clause as malformed. A spot-check sample from each 'conditional' family matches its named cases. The finding's status moves off review-pending.

## Evidence

Filled at landing: what ran and where its output is.
