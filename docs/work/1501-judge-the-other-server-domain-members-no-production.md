---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
---

# Judge the other server domain members no production code calls

## What

`pnpm unwired` reports each member below with no production reference; `reports/unwired/unwired.json` holds the run. Apply the decision on each row.

A delete is checked by the compiler: if a composition site still needs the member structurally, `pnpm typecheck` refuses the delete and the member is linked instead. Paths are under `packages/`.

| Member | At | Scan | Decision |
| - | - | - | - |
| `AssetsService.rebuildFromTree` | `server/src/domain/assets/contract/service.ts:109` | builder-only | wire: the asset tree rebuild the maintenance contract describes needs an admin maintenance caller |
| `WorkloadServiceContext.isOwner` | `server/src/domain/workloads/contract/service.ts:47` | builder-only | wire: `domain/workloads/substrate/authorize.ts:83` calls it through a seams slot; derive that slot from this member so a reference links them |
| `AutomationService.listGlobalVariables` | `server/src/domain/automation/contract/service.ts:138` | builder-only | delete with its implementation |
| `CharacterService.findByImportedFrom` | `server/src/domain/character/contract/service.ts:155` | builder-only | wire: its doc names the hub search page's already-imported markers as the caller |
| `ConnectionService.availability` | `server/src/domain/connection/contract/service.ts:110` | test-only | wire: `domain/embeddings/indexer/caption.ts:105` takes `availability` from its sinks; derive that slot from this member so a reference links them |
| `ConnectionService.getBoundConnection` | `server/src/domain/connection/contract/service.ts:128` | builder-only | wire: `domain/chat/verbs/runtime-inference.ts:95` calls it through chat's connection deps; derive that slot from this member so a reference links them |
| `ConnectionService.registerProvider` | `server/src/domain/connection/contract/service.ts:149` | builder-only | delete with its implementation |
| `ConnectionService.dropProvider` | `server/src/domain/connection/contract/service.ts:150` | builder-only | delete with its implementation |
| `CredentialsService.markRevoked` | `server/src/domain/credentials/contract/service.ts:82` | builder-only | delete with its implementation and the 8 test files that name it |
| `DatabankPortabilityContext.enqueueIngest` | `server/src/domain/databank/contract/portability.ts:30` | unreferenced | wire: `domain/databank/substrate/queue-ingest.ts:31` calls it through its own ctx; derive that slot from this member so a reference links them |
| `DiscoveryService.backfillDigestStoryTime` | `server/src/domain/discovery/contract/service.ts:263` | builder-only | wire: a discovery workload contribution that runs the backfill |
| `DiscoveryService.computeDigestHubScores` | `server/src/domain/discovery/contract/service.ts:318` | builder-only | wire: the hub-score verbs need a workload or procedure caller |
| `DiscoveryService.computeSegmentHubScores` | `server/src/domain/discovery/contract/service.ts:320` | builder-only | wire: with `computeDigestHubScores` |
| `DiscoveryService.computeImageHubScores` | `server/src/domain/discovery/contract/service.ts:323` | builder-only | wire: with `computeDigestHubScores` |
| `RegexService.getScript` | `server/src/domain/regex/contract/service.ts:103` | test-only | wire: the regex router's script read, which re-implements the gate today |
| `RpgStagingStore.peek` | `server/src/domain/rpg/contract/service.ts:215` | builder-only | delete with its implementation and the 7 test files that name it |
| `RpgRoundsChatOps.resolveHostUserId` | `server/src/domain/rpg/contract/rounds.ts:37` | unreferenced | wire: `entry/compose/rpg.ts:129` reads a same-named member of chat's ops into `resolveRoomFunder`; derive that slot from this member so a reference links them |
| `SessionsService.create` | `server/src/domain/sessions/contract/service.ts:99` | test-only | delete with its implementation and the 310 test files that name it |
| `SessionsServiceDeps.audit` | `server/src/domain/sessions/service.ts:36` | builder-only | delete with its implementation and the 116 test files that name it |
| `SessionsServiceDeps.seedUserConnections` | `server/src/domain/sessions/service.ts:46` | builder-only | delete with its implementation and the 3 test files that name it |
| `CertificateController.stop` | `server/src/domain/share/contract/service.ts:63` | builder-only | wire: `entry/lifecycle.ts:721` awaits a destructured `stop` at shutdown; derive that slot from this member so a reference links them |
| `ShareGraph.settle` | `server/src/domain/share/contract/composition.ts:31` | test-only | delete with its implementation and the 76 test files that name it |
| `WorldInfoService.listConstantCanon` | `server/src/domain/world-info/contract/service.ts:163` | builder-only | delete with its implementation |
| `ImportProfileDeps.reconcileStats` | `server/src/domain/import/contract/service.ts:113` | builder-only | wire: `entry/compose/portability-runner.ts:111` calls the stats function directly instead of this dep; derive that slot from this member so a reference links them |
| `EmbeddingsIndexerContext.roleClientsFor` | `server/src/domain/embeddings/contract/service.ts:222` | builder-only | delete with its implementation and the 9 test files that name it |

## Why

Domain verbs and context members nothing calls keep dead implementation, and product verbs without a caller are features users cannot reach.

