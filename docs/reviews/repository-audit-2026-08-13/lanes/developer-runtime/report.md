# Developer runtime audit

## Lane identity

- Lane: `developer-runtime`
- Semantic scope: developer stack lifecycle, local vLLM fleet tooling, fixture/demo seeders, templates, and sandbox/oracle support scripts.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`
- Working-tree basis: current bytes; all 19 owned SHA-256 values match the frozen assignment.
- Assigned files read: 19 / 19 (100%).
- Assigned lines read: 4,764 / 4,764 current text lines (100%; frozen metadata says 4,765 because the Jinja file's final unterminated line was counted differently).
- Assigned bytes read: 230,853 / 230,853 (100%).
- Dirty assigned paths: 0 by SHA-256; one assignment line-count metadata discrepancy.
- Exclusions: server implementation, package manifests, non-tooling integration/e2e/CT suites, live GPU/vLLM processes, real production launch, and shared audit controls.

## Read receipt

`read-receipt.tsv` has one current line/byte/SHA-256 receipt for every `OWNED` row in `assignment.txt`; coverage is 100%. Four associated tooling tests were read and run, though no tests were assigned as owned rows.

## Architecture observed

`stack.sh` asks `stack-prod.ts classify` to parse every invocation before dispatch and exits before action when the parser refuses it (`scripts/dev/stack.sh:112-168`; R4 via `tests/tooling/stack-dispatch.int.test.ts:31-85`). Production mode checks identity and client-bundle state, then takes the importable filesystem spawn lock before detaching the server (`scripts/dev/stack-prod.ts:363-455`; R4 for its pure decisions and real-lock filesystem behavior).

The vLLM fleet has a separate shell front door, control script, and detached engine owner (`scripts/dev/engines.sh:82-194`, `scripts/dev/engines-ctl.ts:95-184`, `scripts/dev/engines.ts:224-316`). Its current boot-lock implementation is not equivalent to the corrected production spawn lock; DEVRT-01 is the material gap.

The demo seed core creates services through sanctioned composition and executes domain verbs rather than raw inserts (`scripts/seed/seed-demo.ts:269-310`, `scripts/seed/seed-demo.ts:321-411`). The current integration run proves fresh-db demo shapes, avatar FK resolution, two human seats, and embedded document chunks (`tests/tooling/seed-demo.int.test.ts:22-84`; R5).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Stack parser, prod lifecycle, and filesystem spawn lock (5 owned files) | 4 | 3 | 4 | 2 | 3 | high | `scripts/dev/stack.sh:112-168`; `scripts/dev/stack-prod.ts:363-455`; `tests/tooling/stack-mode.test.ts:35-344`; `tests/tooling/spawn-lock.int.test.ts:35-125`; current 56-test run. |
| vLLM fleet launcher/control/installation/templates (7 owned files) | 2 | 2 | 1 | 1 | 2 | high | `scripts/dev/engines.sh:82-194`; `scripts/dev/engines.ts:182-220`; DEVRT-01. |
| Multi-user and demo/heavy-chat seeders (4 owned files) | 4 | 3 | 4 | 2 | 3 | high | `scripts/dev/multi-user-seed.ts:84-151`; `scripts/seed/seed-demo.ts:269-411`; `tests/tooling/seed-demo.int.test.ts:22-84`; current run. |
| Oracle, sandbox, and model-template support (3 owned files) | 3 | 1 | 0 | 1 | 2 | medium | `scripts/dev/oracle-steady-clone.sh:1-238`; `scripts/dev/sandbox.sh:1-100`; assigned scope has no direct test row. |

## Findings

### DEVRT-01 — Empty vLLM boot lock is mistaken for a live PID 0

- Severity: P2
- Class: behavior-defect
- Confidence: high — JavaScript `Number("")` is `0`, and `process.kill(0, 0)` probes the caller's process group successfully; a real-filesystem analogue is explicitly covered for the corrected prod lock.
- Evidence rung: R2
- Scope denominator: 7 owned vLLM-fleet files; `scripts/dev/engines.ts` is the only detached-engine boot-lock owner in the assigned scope.
- Receipts: `scripts/dev/engines.ts:187-203` parses the existing lock directly with `Number(...trim())` and probes it; the validated fallback has one match with `scannedFileCount=1`. In contrast, `scripts/dev/_kit/spawn-lock.ts:63-79` delegates content classification to the nonzero-pid parser, and `tests/tooling/spawn-lock.int.test.ts:74-109` proves empty/whitespace locks are removed and retaken.
- Established fact: an interrupted engine launcher can leave an empty `engines.boot.lock`; the next launcher reads it as `0`, `process.kill(0, 0)` succeeds for its own group, logs another adopter, returns without booting, and leaves the lock in place.
- User or system impact: `pnpm engines:start` cannot recover a fleet after this crash shape without manual lock deletion; dependent local development will report a boot failure or unavailable vLLM roles.
- What remains unverified: a live GPU-backed reproduction was intentionally not run; the failure path needs a real-filesystem unit/integration test around the engine lock.
- Suggested next check or fix: replace the local boot-lock parsing with the existing `parseLockHolder`/`decideSpawnLock` discipline (or equivalent positive-integer validation), then add an isolated filesystem test for empty, whitespace, nonnumeric, live, and dead engine-lock holders.

### DEVRT-02 — Frozen assignment line denominator is off by one without byte drift

- Severity: P3
- Class: instrument-defect
- Confidence: high
- Evidence rung: R1
- Scope denominator: 19 assigned rows; one row has a line-count mismatch while all 19 SHA-256 hashes match.
- Receipts: `docs/reviews/repository-audit-2026-08-13/lanes/developer-runtime/assignment.txt:15` records 331 lines for `scripts/dev/qwen3_gen_thinking_serve.jinja`; `read-receipt.tsv:12` records its current 330 newline-terminated lines, identical 19,262 bytes, and identical SHA-256.
- Established fact: the assignment's aggregate line denominator is 4,765 while current `wc -l` is 4,764; this is an unterminated-final-line accounting defect, not source drift.
- User or system impact: a strict line-only coverage reconciliation would falsely label this fully read lane incomplete.
- What remains unverified: whether the assignment generator deliberately uses a non-`wc -l` line convention.
- Suggested next check or fix: make assignment generation and receipt generation use one documented line-count convention, or treat matching bytes and SHA-256 as authoritative for final-line-without-newline files.

## Proven strengths

- The production stack parses before dispatch, and the integration test proves malformed flags and prod+force combinations exit before touching ports (`scripts/dev/stack.sh:112-168`; `tests/tooling/stack-dispatch.int.test.ts:31-85`; R4).
- Production lock recovery treats empty and nonnumeric holders as stale and proves actual unlink/reacquisition on disk (`scripts/dev/_kit/spawn-lock.ts:63-89`; `tests/tooling/spawn-lock.int.test.ts:74-122`; R4).
- The demo seeder runs the real service graph and a current integration test proves seeded users, chats, human participants, avatar FK resolution, and embedded document chunks (`scripts/seed/seed-demo.ts:269-411`; `tests/tooling/seed-demo.int.test.ts:22-84`; R5).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| Mode-aware dev/prod stack and debug dispatch | R4: direct shell integration + pure decision tests | Implemented and directly tested; no live production-stack receipt in this lane. |
| Production filesystem spawn lock | R4: isolated real-filesystem test | Empty, whitespace, dead, and live-holder behavior covered. |
| Detached vLLM fleet adoption/boot lock | R2: source implementation | Declared and locally wired, but crash recovery is defective (DEVRT-01) and no direct fleet test exists. |
| Demo seed core | R5: fresh-db integration test | Implemented and currently integration-proven for declared demo shapes. |

## Tests and gates

The exact scoped command passed 4 files / 56 tests: 38 unit and 18 integration; it also reported no type errors. The stack dispatch test drives the real shell with its no-spawn probe; spawn-lock uses real temporary files; seed-demo uses a fresh DB and the real service composition. No assigned contract, CT, e2e, or live-runtime test exists. No gate positive control was run, so static enforcement is not credited as behavioral proof.

## Cross-lane edges

- The vLLM engine implementation and its normal unit suite are owned by the provider-runtime lane. That lane should add or require the engine-launcher lock regression test when DEVRT-01 is fixed.
- A GPU/live-probe owner must establish actual model boot, VRAM, and HTTP readiness; this lane deliberately did not launch or kill a fleet.
- The audit-control/manifest owner should reconcile DEVRT-02's line convention before synthesis uses strict line denominators.

## Tool receipts

`pnpm ast` was read and used before structural conclusions. It resolved the stack-mode test imports and `runFullSeed` integration caller. Its standalone-script export/import zeroes were not used for absence claims because the AST workspace does not enumerate script roots as a normal package scope. Direct `ast-grep` was used only for the one positive expression-level fallback; its one-file scan receipt and literal corroboration are in `commands.md`. No structural negative is reported.

## Lane verdict

All 19 assigned files were read and hash-reconciled; 4 associated tooling tests passed (56 tests).  
Stack dispatch, production lock recovery, and demo seeding have current R4/R5 evidence.  
The detached vLLM fleet launcher has a real crash-recovery defect: an empty boot lock wedges future starts (DEVRT-01).  
No current live production-stack or GPU/vLLM receipt was run, so operability above unit/integration behavior remains unproven.  
The only snapshot discrepancy is a one-line assignment-metadata count with matching source bytes and hashes.
