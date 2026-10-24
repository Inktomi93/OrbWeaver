---
kind: adr
status: active
updated: 2026-10-24
---

# A workload contribution may exclude kinds from running beside it

## Context

D209 rules that execution is a lane and admission is a lock, and that the two never interact. Neither can say that two different kinds must not run at the same time. A restore writes its blobs before the rows that reference them, and the asset sweep reclaims any unreferenced blob older than its grace window. A restore that outlives that window loses blobs to a sweep that runs beside it. The shipped worker runs the sweep lane one row at a time, so both kinds already run one after the other on one replica. A wider sweep lane, or a second replica on the same database, makes the overlap reachable.

## Decision

WorkloadContribution.excludes names the kinds a kind must never run beside, for any owner, on any lane or replica. The exclusion binds both ways, so the kind that cares declares it once. It is an execution rule beside the lane: it decides when a row runs and never whether it is admitted, so the single-active locks and admission keys are untouched. The queue scan skips a queued row while an excluded kind is in flight, so a held row never blocks the rows behind it in its lane. markStarted judges the same predicate inside its claim UPDATE, so two replicas cannot both start. assets-gc excludes import-bundle and import-st. Homes: domain/workloads/contract/contribution.ts (the field), domain/workloads/persistence/queries.ts (the scan skip and the claim predicate), domain/assets/workload-contributions.ts (the declaration). Checks: tests/server/domain/assets/gc-import-overlap.int.test.ts.

## Consequences

A sweep due during a restore waits until the restore settles, and a restore uploaded during a sweep waits for the sweep. A kind added later that writes blobs before their references must be added to the sweep's exclusion list.

## Alternatives rejected

Rely on the one-row-at-a-time sweep lane: it holds only while the lane stays one worker wide and the box runs one replica. Refuse the sweep at admission while an import is active: a sweep admitted before the import still runs beside it. Teach the sweep to skip owners with an active import: that needs a cross-domain read of workloads, wired through the composition root. Pin restored blobs from inside the import: the delivery core has no end-of-bundle signal to release them.
