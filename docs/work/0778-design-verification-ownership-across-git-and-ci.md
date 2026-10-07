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

The candidate implements the division in D306. Keep the ordinary staged static floor; no lighter commit tier is introduced. Main integration and hosted qualification remain pending.

| Boundary | Owner and proof |
| - | - |
| Lane worktree | Prove affected behavior. Count matching completed hook checks toward the static floor rather than repeating them manually. |
| Commit | Check the staged index, including deletions and renames. Preserve partial-staging isolation and the message contract. |
| Merge commit | Check the staged merge result. A fast-forward creates no merge commit and still owes orchestrator reconciliation. |
| Orchestrator train | Reconcile the combined tree after a drained batch. Include cross-file checks, train ratchets, affected integration behavior and required tool proofs. Return concrete failures to their owners. |
| Local push | Preserve main/release synchronization refusal. CI owns whole qualification before release. |
| PR and main CI | Record the actual event boundary and qualify cumulative changes from a qualified ancestor. Preserve whole static, application suites and publication checks. |
| Product qualification | Use `pnpm verify --product` explicitly for whole application proof. It does not certify tooling test populations. |
| Nightly | Use `pnpm verify --full` with separate successful-revision cache state and an adequate runtime budget. |
| Release | Require successful push-event CI for exact main `HEAD` before promotion to `release`. |

Reuse completed behavior results only when the relevant source, dependencies and scope still match. Conflict resolutions, shared contracts and changed import relationships need affected rechecks. Batch whole reconciliation rather than repeating it after every lane merge.

Record the actual event boundary separately from qualification measurement. Use a current-generation qualified ancestor for cumulative application, tooling and showcase-version comparisons. Failed predecessors cannot erase proof or version debt. Publication bootstrap needs positively established absence of qualified ancestry and complete current proof. Ambiguous metadata refuses qualification.

Changed tooling tests need direct selection. Define outcomes for test-only changes, renamed or deleted paths, shared helpers and executable configuration.

Preserve `pnpm test:ratchets` as an orchestrator train obligation. `pnpm check` does not cover its complete population. Credit a broader completed run only when it actually contains the same member suites on the matching tree.

`ci-ok` deliberately excludes smoke. `scripts/github-sync.sh` qualifies release through the whole workflow conclusion for exact `HEAD`, which is stronger. Preserve that distinction.

Native hook tests prove synchronization refusal and conditional release promotion against an isolated bare remote. The staged floor already defers branch-wide tooling commands. Completed product timing runs are not successful qualification.

Independent review confirms canonical repository identity, qualification environment isolation, conservative runner-configuration selection and media provisioning. Native correction controls pass. D306 supersedes D274 without changing the staged floor. Nightly full-cache state is separate from product; hosted completion within the configured limit remains unproved.
