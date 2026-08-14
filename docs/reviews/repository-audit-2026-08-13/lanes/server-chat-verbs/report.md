# Server chat verbs and mirrored tests

## Lane identity

- Lane: `server-chat-verbs`
- Semantic scope: 20 `packages/server/src/domain/chat/verbs/*.ts` implementation files and 24 mirrored/cross-cutting `tests/server/domain/chat/verbs/*.int.test.ts` files.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`.
- Working-tree basis: current working-tree bytes; all 44 assigned paths match the assignment SHA-256 values and are not dirty.
- Assigned files read: 44 / 44 (100%).
- Assigned lines read: 22,384 / 22,384 (100%).
- Assigned bytes read: 1,206,827 / 1,206,827 (100%).
- Dirty assigned paths: 0.
- Exclusions: service/composition, transport, contracts, persistence, engine, and test harness support are outside this lane. They were only touched through bounded structural receipts where needed for reachability.

## Read receipt

`read-receipt.tsv` has 44 records and reconciles precisely to the assignment denominator (22,384 lines; 1,206,827 bytes). It is a working-tree receipt, not a claim about `HEAD` beyond the assigned snapshot hashes.

## Architecture observed

The verb files are factory bundles closing over `ChatContext` and explicit dependencies; for example, the lifecycle bundle publishes all 15 of its operations at `packages/server/src/domain/chat/verbs/chat-lifecycle.ts:387` (R2). The production composition root imports the primary bundles at `packages/server/src/domain/chat/service.ts:18-28` and creates the quiet/compaction, turn/request-turn, edit, fork, image, invites, read, start, lifecycle, and roster surfaces at `packages/server/src/domain/chat/service.ts:56-59` and `:128-152` (R3; composition source remains another lane's ownership).

The two special turn entry points are not export-only: `createTurn` exposes the human turn bundle at `packages/server/src/domain/chat/verbs/turn.ts:2428`, and `createRequestTurn` resolves the non-human request path at `:2366`; the repository-native callers lens finds production calls at `packages/server/src/domain/chat/service.ts:128-129` (R3). The resolution liveness lens examined all 20 implementation files: its positive control found 22 exports, its importer lens found 56 resolved imports, and the orphan/test-only lenses returned no candidates; the independent exact-name literal search covered 163 files / 2,509,014 bytes (R3 for the bounded "not unwired/test-only" assessment; scope excludes dynamic external invocation not expressible in this lane).

## Subsystem scorecards

| Subsystem (denominator) | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - | - |
| Chat verb factories + mirrored integration suite (20 implementation files; 24 test files) | 3 | 3 | 4 | 2 | 2 | high for the exercised scope | `chat-lifecycle.ts:104-112,387-405`; `compaction.ts:118-135,191-205`; `turn.ts:2366-2422,2428-2445`; `service.ts:56-59,128-152`; scoped Vitest 24/24 files, 540/540 tests |

The scores are independent and deliberately not averaged. Verification is 4 because two independent receipts establish boundary-focused integration coverage: the configured integration lane includes `.int.test.ts` at `vitest.config.ts:150-163`, and the current path-scoped run passed all 24 assigned test files / 540 tests. It is not 5: this lane produced no live-runtime/e2e receipt. Enforcement is 2 because the suffix/project selection is registered, but this audit did not positive-control a structural gate or establish that violations are impossible at an earlier tier. Operability is 2 because the exact bounded behavioral command is runnable and green, but production health, recovery, and observability belong outside the assigned files.

## Findings

No `behavior-defect`, `declared-not-wired`, `declared-not-tested`, `gate-blind-spot`, or `operability-gap` reached the evidence threshold within this assigned scope. This is a bounded clean result, not a repository-wide conclusion: the resolution lenses had nonzero positive controls (22 exports / 56 imports), the independent literal corroboration searched 163 files, and the direct behavioral command passed 540 assertions.

## Proven strengths

### server-chat-verbs-01 — integration-tested, composed verb surface

- Class: proven-strength
- Confidence: high
- Evidence rung: R4
- Scope denominator: 20 implementation files and 24 paired/cross-cutting integration files; 22 exported factories.
- Receipts: the lifecycle factory performs host authorization before a row mutation and fans both chat and chat-list events at `packages/server/src/domain/chat/verbs/chat-lifecycle.ts:104-112` (R2); compaction rejects an empty marker before any state write at `packages/server/src/domain/chat/verbs/compaction.ts:118-125` and its public lever requires host access at `:191-198` (R2); the integration command passed 24 files / 540 tests (R4).
- Established fact: the audited verb surface has meaningful current integration proof across lifecycle, compaction, edit, fork, read, roster, start, turn, invitation, image, resolver, and cross-cutting suite files.
- User or system impact: current regressions in those exercised behaviors fail a directly runnable behavioral lane.
- What remains unverified: live transport-to-client delivery, production provider behavior, and any contract/persistence behavior outside the assigned files.
- Suggested next check or fix: none in this lane; synthesis should reconcile the composition/transport and gate lanes.

## Declared versus completed

| Declared surface | Strongest current evidence | Basis |
| - | - | - |
| 22 exported factory functions in 20 files | R3 | `pnpm ast exports` found 22 declarations; `pnpm ast importers` found 56 resolved imports, including composition and paired tests. |
| `createTurn` / `createRequestTurn` | R3 | `packages/server/src/domain/chat/verbs/turn.ts:2366,2428`; callers at `packages/server/src/domain/chat/service.ts:128-129`. |
| Lifecycle/compaction critical failure paths | R4 | source guards at `chat-lifecycle.ts:104-112`, `compaction.ts:118-125,191-198`; the scoped integration run passed. |
| Entire paired verbs test path | R4 | `vitest.config.ts:150-163`; 24 files / 540 tests passed in the scoped integration command. |

## Tests and gates

Vitest routes `.int.test.ts` files to the integration project at `vitest.config.ts:150-163`; the test configuration also refuses a zero-match project at `vitest.config.ts:125` (R3 configuration evidence). The scoped behavioral execution covered all assigned test files: 24 passed, 540 tests passed, 0 failures, no snapshots updated (R4 command receipt). The suite contains both direct mirrors and `.suite.int.test.ts` cross-cutting properties, so the 24-test-file denominator is intentionally larger than the 20-source-file denominator.

Assertion quality was assessed from the complete test read and current behavioral run: the high-risk lifecycle, compaction, fork, read, roster, start, edit, and turn areas have substantive test counts (27, 14, 33, 109, 65, 34, 42, and 115 respectively in the current run). This is current integration evidence, not a coverage percentage or a claim that every branch has a test. No gate positive control was run; static gate effectiveness is therefore not credited above score 2.

## Cross-lane edges

- `packages/server/src/domain/chat/service.ts:56-59,128-152` is the production composition receipt, but its completeness and entry-level construction belong to `server-chat-assembly`.
- `packages/server/src/domain/chat/index.ts:121-143` exposes standalone factories for other domain/transport consumers; front-door/transport reachability belongs to the assembly and transport lanes.
- The integration runner configuration at `vitest.config.ts:150-175` is a verification-harness concern; this lane only established that the path-scoped integration execution selects and runs the assigned files.

## Tool receipts

`pnpm ast` was read and invoked bare before structural analysis. Export/importer lenses gave 22 exports and 56 resolved imports. Resolution-based orphan and test-only lenses completed with no candidates after 23.725 s and 38.307 s respectively; no timeout occurred. The literal exact-name cross-check had 163 searched files and is corroborative only. Full commands and timing are in `commands.md`.

## Lane verdict

All 44 assigned working-tree files were read and checksum-reconciled. The 20-source-file verb surface has 22 exported factories, production composition receipts, and no bounded orphan/test-only candidate. The direct integration path is green: 24 files, 540 tests. No defect met the audit threshold in this lane. The largest remaining uncertainty is outside scope: end-to-end transport/client reachability and positive-controlled gate enforcement.