## Done when

Each member in the table is deleted, wired to the named caller, or linked as its decision says, with a server test through the composed root for each wired verb; `pnpm unwired` no longer reports any of them.

## Evidence

| Member | Outcome |
| - | - |
| `AssetsService.rebuildFromTree` | owner call, unchanged |
| `WorkloadServiceContext.isOwner` | linked: `canCloneRow` takes `Pick<WorkloadServiceContext, "isAdmin" \| "isOwner">` |
| `AutomationService.listGlobalVariables` | deleted with its verb and params; the persistence query keeps its two internal callers and loses the prefix only the verb passed |
| `CharacterService.findByImportedFrom` | owner call, unchanged |
| `ConnectionService.availability`, `getBoundConnection` | linked: chat's connection deps are the named `ChatConnectionOps` port, which the composition root fills from `ConnectionService` |
| `ConnectionService.registerProvider`, `dropProvider` | deleted with their params; plugin rows still register through `registerPluginProviders` |
| `CredentialsService.markRevoked` | deleted; `maybeRevokeOnAuthFailed` is the runner-internal revoke the docs now name |
| `DatabankPortabilityContext.enqueueIngest` | linked: the context is `Pick<DatabankContext, …>` |
| `DiscoveryService.backfillDigestStoryTime`, `computeDigestHubScores`, `computeSegmentHubScores`, `computeImageHubScores` | owner calls, unchanged |
| `RegexService.getScript` | deleted: the item's premise does not hold, because the regex router has no single-script read. `tests/server/entry/compose/room-reach.int.test.ts` reads the foreign script through the owner's `listScripts` |
| `RpgStagingStore.peek` | deleted |
| `RpgRoundsChatOps.resolveHostUserId` | deleted: no round reads it. The composition root reads chat's own `resolveHostUserId` into `resolveRoomFunder`, which stays |
| `SessionsService.create` | blocked, unchanged: the link is the route port `AuthSessionsPort.create` in `packages/server/src/entry/http/auth-routes.ts`, a sibling lane's file |
| `SessionsServiceDeps.audit`, `seedUserConnections` | linked, not deleted: `createSessionsContext` reads both, so the delete fails `pnpm typecheck`. The deps extend `Pick<SessionsContext, …>` |
| `CertificateController.stop` | deleted: the item's premise does not hold. The `stop` that `entry/lifecycle.ts` awaits is the planner maintenance stop; shutdown disposes the controller |
| `ShareGraph.settle` | deliberate: `tests/server/entry/compose/share-acme.int.test.ts` waits on it as the share graph's settle signal, recorded in `tooling/src/unwired/deliberate.ts` under `docs/law/Spine-Testing.md` |
| `WorldInfoService.listConstantCanon` | deleted with its query and `LoreConstantCanonRow`: the injected rpg op it served no longer exists |
| `ImportProfileDeps.reconcileStats` | deleted: no import path calls it. The profile and bundle runs reconcile through the workload settle and the drivers' own `reconcileStats` |
| `EmbeddingsIndexerContext.roleClientsFor` | linked, not deleted: the indexer's task-model read takes it, so the delete fails `pnpm typecheck`. It picks the member from `EmbeddingsContext` |

New production-path tests: `tests/server/domain/sessions/verbs/login-audit.int.test.ts` (a real login's audit row; it fails when the sessions context drops the injected audit writer) and the restore assertion in `tests/server/domain/import/loader/library-planes.int.test.ts` (a restored document's ingest is queued; it fails when the restore writer skips `queueIngest`). Existing ones reach the other links: `tests/server/domain/workloads/persistence/every-owner-authority.int.test.ts` (`isOwner`) and `tests/server/domain/chat/verbs/read-gates.int.test.ts` (`checkSendAvailability`, `getNextTurnConnection`).

### Owner calls

- `AssetsService.rebuildFromTree` (`packages/server/src/domain/assets/contract/service.ts`): disaster recovery that re-derives asset index rows for orphan blobs by hashing the per-user tree. No admin maintenance procedure or workload runs it; it would surface as an admin "rebuild the asset index" action beside the garbage collection and integrity check.
- `CharacterService.findByImportedFrom` (`packages/server/src/domain/character/contract/service.ts`): the owner's characters whose `importedFrom` matches a batch of values. Its docs name the hub search page's already-imported markers as the caller; no hub surface reads it.
- `DiscoveryService.backfillDigestStoryTime`: stamps `digest_theme_assignments.msgMidAt` for an owner or every owner. No workload contribution runs it; it would surface as a discovery maintenance workload.
- `DiscoveryService.computeDigestHubScores`, `computeSegmentHubScores`, `computeImageHubScores`: write the CSLS `hub_score` of digests, segments and images. Only the character pass has a workload; the search verbs read the other three scores, which nothing computes. They would surface as hubness workloads beside the character one.
- `SessionsService.create` is not a feature question: every login calls it through `AuthSessionsPort.create`, whose narrowed hand-written signature the scan cannot link. Recommendation for the lane that owns `packages/server/src/entry/http/auth-routes.ts`: type it `SessionsService["create"]`.
