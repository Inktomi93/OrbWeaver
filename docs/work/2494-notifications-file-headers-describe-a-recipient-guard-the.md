---
kind: bug
status: open
updated: 2026-11-11
priority: P3
area: server
---

# Notifications file headers describe a recipient guard the agent purge removed

## What

The inbox domain context builder header and the service factory header both state that the composition assembles a recipient guard — an injected check that refuses an agent-principal recipient — and that the entry root supplies it as a users-kind read, pointing readers to the service contract for the guard rationale. None of that is on the tree. The guard op, its refusal at the write chokepoint, and its test were all removed in the bulk change that purged the agent-principal machinery; the service contract carries no guard field and states no guard rationale; the current service dependencies name only the database handle, clock, ids, logger, and the standing-ask resolver. The governing decision record carries a rider that already truth-repaired its own text to say the machinery is design-of-record, not the tree, and the identity spine states the same — only these two file headers still assert the guard ships.

## Why

A header naming an injected dependency that is not in the type it describes sends a cold author to wire or trust something that cannot be wired — and the guard it promises, refusing an agent inbox recipient, is exactly the kind of silent policy a reader assumes a machine enforces. The purge was ruled and its ledger entry was repaired the same day; these two headers are the residue the sweep missed.

## Done when

Both headers describe the bundle that exists — database, clock, ids, logger, standing-ask resolver — and either drop the guard mention or mark it as design-of-record under its rider; the service contract text matches its fields, and no header claims a dependency its type lacks.

## Evidence

Filled at landing: what ran and where its output is.
