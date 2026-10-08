---
kind: adr
status: superseded
updated: 2026-10-08
supersedes: docs/adr/0274-the-commit-gate-runs-only-what-narrows-to-the-staged-files.md
superseded-by: docs/adr/0307-weekly-tooling-proof-and-product-qualification.md
---

# Qualify cumulative changes before release

## Context

Scoped commits cannot establish merged-tree correctness. Repeated whole verification blocks local development. Release promotion needs evidence for the exact tested revision.

## Decision

Pre-commit and pre-merge-commit run `pnpm verify --static --changed staged`. Preserve deletions, renames, native compiler ownership and partial-staging isolation. Run stages that narrow to the index; defer whole commands with explicit notices. Keep sequential stage execution and the message contract.

Lanes own meaningful affected behavior and applicable static checks. Reuse completed evidence only while its inputs, scope and execution population match. The orchestrator freezes merge trains and owns combined-tree reconciliation, ratchets and affected integration. A scoped green does not establish whole-tree green.

Local pre-push checks main/release synchronization. CI qualifies cumulative changes from a current-generation qualified ancestor, recording the actual event boundary separately. Inherited qualification requires exact-SHA main-push workflow success and a successful generation-marked static step from the same attempt. Ambiguous metadata and exhausted discovery refuse qualification.

Publication bootstrap requires positively established absence of qualified ancestry and an explicitly admitted publication ancestor. Bootstrap requires complete current tooling and application proof. Cumulative measurement controls application skips, tooling selection and showcase version comparisons. Preserve strictly newer showcase versions for changed installable inputs.

Use `pnpm verify --product` for explicit application qualification. Nightly runs `pnpm verify --full` with separate exact-SHA success state. Failed, cancelled and no-verdict runs cannot save success. Release promotion requires current-generation main-push success for exact synchronized main HEAD, including whole-workflow completion.

Homes and enforcement: `lefthook.yml`, `.github/workflows/ci.yml`, `scripts/github-sync.sh`, `scripts/ci-qualification.ts`, `tooling/src/verify/` and `docs/law/UNIFIED-VERIFICATION-DESIGN.md` section 4. Native Git, metadata and subprocess controls prove the boundaries.

## Consequences

Commit checks establish index-scoped integrity, not release authority. Matching lane evidence avoids repeated checks without excusing merged-tree obligations. Nightly proof does not replace event qualification. Hosted completion must be observed before claiming a full verdict.

## Alternatives rejected

Whole commands at commit cannot narrow to the index. Automatic whole verification at local push duplicates CI and blocks local work. Immediate event deltas hide failed-predecessor defects and version debt. Product verification cannot replace tooling proof. Metadata outages cannot authorize an older version baseline.
