---
kind: adr
status: active
updated: 2026-09-23
---

# The workload runner env builder is superseded

## Context

Not recorded in the ledger row.

## Decision

~~`WorkloadRunnerEnv` builder = `entry/compose/runner-env.ts`; the type stays in `domain/workloads/contract`.~~ **SUPERSEDED by \[\[D117]]** (the workloads junk-drawer exit): the hub and its builder are DELETED — each domain raises its own `WorkloadContribution`s at `domain/<x>/workload-contributions.ts`, assembled at `entry/compose/workload-contributions.ts`.

## Consequences

Not recorded in the ledger row.

## Alternatives rejected

Not recorded in the ledger row.
