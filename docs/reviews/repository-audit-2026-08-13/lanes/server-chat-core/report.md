## Lane identity

- Lane: `server-chat-core`
- Semantic scope: chat memory, durable canon/import/persistence, bus, direct chat composition, seeder, local substrate, and their 53 owned mirrored/suite/parity tests.
- Snapshot commit: `e777c47e5860a105c114e061dcf98bcab1baa952`
- Working-tree basis: current bytes; all 110 owned paths equal the assignment SHA-256. No owned path is dirty.
- Assigned files read: 110 / 110 (100%).
- Assigned lines read: 20,737 / 20,737 (100%).
- Assigned bytes read: 1,049,126 / 1,049,126 (100%).
- Dirty assigned paths: 0.
- Exclusions: non-owned chat `engine/`, `verbs/`, `contract/`, entry/transport callers, DB/schema, search/embeddings implementation, gates, and test support outside the assigned list. Cross-lane receipts below name the reached seams without claiming their implementation.

## Read receipt

`read-receipt.tsv` covers every `OWNED` assignment path, with manifest line/byte/SHA-256 values verified against current bytes. Coverage is 100%, so analysis proceeded.

## Architecture observed

The chat front door is the only external surface: 29 importer references in 22 non-owned entry/transport/domain files were found by `pnpm ast importers '#domain/chat'`; this establishes import reach (R3), not behavior beyond the owned boundary. `createChatService` assembles its own engine, memory collaborators, verbs and internal participant-view read at [service.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/service.ts:53), with the memory build/recall functions passed into the engine at [service.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/service.ts:61). `pnpm ast callers createChatService` found its sole server composition call at `packages/server/src/entry/compose/chat.ts:1225` (R3).

Memory owns policy and non-vector facets: it reads selected canon rows, projects hidden content before digesting, and excludes prompt-hidden/non-ingestible rows at [memory/persistence/queries.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/memory/persistence/queries.ts:66). It delegates vector writes via `ctx.embeddingsStore` and vector search via `ctx.searchDigests`; the local build prunes disappeared blocks before reading extant hashes at [digests.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/memory/build/digests.ts:168), and recall applies witness/live-window guards before mode dispatch at [recall.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/memory/recall/recall.ts:94). Callers of `generateDigests` are in non-owned `engine/engine.ts:1392,1404`, and callers of `recallMemory` are `engine/engine.ts:1161` and owned `substrate/assemble-gather.ts:225` (R3).

The bus commits the stamped event before placing it in the in-process ring and converts failed durable writes to a classified `null` result at [bus.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/bus.ts:90). `pnpm ast callers createChatBus` found its composition call at non-owned `entry/compose/services.ts:410` (R3). Bulk import is composed by non-owned `entry/compose/world-info.ts:84` (R3); its owned tests exercise actual libSQL writes.

## Subsystem scorecards

| Subsystem | Implementation | Wiring | Verification | Enforcement | Operability | Confidence | Receipts |
| - | -: | -: | -: | -: | - | - |
| Direct chat composition and in-process bus (7 source / 13 tests) | 4 | 4 | 4 | 2 | 4 | high | `service.ts:53,61,154`; `bus.ts:90`; AST caller receipts; `service.int.test.ts:165`; `bus.int.test.ts:145`; current integration run (27 files / 285 tests) |
| Memory build, persistence boundary, and recall (15 source / 14 tests) | 4 | 4 | 4 | 2 | 4 | high | `digests.ts:148,176,221`; `recall.ts:37,94`; `memory/persistence/queries.ts:66`; AST caller receipts; `digests.int.test.ts:95,117,185`; current unit/integration runs |
| Canon, imports, roster/locks/events and seeding (12 source / 10 tests) | 4 | 3 | 4 | 2 | 4 | high | `persistence/import-write.ts:500` (full-read basis); `persistence/canon-write.ts` (full-read basis); `persistence/import-write.int.test.ts:136`; `persistence/canon-write.int.test.ts:1`; current integration run |
| Local chat substrate, including authorization/visibility (23 source / 16 tests) | 4 | 3 | 4 | 2 | 4 | high | `substrate/member-visibility.ts` (full-read basis); `substrate/auth/clamp.ts` (full-read basis); membership test listing; current unit run 23 files / 178 tests and integration run |

Scores do not generalize to the excluded engine, verbs, contracts, entry/transport, search/embeddings, or gates. Enforcement is 2 rather than 3+ because architecture law declares applicable structural gates, but this lane did not run their owning whole-tree gate suite or a positive-control violation.

## Findings

No defect, unwired surface, or test-quality finding met the required evidence burden inside this lane. The zero-result `orphans` and `prodonly` lenses are narrow resolution-based receipts recorded in `commands.md`; they are not a repo-global clean bill of health.

## Proven strengths

