## Lane identity

- Lane: server-rpg
- Semantic scope: the server RPG domain, its state/flush/staging/chat-op/tool/persistence/verb paths, and 58 mirrored unit/integration tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: current bytes; all owned SHA-256 values match the assigned snapshot.
- Assigned files read: 133 / 133 (100%).
- Assigned lines read: 23,397 / 23,397 (100%).
- Assigned bytes read: 1,366,394 / 1,366,394 (100%).
- Dirty assigned paths: 0.
- Exclusions: no owned contract/type/CT/e2e files. Cross-lane composition/transport files were structurally traced but not evaluated as this lane's source.

## Read receipt

`read-receipt.tsv` covers every `OWNED` assignment row, with its exact snapshot line count, bytes, and SHA-256. Current-byte reconciliation matched all 133 hashes.

## Architecture observed

RPG uses the server domain template: contracts define the surface; verbs/persistence implement durable actions; chat ops bridge the chat turn lifecycle. The internal flush path is `createRpgChatOps` → `onTurnCompleted` → `flushTurn` [R3: `packages/server/src/domain/rpg/chat-ops/index.ts:95`; AST caller result]. The live-only event bus is consumed by the transport stream [R3: `packages/server/src/domain/rpg/bus.ts:44`; `packages/server/src/transport/trpc/stream/sources/rpg.ts:54`; AST caller result]. Production composition constructs both service and chat ops [R3: `packages/server/src/entry/compose/rpg.ts:1646`; AST caller result].

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Turn staging, flush, and cancellation | 4 | 4 | 4 | 3 | 3 | high | `chat-ops/flush.ts:270`, `chat-ops/index.ts:95`, `tests/server/domain/rpg/chat-ops/flush.int.test.ts:1`, integration run 26 tests |
| Live RPG event stream | 4 | 4 | 4 | 2 | 3 | high | `bus.ts:40`, `bus.ts:47`, transport caller `stream/sources/rpg.ts:54`, `bus.test.ts:1`, unit run 3 tests |
| Persistence and lineage/read models | 4 | 3 | 4 | 3 | 2 | medium | `persistence/journal.ts:24`, `persistence/snapshots.ts:1`, 7 persistence integration files / 47 tests |
| Verbs, authority, and host/member surfaces | 4 | 3 | 4 | 3 | 2 | medium | `contract/service.ts:783`, `guard.ts:1`, `authority.suite.int.test.ts:1`, 16 passing authority tests |
| State substrate and tool application | 4 | 3 | 4 | 3 | 2 | medium | `substrate/merge.ts:1`, `tools/apply.ts:1`, `substrate/merge.test.ts:1`, `tools/apply.test.ts:1` |

Scores are independent and scoped only to these 133 files. Enforcement and operability are below 4 because this lane did not own/run a gate positive control or a full composed live-runtime path.

## Findings

No defect finding met the audit threshold in the owned scope. In particular, no absence claim is made: the structural instrument's 30s chained-lens interruption and Vitest's unsupported `--list` option are logged as tool limitations, not clean results.

## Proven strengths

### server-rpg-01 — Flush has a concrete lifecycle/cancellation seam

- Class: proven-strength
- Confidence: high
- Evidence rung: R4
- Scope denominator: 1 flush implementation plus `flush.int.test.ts` (26 behavioral tests).
- Receipts: `packages/server/src/domain/rpg/chat-ops/flush.ts:270` refuses a readonly round before durable writing; `packages/server/src/domain/rpg/chat-ops/flush.ts:301` records folded calls before a staged-noop return; `tests/server/domain/rpg/chat-ops/flush.int.test.ts:1`; scoped integration run passed 26 tests.
- Established fact: state-round staging, cancellation, write-boundary dropping, and post-write event emission are implemented together and exercised by the mirrored integration suite.
- User or system impact: reduces stale-state and cancelled-round corruption risk.
- What remains unverified: production chat/transport assembly and operational logging are owned by other lanes.
- Suggested next check or fix: cross-lane reconciliation with entry composition and transport stream audit.

### server-rpg-02 — The live event bus is composed and behaviorally tested

- Class: proven-strength
- Confidence: high
- Evidence rung: R4
- Scope denominator: bus implementation and its mirrored unit test.
- Receipts: `packages/server/src/domain/rpg/bus.ts:40` publishes per-chat events; `packages/server/src/domain/rpg/bus.ts:47` attaches abortable subscribers; AST resolves a transport consumer at `packages/server/src/transport/trpc/stream/sources/rpg.ts:54`; `tests/server/domain/rpg/bus.test.ts:1`; unit run passed 3 tests.
- Established fact: the domain's live-only bus is not a dead export and is directly exercised for its event-stream behavior.
- User or system impact: clients can receive post-write invalidation signals without a durable event log.
- What remains unverified: end-to-end client reconnect/invalidation behavior is outside the owned files.
- Suggested next check or fix: reconcile with the stream and client lane.

## Declared versus completed

The service surface is declared in `packages/server/src/domain/rpg/contract/service.ts:788` and backed by grouped verbs, persistence modules, and chat ops [R2/R3]. The direct composition caller for `createRpgService` is `packages/server/src/entry/compose/rpg.ts` [R3; AST result]. Mirrored behavioral suites executed 14 unit files and 44 integration files successfully [R4]. This lane did not establish a current R5 end-to-end or live-runtime proof.

## Tests and gates

The executed suite contains 58 owned files: 14 unit / 44 integration / 0 contract / 0 type / 0 CT / 0 e2e, with 592 assertions total. The integration run exercised real in-memory persistence and includes authority, field-reachability, swipe-consistency, hand-edit-vs-flush, persistence, verb, and chat-op suites. Vitest's `requireAssertions` is configured globally in `vitest.config.ts:121`, but configuration is not a substitute for reviewing assertion quality. The exact current runs were green; no gate positive control was performed in this lane.

## Cross-lane edges

- Entry composition: AST resolves `createRpgService` and `createRpgChatOps` to `packages/server/src/entry/compose/rpg.ts`; the entry/composition lane should establish its runtime/operability evidence.
- Transport stream: `subscribeRpgEvents` is consumed at `packages/server/src/transport/trpc/stream/sources/rpg.ts:54`; the transport lane owns subscription authorization and reconnect semantics.
- Portability: import/export contract callers appear in the structural importer result; the import/export lane owns cross-domain serialization completeness.

## Tool receipts

See `commands.md`. `pnpm ast` was read and run bare; completed caller/importer lenses established positive reachability. The one outer 30s chained command and Vitest `--list` rejection are recorded and were excluded from conclusions. No structural negative is reported.

## Lane verdict

The owned RPG domain has a broad, directly composed source surface and a current green behavioral suite: 14 unit files / 216 tests and 44 integration files / 376 tests. Flush lifecycle/cancellation and the event bus reached R4 evidence in this lane. The audit did not establish a live-runtime R5 result, gate positive controls, or client reconnect behavior; those remain cross-lane/operability work rather than defects in this source-only conclusion.
