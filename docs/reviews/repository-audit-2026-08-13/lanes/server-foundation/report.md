# Server foundation audit report

## Lane identity

- Lane: `server-foundation`.
- Semantic scope: server configuration/environment foundation plus observability, host-only debug inspection, wire capture, and their 18 mirrored tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: 38 files first matched the assignment snapshot. During report finalization, `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/env/index.ts` drifted from 39,928 to 39,949 bytes (568 lines retained); it was fully re-read and `read-receipt.tsv` records its closing hash `b45e4cf0de7d2f5fd1cd604a6b32805abb8a1475a19960ea0f31fb884ad64cd3`.
- Assigned files read: 38/38 (100%).
- Assigned lines read: 5,438/5,438 (100%).
- Assigned bytes read: 261,476 current bytes (100%; frozen assignment denominator 261,455).
- Dirty assigned paths: initial Git status showed 1, `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/env/index.ts`; it was clean relative to Git at the closing check but no longer byte-identical to the snapshot.
- Exclusions: source, tests, configuration, shared audit materials, entry composition, provider implementations, and sibling artifacts were not changed. CT, parity, types, and unassigned tests were not run.

## Read receipt

`read-receipt.tsv` covers 38/38 `OWNED` rows in `assignment.txt`, totaling 5,438 lines and 261,476 current bytes, with a closing line count, byte count, and SHA-256 for every path. Initial snapshot reconciliation was 38/38; the corrective replay barrier reread all 38 current files before the retained AST reruns, and the closing reconciliation recorded the one concurrent `env/index.ts` drift above rather than silently treating it as snapshot-identical.

## Architecture observed

The environment foundation parses and freezes its process contract at module load, derives deployment/posture inputs without importing upward, and is consumed by the vLLM provider and lifecycle composition (R3: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/env/index.ts:477`, AST `refs engineLaunchEnvFloor` at `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/infra/providers/vllm/index.ts:111`, and AST `refs diagnosticsPostureInput` at `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/entry/lifecycle.ts:229`).

Observability stays foundation-level: middleware supplies request context and the route registrar receives all optional debug dependencies through its options object (R2: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/middleware.ts:32`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/routes.ts:188`). The entry application imports and calls `registerDebugRoutes` (R3: AST `refs registerDebugRoutes` at `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/entry/app.ts:24` and `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/entry/app.ts:293`), while lifecycle calls `initTracing` (R3: AST `refs initTracing` at `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/entry/lifecycle.ts:32` and `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/entry/lifecycle.ts:164`).

Wire capture is intentionally injected by composition rather than self-wired at each backend; outcomes self-gate on the environment flag (R2: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:94` and `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:181`). The AST surface lens resolves `recordWireCapture` to entry composition and `recordTurnOutcome` to the chat engine (R3: command receipt in `commands.md`).

## Subsystem scorecards

