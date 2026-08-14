## Lane identity

- Lane: `server-chat-assembly`
- Semantic scope: `packages/server/src/domain/chat/{assembly,contract,engine}/**` and their assigned central-tree tests only.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: current working-tree bytes; all 71 owned paths matched the assigned source/test hashes. The shared `README.md` alone changed after assignment (see `commands.md`).
- Assigned files read: 71 / 71 (100%).
- Assigned lines read: 23,887 / 23,887 (100%).
- Assigned bytes read: 1,294,845 / 1,294,845 (100%).
- Dirty assigned paths: 0.
- Exclusions: chat feature roots, substrate/persistence/verbs, composition-root/transport files, other domains, browser tests, and live runtime are outside this lane.

## Read receipt

`read-receipt.tsv` covers every OWNED row in `assignment.txt`: 71 files, 23,887 lines, and 1,294,845 bytes, all SHA-256-identical to the snapshot. The shared protocol README drift was re-read and is recorded separately in `commands.md`; it does not affect an owned row.

## Architecture observed

The assembly subsystem builds static/dynamic system halves plus after-history injections through `assemblePrompt` and `assemblePromptWithSlices` (`packages/server/src/domain/chat/assembly/assemble.ts:775`, `:785`, R2). The resolved production caller is the chat substrate’s access seam (`packages/server/src/domain/chat/substrate/assembly-access.ts:35`, AST callers, R3); gathering feeds the assembly context through `buildAssembleContext` (`packages/server/src/domain/chat/assembly/context.ts:791`, `packages/server/src/domain/chat/substrate/assemble-gather.ts:22`, AST callers, R3).

The engine’s pipeline explicitly runs BUILD → SHAPE → FIT → REQUEST → REDUCE (`packages/server/src/domain/chat/engine/pipeline.ts:420`, R2); its resolved caller is `engine.ts` (AST `callers runTurnPipeline`, 123 calls / 3 files, R3). `createChatService` composes `createTurnEngine` with injected policy, budget, memory, and compaction operations (`packages/server/src/domain/chat/service.ts:61`, R3), while the turn engine owns its public factory (`packages/server/src/domain/chat/engine/engine.ts:1604`, R2). The pipeline has an explicit narrow prose-less terminal-tool recovery seam (`packages/server/src/domain/chat/engine/recover-narrative.ts:75`, R2), called by the engine at `packages/server/src/domain/chat/engine/engine.ts:1305` (R3).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Prompt assembly and context (15 source + 16 mirrored test files) | 4 | 4 | 4 | 3 | 3 | high | `assemble.ts:775`; AST resolved production callers; `context.int.test.ts:1109`, `:1192`, `:1212`; current 29-file run. |
| Turn engine and pipeline (10 source + 12 mirrored test files) | 4 | 4 | 4 | 3 | 3 | high | `pipeline.ts:420`; `service.ts:61`; `engine.ts:1305`, `:1604`; `engine.int.test.ts:754`, `:1268`, `:1710`; current run. |
| Chat-local contracts (17 source + 1 mirrored contract test file) | 3 | 3 | 3 | 3 | 2 | medium | Contract declarations are consumed by engine/assembly imports (AST apisurface); `metadata.contract.test.ts` passed (15 assertions) in current run. The single assigned contract test does not prove every contract shape. |

Scores are independent and scoped to the denominators stated. A 4 reflects independently observed implementation/wiring plus current integration assertions; no score claims end-to-end deployed behavior or a proven enforcement positive control.

## Findings

### SCA-02 — No current positive control establishes the enforcement score above structural rules

- Severity: P3
- Class: gate-blind-spot
- Confidence: high.
- Evidence rung: R0 for a positive-control result.
- Scope denominator: 71 owned files; enforcement mechanisms outside the owned source/test set were not modified or probed.
- Receipts: `docs/architecture/core/Core-0-Architecture-and-Structure.md:9` establishes the gate-based structure; `vitest.config.ts:121` requires assertions; `commands.md` records no deliberate violation and no gate probe.
- Established fact: this lane observed the declared enforcement design and passing behavioral suite, but did not reproduce a violation that proves a relevant gate rejects it.
- User or system impact: enforcement is scored 3 rather than 4–5; no defect in current chat behavior is established.
- What remains unverified: which gate catches a future assembly/engine boundary or contract-layout violation, and whether that gate is registered in the current full gate run.
- Suggested next check or fix: the tooling/gates owner can run a disposable, isolated positive control for the relevant structural rule.

