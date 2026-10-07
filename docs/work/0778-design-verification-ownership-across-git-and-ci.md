---
kind: tooling
status: doing
updated: 2026-10-07
area: tooling
lane: codex/local-hook-floor
---

# Design verification ownership across Git and CI

## What

Define verification ownership across lanes, local Git operations, orchestrator merge trains, CI and release promotion. Configure hooks after the combined obligations are clear.

## Why

Repeated whole verification blocks local work. Scoped lane results do not establish correctness of the combined main tree.

## Done when

Preserve staged isolation and main/release synchronization. Define evidence reuse and merged-tree checks. Prove CI change boundaries, nightly full verification and exact-revision release qualification. Record the adopted division in the decision ledger.

## Evidence

Proposal only. The hook change remains unmerged. Keep the ordinary staged static floor; no lighter commit tier is planned.

| Boundary | Proposed owner and proof |
| - | - |
| Lane worktree | Prove affected behavior. Count matching completed hook checks toward the static floor rather than repeating them manually. |
| Commit | Check the staged index, including deletions and renames. Preserve partial-staging isolation and the message contract. |
| Merge commit | Check the staged merge result. A fast-forward creates no merge commit and still owes orchestrator reconciliation. |
| Orchestrator train | Reconcile the combined tree after a drained batch. Include cross-file checks, train ratchets, affected integration behavior and required tool proofs. Return concrete failures to their owners. |
| Local push | Preserve main/release synchronization refusal. Remove duplicated whole verification only after the qualification chain is complete. |
| PR and main CI | Qualify the actual event revision and change boundary. Preserve whole static, application suites and publication checks. |
| Product qualification | Use `pnpm verify --product` explicitly for whole application proof. It does not certify tooling test populations. |
| Nightly | Use `pnpm verify --full` with separate successful-revision cache state and an adequate runtime budget. |
| Release | Require successful push-event CI for exact main `HEAD` before promotion to `release`. |

Reuse completed behavior results only when the relevant source, dependencies and scope still match. Conflict resolutions, shared contracts and changed import relationships need affected rechecks. Batch whole reconciliation rather than repeating it after every lane merge.

The CI event boundary needs a repair. `tooling/src/verify/lib/repo-paths.ts` can select `HEAD` when clean main CI has `origin/main` at `HEAD`. The affected-tooling stage then measures no changes. Full checkout history repairs an unknown base, not this empty comparison. Supply the PR base or push-before boundary and retain explicit failure handling when it is unavailable.

Changed tooling tests also need direct selection. The current affected selector admits only existing `tooling/src` sources. Define outcomes for test-only changes, renamed or deleted paths, shared helpers and executable configuration.

Preserve `pnpm test:ratchets` as an orchestrator train obligation. `pnpm check` does not cover its complete population. Credit a broader completed run only when it actually contains the same member suites on the matching tree.

`ci-ok` deliberately excludes smoke. `scripts/github-sync.sh` qualifies release through the whole workflow conclusion for exact `HEAD`, which is stronger. Preserve that distinction.

Native hook tests prove synchronization refusal and conditional release promotion against an isolated bare remote. The staged floor already defers branch-wide tooling commands. Completed product timing runs are not successful qualification.

Adoption needs a D274 successor, consistent hook and orchestrator guidance, CI boundary proofs, and nightly full-cache separation. No authority change is adopted by this proposal.