Denominators are the 20 owned production files and their 18 owned test files; scores do not generalize to unowned entry/provider code.

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | - | - |
| Environment and deployment posture (4 source, 3 tests) | 4 | 3 | 4 | 3 | 3 | high | `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/env/index.ts:124`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/env/index.ts:429`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/env/index.ts:477`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/env/index.test.ts:185`; AST vLLM/lifecycle R3 receipts. |
| Core audit, request logging, middleware, tracing (7 source, 6 tests) | 4 | 3 | 4 | 3 | 4 | high | `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/audit.ts:48`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/middleware.ts:32`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/tracing.ts:232`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/audit.int.test.ts:16`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/middleware.test.ts:82`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/tracing.test.ts:44`. |
| Debug routes and database inspectors (7 source, 7 tests) | 4 | 3 | 4 | 3 | 4 | high | `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/routes.ts:206`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/routes.ts:229`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/debug/routes.test.ts:27`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/debug/inspect/config.int.test.ts:28`. |
| Wire capture and outcome recorder (2 source, 2 tests) | 3 | 3 | 3 | 2 | 2 | high | `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:100`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:181`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:220`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/debug/wire-capture.test.ts:23`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/debug/wire-capture.suite.test.ts:52`. |

## Findings

### SF-01 — wire-capture sink contract falsely says captures are never persisted

- Severity: P3
- Class: law-drift
- Confidence: high — the contradiction is in the same fully-read file and is directly executable.
- Evidence rung: R2 for the conflicting implementation; R4 for the ring behavior tests. Disk persistence itself lacks a direct integration assertion.
- Scope denominator: 1/20 owned production files and 2/18 owned test files concern wire capture; the full lane total is 38 files.
- Receipts: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:100` says captured bytes “never [are] persisted”; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:106` invokes `spill`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:220` defines the spill directory; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:224` sets its ceiling; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:230` starts the append operation; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:250` performs it. The file header correctly describes the spill at `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:49`. The owned ring test directly records provider bodies at `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/debug/wire-capture.test.ts:16`.
- Established fact: the function-level contract is false: every successfully serialized request capture is scheduled for best-effort disk append, even though the function documentation asserts process-ring-only retention.
- User or system impact: operators and maintainers relying on the exported function’s contract can underestimate local retention of raw provider request bodies while diagnosing a session. The implementation is documented accurately elsewhere, so this is a stale-law/legibility defect rather than evidence of unintended runtime behavior.
- What remains unverified: an owned test does not assert actual JSONL creation, rotation, or retention across a real filesystem; the test suite validates in-memory ordering/filtering and a forced outcome path instead.
- Suggested next check or fix: make the `recordWireCapture` documentation say it writes to the bounded in-memory ring and schedules best-effort JSONL spill; add one focused temporary-directory filesystem test only if disk retention is intended to be regression-protected.

## Proven strengths

- Environment parsing rejects invalid auth-mode combinations at startup and its current unit suite exercises failure cases, defaults, boolean coercion, and file-load behavior (R4: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/env/index.ts:429`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/env/index.test.ts:195`; 38 tests passed in the current receipt).
- The audit writer preserves primary request behavior on database failure while retaining failure-window telemetry; the current integration suite proves both a real libSQL write and the suppression path (R5: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/audit.ts:48`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/audit.ts:59`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/audit.int.test.ts:16`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/audit.int.test.ts:42`; current run passed 2/2).
- The inspector functions have current real-DB integration coverage rather than only mocked query tests (R5: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/inspect/config.ts:111`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/debug/inspect/config.int.test.ts:28`; current run passed 8/8).
- Debug authentication fails closed when neither verified admin access nor a matching token authorizes a request (R4: `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/routes.ts:206`; `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/routes.ts:220`; `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/foundation/observability/debug/routes.test.ts:27`; current run passed 13/13).

## Declared versus completed

| Surface | Strongest current evidence | Status |
| - | - | - |
| Frozen environment schema and auth preconditions | R4 — implementation plus 38 current unit tests | Completed in assigned scope. |
| Engine deployment environment floor | R3 — resolved provider call | Wired; provider runtime behavior is outside this lane. |
| Debug route registration | R3 — resolved entry-app registration | Wired; full application auth/path integration belongs to entry transport coverage. |
| Audit logging | R5 — current real-libSQL success and failure-path integration tests | Completed in assigned scope. |
| Inspector data functions | R5 — current real-libSQL integration tests | Completed at function boundary; host-route integration is outside scope. |
| Wire ring/outcome behavior | R4 — current meaningful unit/suite coverage | Implemented and tested at the recorder boundary; real disk spill and composition injection remain unproven here. |

## Tests and gates

The direct Vitest run passed all 18 assigned files and 142 assertions: 13 unit files and 5 integration files; there are no assigned contract, CT, e2e, parity, or type-test files. After the concurrent `env/index.ts` drift, its three focused unit files were rerun and passed 57/57 assertions. The integration tests use real in-memory libSQL for audit and inspector behavior, while unit tests cover environment parser failures, token/admin authorization branches, request-context hygiene, and trace/error handling (R5/R4 receipts listed above).

`pnpm check:tests-membership` passed over 1,858 test files / 4 type programs, and `pnpm check:tests-execution-membership` passed over 1,689 test files / 3 runner views. Those are membership proofs, not behavioral proof. The test-only AST lens found `resetAuditFailureCount` and `resetWireCaptures`; each is explicitly marked or documented as a reset seam, so no defect is claimed from the candidate result (R3: `commands.md`, `apisurface` output).

## Cross-lane edges

- Entry composition owns the decisive “do not inject a wire-capture sink when disabled” behavior. The foundation documents that contract at `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/foundation/observability/debug/wire-capture.ts:27`; AST resolves the consumer to `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/entry/compose/services.ts:56`, which this lane did not read. Entry/compose coverage should reconcile force-flag, environment, backend injection, and disk-retention expectations.
- The debug route registrar is structurally called by `/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/entry/app.ts:293` (AST R3), but this lane did not read or execute the application composition. The entry/debug-gate lane should retain responsibility for end-to-end host-only authentication and route exposure.
- `resetWireCaptures` is consumed by unowned `/home/inktomi/inktomi-stack/development/orbweaver/tests/server/entry/compose/rpg.int.test.ts:38` according to the AST surface result. Its test-only export is intentional in this lane, but entry-test ownership should decide whether the seam remains the smallest practical isolation mechanism.

## Tool receipts

`pnpm ast apisurface packages/server/src/foundation --max 200` scanned 4,903 workspace source files and classified 105 owned exports as 6 public, 97 internal, 2 test-only, and 0 unused. `orphans` and `prodonly` returned no candidates; these are retained as tool outputs only, not absence claims. Exact resolved call-path receipts covered environment→vLLM, environment→lifecycle/debug, debug routes→entry app, and tracing→lifecycle. The assigned corpus contains 38 `.ts` and zero `.tsx` files. No direct ast-grep was necessary, and no structural negative was used as a finding; full command output, durations, and exclusions are in `commands.md`.

## Lane verdict

All 38 assigned files were read and closing-byte-reconciled, with the one frozen-snapshot drift disclosed above; the narrow behavioral battery is green at 142/142. Environment validation, audit persistence/failure containment, and inspector queries have meaningful current proof in their assigned scope. Debug and tracing have resolved entry call paths, but end-to-end composition/auth remains correctly delegated to its owning lane. The one demonstrated defect is a wire-capture function contract that denies the disk retention its own implementation performs. The main remaining uncertainty is not a suspected behavior failure: it is whether the intentional JSONL spill needs an explicit real-filesystem regression test and a single unambiguous retention contract.
