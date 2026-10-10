---
kind: adr
status: active
updated: 2026-10-10
---

# Keep mutation measurement outside GitHub-hosted CI

## Context

Mutation campaigns cannot complete within the hosted workflow execution budget. Application behavior checks remain required.

## Decision

Do not execute quality:mutation-gate when GITHUB_ACTIONS is true and RUNNER_ENVIRONMENT is github-hosted. Keep local full verification and pnpm test:mutation:gate unchanged. Preserve mutation targets, thresholds and execution ceilings. Unknown execution classes run the stage. Record the conditional omission as not measured, not a mutation-score verdict. All other application stages remain required. Partition aggregation validates the canonical omitted-stage result and refuses missing, altered or falsely passing evidence. Hosted full success markers use a separate cache version. Homes are tooling/src/verify/lib/registry.ts, tooling/src/verify/lib/stage-plan.ts, tooling/src/verify/lib/partition-aggregate.ts and .github/workflows/ci.yml. This refines D307 without changing product release authority or weekly checker proof.

## Consequences

Hosted full qualification does not establish a mutation score. Local mutation measurement remains available with its existing contract. Successful behavior checks cannot substitute for mutation evidence.

## Alternatives rejected

Increasing hosted timeouts does not bound campaign completion. Removing mutation targets or lowering the threshold changes the quality contract. Marking the omitted campaign successful invents evidence.
