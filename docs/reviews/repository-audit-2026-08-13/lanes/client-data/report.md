## Lane identity

- Lane: `client-data`
- Semantic scope: client data/query layer, HTTP adapters, bus adapter/reducer/registry, and the assignment's mirrored unit and Playwright-CT tests.
- Snapshot commit: `41e18afe74afa570b67a3e670a1a38863c486a00` (assignment); examined working-tree commit `786503e783a618474dd926bd8381ba398e29ce1f`.
- Working-tree basis: all 84 owned SHA-256 values equal the frozen assignment values.
- Assigned files read: 84 / 84 (100%).
- Assigned lines read: 8,284 / 8,284 (100%).
- Assigned bytes read: 428,124 / 428,124 (100%).
- Dirty assigned paths: 0.
- Exclusions: none; the nine listed shared prerequisites were read as prerequisites but are not owned analysis surfaces.

## Read receipt

`read-receipt.tsv` contains every OWNED row from `assignment.txt` and byte-for-byte reconciles with it (84 paths, 8,284 lines, 428,124 bytes).

## Architecture observed

The data package is the client-facing adapter seam: browser HTTP reads/writes sit in `auth-bootstrap.ts:29-97`, `auth-config.ts:54-112`, and the import/upload adapters; tRPC proxy construction is centralized in `trpc.ts:34-94`. Query cache lifecycle and bus-driven freshness converge at `invalidation.ts:24-390`, while the stream path is split into the pure exhaustive reducer at `bus/apply-chat-bus-event.ts:27-103`, the monotonic sequence guard at `bus/chat-event-seq-guard.ts:57-88`, and the one-socket room registry at `bus/room-registry.ts:159-334`. The assigned tests mirror these boundaries, including focused unit tests for reducers/registry and CT stories in `tests/client/data/_ct-stories.tsx:1-770`.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | -: | - |
| Chat bus reducer, dedupe, and room registry (6 source / 3 unit-test files) | 4 | 4 | 4 | 3 | 3 | high | `apply-chat-bus-event.ts:27-103`; `chat-event-seq-guard.ts:57-88`; `room-registry.ts:159-334`; assigned unit run (58 assertions across the three mirrors, R4). |
| Query invalidation and entity-mutation seam (3 source / 2 assigned test files) | 4 | 3 | 4 | 2 | 3 | high | `create-entity-mutation.ts:111-180`; `invalidation.ts:347-390`; `tests/client/data/invalidation.test.ts:1-478`; current unit run, R4. |
| Auth/import/upload HTTP adapters (9 source / 9 unit-test files) | 3 | 3 | 4 | 2 | 3 | high | `auth-bootstrap.ts:37-97`; `auth-config.ts:54-112`; `import-tree.ts:28-51`; `upload-document.ts:36-62`; current unit run, R4. |
| Browser-hook and display-state surfaces (16 source / 19 CT files) | 3 | 3 | 5 | 2 | 3 | high | current exact-scope CT receipt: 19 files, 73/73 passed, zero failed/flaky/skipped. |

## Findings

No product or instrument defect is established in this lane. The earlier missing-terminal limitation was resolved by the coordinator's exact 19-file rerun, which passed 73/73 and produced a canonical report naming precisely the assigned CT files.

## Proven strengths

- `CLIENT-DATA-S01` — The chat reducer dispatches each `ChatBusEvent` arm explicitly and ends in `assertNever`, while the sequence guard isolates durable re-delivery from attach-synthesized events (`bus/apply-chat-bus-event.ts:27-103`; `bus/chat-event-seq-guard.ts:31-88`). The current mirrored unit tests passed (R4).
- `CLIENT-DATA-S02` — The room registry handles delayed transport binding, replay-value dedupe, retry, grace-period retirement, reconnect fan-out, and room-scoped errors (`bus/room-registry.ts:159-334`); its current focused unit suite passed (R4).
- `CLIENT-DATA-S03` — Entity mutations make optimistic rollback, authoritative echo writes, refusal-as-data, and terminal invalidation part of the one factory (`create-entity-mutation.ts:111-180`); the current assigned CT scope passed 73/73 (R5).

## Declared versus completed

`pnpm ast exports packages/client/src/data --max 200` reports 96 exported symbols in 43 source files (R2 declaration inventory only). The three major pathways above additionally have unit evidence (R4). No unresolved-export or dead-code conclusion is made: the liveness lens completion stream was unavailable and no clean structural negative met the denominator-plus-literal-cross-check rule.

## Tests and gates

The focused node command passed 18 assigned unit files / 118 assertions. Those tests exercise non-happy-path behavior in the bus and HTTP adapters (e.g. rejection, duplicate/replay, retry, rollback) rather than only existence. The current exact 19-file CT command passed 73/73 with zero failures, flakes, or skips (R5). No owned gate implementation is in scope; the observed exhaustiveness relies on TypeScript's `never` dispatch in `bus/apply-chat-bus-event.ts:101-102` (R3 enforcement), not a newly reproduced positive-control gate receipt.

## Cross-lane edges

- The client shell/features lanes own the composition-root consumers of the data exports. This lane proves local adapter and test behavior but does not claim end-to-end feature reachability.
- Server transport/stream lanes own the wire contract referenced by the room registry and chat sequence comments; their current integration/e2e receipts are needed for an R5 end-to-end stream verdict.

## Tool receipts

`pnpm ast` bare was read and used. `exports` gave a 43-file / 96-symbol declaration inventory. `cycles` printed no results but no denominator, and liveness commands lacked retained completion output, so neither supports an absence claim. See `commands.md` for exact commands, the initial CT runner limitation, and its superseding exact-scope correction.

## Lane verdict

All 84 owned files reconcile to the assignment snapshot and were read. The focused node suite is current and green: 18 files, 118 assertions. The data layer has strong R4 evidence for bus, cache-invalidation, and HTTP adapter behavior, plus current R5 browser proof across all 19 assigned CT files (73/73). No product or instrument defect is established in the owned scope.
