## Lane identity

- Lane: codemods
- Semantic scope: repository-native AST instrument, ts-morph codemod harness, help CLI, export-rot executor, and macro-block migration.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00`.
- Working-tree basis: current bytes; all six owned paths equal assignment hashes and had no source drift.
- Assigned files read: `6 / 6` owned; `9 / 9` shared records (14 unique paths total).
- Assigned lines read: `8,266 / 8,266` owned; `5,234 / 5,234` shared record-lines.
- Assigned bytes read: `405,834 / 405,834` owned; `318,852 / 318,852` shared record-bytes.
- Dirty assigned paths: 0.
- Exclusions: no production/test files outside the assignment were assessed; the three paired tooling tests were read and executed as verification only.

## Read receipt

`read-receipt.tsv` covers every assignment row at 100%, including the deliberately duplicated `scripts/codemods/ast.ts` owned/shared record. Its closing checksums equal the frozen assignment.

## Architecture observed

`package.json:18-19` exposes `ast.ts` and `codemod.ts` as `pnpm ast` and `pnpm codemod`; package scripts `check:respell` through `check:chains` invoke seven AST lenses (`package.json:52-57`). `codemod.ts` is a dispatch-only help surface into `codemod-kit.ts` (`scripts/codemods/codemod.ts:20-58`). The kit snapshots planned edits and refuses undeclared mutations before save (`scripts/codemods/codemod-kit.ts:431-489`, `569-618`); the integration suite imports it through resolved paths (R3, `commands.md`). `migrate-macro-blocks.ts` exports a pure parser-backed migration while retaining direct-execution I/O at `scripts/codemods/migrate-macro-blocks.ts:43-113` (R3/R4, test import and scoped suite).

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| AST instrument | 4 | 4 | 3 | 3 | 3 | high | Native usage plus package-gate registrations (`package.json:18`, `52-57`); 45 current lens tests (R4). |
| Codemod kit | 4 | 3 | 4 | 3 | 4 | high | Runtime mutation refusal (`codemod-kit.ts:474-489`), current 12-test integration suite (R5), and live CLI control. |
| Macro-block migration | 4 | 3 | 3 | 2 | 3 | high | Real grammar and conservative skip branches (`migrate-macro-blocks.ts:43-86`); six current behavior tests (R4). |
| Export-rot cleanup | 1 | 2 | 0 | 2 | 1 | high | Current default dry-run reaches the runner but aborts on its stale configuration (R5; CMD-01). |
| Codemod help CLI | 3 | 4 | 2 | 1 | 4 | high | Package-script dispatch and current `list imports` positive control (R5); no dedicated CLI regression test. |

## Findings

### `CMD-01` — export-rot cleanup is unusable because its disposition table is stale

- Severity: P2
- Class: behavior-defect
- Confidence: high — a current default dry-run reproduces the failure without modifying the tree; confidence would rise only by repairing the row and obtaining a complete reviewed preview.
- Evidence rung: R5
- Scope denominator: 32 configured `TAG_ROWS` in `scripts/codemods/export-rot-cleanup.ts`; execution reaches row 7 and stops before planning any mutation.
- Receipts: `scripts/codemods/export-rot-cleanup.ts:67` keeps `PersonaMetadataWrite`; its mandatory lookup aborts at `:559-564`. The current runner exited 1 in 13.1s (`commands.md`). The canonical disposition still calls it tagged (`docs/reviews/misc/2026-08-03-export-rot-dispositions.md:85`), while commit `d1150f519` records its deletion from `packages/contracts/src/persona/index.ts`.
- Established fact: the default, supposedly safe dry-run throws `CodemodError: tag row has no exported "PersonaMetadataWrite"`; `runCodemod` catches it before save (`scripts/codemods/codemod-kit.ts:588-594`), so no files were written.
- User or system impact: no operator can obtain the reviewed preview or apply this rot-cleanup runner until the stale disposition/configuration is reconciled.
- What remains unverified: rows after `PersonaMetadataWrite` were not reached, so this run cannot establish that it is the only stale entry.
- Suggested next check or fix: remove/reclassify the obsolete tag row and disposition entry, then rerun the default dry-run to completion and review every planned edit before any `--apply`.

## Proven strengths

- The kit refuses undeclared project mutations rather than emitting a preview that omits them (`scripts/codemods/codemod-kit.ts:474-489`); the current real-temp-tree integration suite passed all 12 tests, including direct mutation, late snapshot, move, rename, and delete paths (R5, `tests/tooling/codemod-kit.int.test.ts:115-309`; `commands.md`).
- The macro migration uses `parseMacros` and only removes `#` from known children-mode blocks, reporting unknown/content-argument blocks as skips (`scripts/codemods/migrate-macro-blocks.ts:43-86`); all six golden, idempotence, conservative-skip, and parser-fidelity tests passed (R4, `tests/tooling/migrate-macro-blocks.test.ts:37-80`; `commands.md`).
- The AST lens test corpus currently passes 45 unit tests spanning liveness identity, unwired, swallowed, type-only, columns, registries, chains, string aliases, client gaps, and API surface behavior (R4, `tests/tooling/ast-lens.test.ts:87-1259`; `commands.md`).

## Declared versus completed

| Declared surface | Strongest current evidence |
| - | - |
| `pnpm ast` CLI and seven registered check lenses | R3 package-script wiring, R4 focused lens tests; no all-lens live gate run in this lane. |
| Codemod toolkit preview/apply guard | R5 current integration fixture suite. |
| `pnpm codemod` help dispatcher | R5 current `list imports` execution. |
| Macro legacy-block migration | R4 current function behavior suite; direct CLI I/O was not separately exercised. |
| Export-rot reviewed executor | R5 current dry-run proves it is presently blocked, not complete. |

## Tests and gates

The scoped command passed 63 assertions: 51 unit and 12 integration, with no CT, e2e, type-test, or live-service coverage. `ast-lens.test.ts` tests pure in-memory lens behavior; the native bare CLI command establishes only availability/usage. The kit's integration test materially asserts no-write refusal and preview visibility. There is no direct regression test that executes `export-rot-cleanup.ts` against its checked-in disposition data, which allowed CMD-01 to survive the otherwise meaningful kit tests. Registered AST check scripts are evidence of enforcement wiring, not a positive-controlled enforcement result in this lane.

## Cross-lane edges

`CMD-01` crosses into the contracts lane only as a factual handoff: the cleanup runner's stale row names a persona-contract export deleted by commit `d1150f519`. The defect belongs to this codemod's table and its canonical disposition document; no conclusion is made about current persona-contract behavior.

## Tool receipts

`pnpm ast` was read and invoked before structural work. Resolution-aware importer lenses proved the kit/migration test edges; `ident PersonaMetadataWrite` returned no result but is not used as an absence verdict because its CLI does not disclose a scanned-file denominator. Exact scoped Vitest ran to completion. The only nonzero command was the actual export-rot dry-run; it has no command-specific report artifact, and the emitted `CodemodError`, disposition table, and deletion commit were inspected before classifying it.

## Lane verdict

All six owned files and every shared row were read against frozen snapshot `41e18afe` with zero drift. The AST tool, harness, and macro migration have current focused behavioral proof, including a real-temp-tree integration suite for preview integrity. The export-rot executor is not operational: its default no-write preview aborts on a configuration row made stale by a later deletion. The highest remaining uncertainty is whether additional export-rot rows are stale after row seven; the current failure prevents evaluating them.