- **Durable-first event delivery and safe delete-race degradation (R4).** `emit` writes before fan-out and returns `null` rather than rejecting on a failed append at [bus.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/bus.ts:90). The real-DB integration test asserts the deleted-chat FK failure is absorbed, no ring entry is added, and a live-chat fault logs while remaining non-throwing at [bus.int.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/server/domain/chat/bus.int.test.ts:145). Current integration execution passed 27 files / 285 tests (R5 for this scoped command).
- **Memory avoids re-surfacing excluded canon and removes vanished digest ranges (R4).** Canon ingestion filters `excludedFromPrompt`, allowed kinds, and summary-projects content at [memory/persistence/queries.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/memory/persistence/queries.ts:66); plan generation prunes ceilings before reading existing rows at [digests.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/memory/build/digests.ts:168). Current integration membership includes named assertions for hidden content and prune/self-heal behavior; the complete owned integration set passed (R5 scoped).
- **Composition crosses a real turn boundary (R4).** The service binds the engine and all verb bundles at [service.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/service.ts:61) and returns the assembled service at [service.ts](/home/inktomi/inktomi-stack/development/orbweaver/packages/server/src/domain/chat/service.ts:154). The integration test runs a scripted solo send against `freshDb`, asserting committed output plus start/complete events at [service.int.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/server/domain/chat/service.int.test.ts:165); the entry composition caller is structurally verified (R3).

## Declared versus completed

| Declared surface | Strongest evidence | Status |
| - | - | - |
| `ChatService` composition and non-principal `requestTurn` | R4: `service.ts:53` assembly, entry caller, `service.int.test.ts:165`, current integration execution | Live, tested at the owned boundary |
| Memory digest build / prune / recall | R4: `digests.ts:148`, `recall.ts:37`, callers in engine, unit/integration suites | Live, tested at the owned boundary |
| Durable chat event bus | R4: `bus.ts:90`, entry composition caller, `bus.int.test.ts:145` | Live, tested at the owned boundary |
| Bulk import and canonical persistence | R4: owned persistence writes plus real-DB mirrors; composition caller for import | Live, tested at the owned boundary |
| Test-only exports reported by the AST lens | R2 only for the 10 exports; all were inspected in source/tests | Not treated as dead/unwired: lens reports test seam reach, not a production requirement |

## Tests and gates

Vitest config declares the unit, integration, integration-serial and parity lanes at [vitest.config.ts](/home/inktomi/inktomi-stack/development/orbweaver/vitest.config.ts:1) (inspection only; config is outside owned code). Correct installed membership command was `vitest list`, after an invalid `--list` attempt documented in `commands.md`. Direct execution produced 178 passing unit assertions in 23 files, 285 passing integration assertions in 27 files, and 18 passing/1 skipped parity assertions in 1 file. The parity oracle is intentionally limited to historical pipeline shape, not memory semantics; memory retains direct behavioral integration coverage.

The current tests have meaningful boundaries and negative controls: examples include deleted-card/member fallback assertions [service.int.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/server/domain/chat/service.int.test.ts:201), summarizer batching/options assertions [digests.int.test.ts](/home/inktomi/inktomi-stack/development/orbweaver/tests/server/domain/chat/memory/build/digests.int.test.ts:142), and durable-append fault handling in the bus suite. No static/gate result is presented as behavioral proof. Whole-tree gate execution and its positive controls remain out of this lane's scope.

## Cross-lane edges

- Entry composition is the actual caller for `createChatService`, `createChatBus`, and the import operation (`entry/compose/chat.ts:1225`, `entry/compose/services.ts:410`, `entry/compose/world-info.ts:84`). The `server-chat-assembly` lane owns whether those dependencies are correctly constructed.
- The chat engine calls memory build/recall (`engine/engine.ts:1161,1392,1404`) but is not owned here; `server-chat-verbs`/engine-owning reconciliation should assess turn lifecycle and failure propagation.
- `ctx.embeddingsStore`, `ctx.embeddingsPruneBlocks`, and `ctx.searchDigests` are intentionally injected boundaries; their adapters and vector-store correctness are outside this lane.

## Tool receipts

`pnpm ast` was used for import/caller/liveness questions; exact command outputs, elapsed times, known blind spots, literal cross-check, and the one host-time-limited lens are in `commands.md`. No direct `ast-grep` fallback was used. `orphans` and `prodonly` returned no assigned-scope results; `typeonly-alive` did not finish under the execution host's 30-second ceiling and is explicitly not a negative claim.

## Lane verdict

All 110 assigned files match the audit snapshot and were read.
The chat core has demonstrated entry/transport import reach, a real service composition call, real-DB persistence/bus/memory tests, and a current direct execution receipt for all 51 runnable owned tests plus the parity file.
No lane-local defect met the evidence threshold.
The largest remaining uncertainty is excluded code: engine/verb/entry/transport behavior and the injected search/embeddings adapters, plus the timed-out `typeonly-alive` AST lens.
No repo-global conclusion follows from this scoped result.
