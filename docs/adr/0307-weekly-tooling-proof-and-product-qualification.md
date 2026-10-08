---
kind: adr
status: active
updated: 2026-10-08
supersedes: docs/adr/0306-verification-qualification-ownership.md
---

# Separate product qualification from weekly tooling proof

## Context

Tooling recertification does not establish product correctness. Automatic tiers must retain checks that evaluate the application without running exhaustive checker proof.

## Decision

Pre-commit and pre-merge-commit retain index-scoped lint, types and structure through `pnpm verify --static --changed staged`. Preserve deletions, renames, compiler ownership and partial staging. Whole commands defer explicitly. Local pre-push checks main/release synchronization.

Lanes own meaningful named affected tests and applicable static checks. The orchestrator freezes merge trains and reconciles the combined tree. Reuse evidence only while inputs, scope and execution population match. Scoped green does not establish whole-product green.

Classify checks by their evaluated subject, not their implementation directory. Product qualification retains application types and world purity, import direction, structural invariants, schema consistency, product test membership, lint, builds, runtime tests, CT and smoke. A required application checker that fails or produces no verdict refuses qualification.

Checks confined to tooling implementation and proofs that recertify checkers are independent of `ci-ok` and release qualification. Exhaustive tooling tests, affected-instrument recertification and qualification corpus execution belong only to weekly proof. Static, changed, push, product, full, nightly and local hooks cannot select that execution level. Explicit named focused tests remain available. Weekly proof preserves the complete native proof population, partition controls and resource limits, with its own failure result and artifacts.

CI qualifies cumulative application changes from a current-generation qualified ancestor. Record the actual event boundary separately. Inherited authority requires exact-SHA main-push product success, real required product jobs and generation-marked steps from the same attempt. Metadata ambiguity, incomplete pagination, changing observations and exhausted discovery refuse authority. Failed, cancelled, skipped required jobs and no-verdict runs cannot qualify.

Publication bootstrap requires positively established absence of qualified ancestry and an explicitly admitted publication ancestor. Require complete current product proof, not inherited publication tests or weekly tooling success. Preserve cumulative application skips and showcase version comparisons. Changed installable inputs require strictly newer versions.

Nightly full and manual product qualification retain separate exact-SHA success state, without tooling recertification. Red, cancelled and no-verdict runs cannot save success. Weekly proof has separate scheduling and success state. Release promotion requires current-generation product qualification for exact synchronized main HEAD; a sync-created merge needs qualification.

Homes are `lefthook.yml`, `.github/workflows/ci.yml`, `scripts/github-sync.sh`, `scripts/ci-qualification.ts`, `tooling/src/verify/` and `docs/law/UNIFIED-VERIFICATION-DESIGN.md`.

## Consequences

Product qualification does not claim tooling recertification. Weekly proof failures remain visible without vetoing valid product evidence. Scheduled activation requires the workflow definition on the repository default branch.

## Alternatives rejected

Whole tooling recertification at commit, push or nightly duplicates weekly proof. Ignoring failed required checks or filtering compiler errors by file path hides missing application evidence. Tooling implementation paths cannot classify the subject a checker evaluates.
