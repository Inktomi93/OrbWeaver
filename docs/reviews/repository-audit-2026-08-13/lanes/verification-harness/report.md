# Verification-harness audit report

## Lane identity

- Lane: `verification-harness`
- Semantic scope: direct `scripts/check`, direct `scripts/verify`, and assigned `tests/tooling` harness files; sibling gate implementations are excluded.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: final current bytes recorded in `read-receipt.tsv`; this is rolling audit evidence.
- Assigned files read: 64 / 64 (100%).
- Assigned lines read: 13,154 / 13,154 (100%).
- Assigned bytes read: 723,871 / 723,871 (100%).
- Dirty assigned paths: no conclusion; the per-path receipt is the byte authority.
- Exclusions: gate implementations and their semantic policy belong to the gate lanes.

## Read receipt

`read-receipt.tsv` records every OWNED path with its current line count, byte count, SHA-256, and `full` read status. Coverage is 64 / 64.

## Architecture observed

Gate discovery is filesystem-driven: the loader globs, sorts, imports, and validates descriptors at `scripts/check/loader.ts:13-71` (R3). The check pass runs begin hooks, scoped visits, whole-run hooks, and finalizers while preserving tool errors at `scripts/check/pass.ts:365-407`; the report emitter writes structure output and returns nonzero for violations/tool errors at `scripts/check/report.ts:67-89` (R3). The verification registry and runner classify stage results, preserve logs, and implement strict scoped deferral at `scripts/verify/registry.ts:6-71` and `scripts/verify/run.ts:284-308,491-560` (R3).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Descriptor discovery, pass, and report path (64 assigned harness/test files) | 5 | 4 | 4 | 4 | 4 | high | `scripts/check/loader.ts:13-71`; `scripts/check/pass.ts:365-407`; `scripts/check/report.ts:67-89`; assigned positive-control test sources. |
| Verification registry and scoped-stage runner (direct registry/run plus assigned tests) | 5 | 4 | 5 | 5 | 4 | high | `scripts/verify/registry.ts:6-71`; `scripts/verify/run.ts:284-308,491-560`; `tests/tooling/verify-run.int.test.ts` 46/46 current pass. |
| Test-membership enforcement | 4 | 4 | 5 | 5 | 4 | high | `scripts/verify/tests-type-membership.ts:23-123`; `scripts/verify/tests-execution-membership.ts:168-224`; current unsandboxed membership receipts in `commands.md`. |

## Findings

No confirmed P0–P3 defect is established in the assigned harness scope. The original sandboxed execution-membership nonzero was reproduced as a host restriction, while the exact command subsequently passed twice unsandboxed; it is not a repository finding (`commands.md`).

## Proven strengths

- R4: `tests/tooling/check-gates.int.test.ts` creates real fixtures, invokes the report path, and requires every registered gate to fire or be explicitly UNFIXTURABLE; `tests/tooling/gate-conformance.int.test.ts` covers descriptor proof conformance.
- R4: `tests/tooling/scoped-run.int.test.ts` plants a source defect, proves scoped/full behavior, moves the defect out of scope, and proves whole-project work is deferred rather than passed.
- R5: `tests/tooling/verify-run.int.test.ts` passed 46 / 46 and covers classifier behavior, parser rejection, registry uniqueness/log collisions, scope selection, and synthetic registry-gate proof.
- R5: current type-membership and execution-membership receipts are green; the latter passed twice outside the restricted sandbox (`commands.md`).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Gate discovery and pass/report lifecycle | R3 live loader/pass/report path; R4 assigned positive-control test sources | Implemented and test-backed; sibling gate semantics excluded. |
| Scoped verification planning | R3 live strict defer/skip behavior; R4 planted scoped-run test | Implemented and behavior-tested. |
| Verification registry/runner | R5 current 46-test runner suite | Implemented and currently proven in assigned scope. |
| Test program/execution membership | R5 current membership receipts | Current membership proof; not proof of every test's behavior. |

## Tests and gates

The assigned positive-control sources were read. `verify-run.int.test.ts` passed 46 / 46; current type and execution membership receipts are green. `check-gates.int.test.ts` was not rerun because its fixtures mutate shared probe paths, so its R4 source evidence is not upgraded to a fresh execution receipt. No timeout, partial run, or zero-output structural scan receives credit.

## Cross-lane edges

- Gate implementation semantics and any gate-local finding belong to `gates-a-h`, `gates-i-p`, or `gates-q-z`.
- The current sandbox restriction remains an environment diagnostic; it must not be merged with a repository behavioral failure.

## Tool receipts

See `commands.md` for exact commands, current report/artifact reconciliation, sandbox limitation, and the two unsandboxed execution-membership passes. `pnpm ast exports scripts/verify` returned no results but is deliberately not used as an absence claim.

## Lane verdict

All 64 assigned harness files were fully read and current-byte receipted. Discovery, report execution, scoped deferral, registry classification, and membership enforcement are real executable paths with R4/R5 proof in the stated denominators. The largest uncertainty is sibling gate-body behavior, which is intentionally outside this lane.