## Proven strengths

- Assembly-to-engine turn lifecycle has R5 composed behavioral proof across 29 assigned test files / 748 tests: `packages/server/src/domain/chat/assembly/assemble.ts:775`; `packages/server/src/domain/chat/service.ts:61`; `packages/server/src/domain/chat/engine/pipeline.ts:420`; `tests/server/domain/chat/assembly/context.int.test.ts:1192`; `tests/server/domain/chat/engine/engine.int.test.ts:754`, `:1268`, `:1710`; direct Vitest receipt in `commands.md`.
- R5: Current direct Vitest execution passed every assigned test file (29 files / 748 tests), including real-libSQL lifecycle tests (`commands.md`).
- R5: Recovery of a terminal-tool, prose-less first pass commits recovered prose and constrains recovery to one tool-less pass (`tests/server/domain/chat/engine/engine.int.test.ts:1710`, `:1749`, `:1767`).
- R5: Context integration distinguishes `at_depth` from `in_prompt` and asserts the no-double-emit invariant through `assemblePrompt` (`tests/server/domain/chat/assembly/context.int.test.ts:1109`, `:1192`, `:1212`).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| `assemblePrompt` / slices | R5: production access-seam call plus unit/integration tests | wired and currently tested |
| `buildAssembleContext` | R5: production gather call plus integration assertions | wired and currently tested |
| `runTurnPipeline` / `createTurnEngine` | R5: service composition, engine integration and direct current run | wired and currently tested |
| `resolveTurnNarrative` | R5: engine call plus recovery integration assertions | wired and currently tested |
| Contract-only declarations | R3: resolved consumers; R5 for metadata contract test only | consumed; broad schema proof remains limited to assigned test surface |

## Tests and gates

The suite contains meaningful state/error assertions rather than only existence checks: generation error rethrow plus lock release (`tests/server/domain/chat/engine/engine.int.test.ts:754`), refusal on exhausted budget/consent/held lock (`:780`, `:807`), heartbeat and stolen-lock behavior (`:1268`, `:1295`), and recovery/no-recovery boundaries (`:1710`, `:1767`, `:1780`) are concrete R4 assertions. The direct run supplied R5 for the 29 assigned files. The config requires `requireAssertions` (`vitest.config.ts:121`) and identifies node project categories (`vitest.config.ts:140`), but no static/full gate or positive-control run is evidence in this lane.

## Cross-lane edges

- Entry composition and chat substrate access are outside scope but are the production edges resolved by AST; their owners should reconcile transport-to-service reachability (`packages/server/src/domain/chat/service.ts:61`, `packages/server/src/domain/chat/substrate/assembly-access.ts:35`).
- Provider wire behavior, deployed recovery observability, and browser presentation are not evidenced here; reconcile with provider/transport/e2e owners.

## Tool receipts

`pnpm ast apisurface packages/server/src/domain/chat --max 300` completed in 35.090s with 4,903 source files scanned; all other structural and behavioral commands, exact counts, exclusions, and the one failed filter attempt are in `commands.md`. No structural negative claim in this report relies on the failed `flow chat/engine` query or on literal search.

## Lane verdict

The assigned assembly, contract, and engine paths are fully read and snapshot-identical. Assembly context reaches a production access seam; chat service composes the engine; and pipeline/recovery wiring is resolved by the repository-native structural lens. Current scoped behavior passes 29 files / 748 tests, including integration assertions for errors, lock lifecycle, placement, and recovery. No behavioral defect was established in the owned scope. The largest uncertainty is beyond scope: deployed provider/transport/browser behavior and a current enforcement positive control were not proven.
