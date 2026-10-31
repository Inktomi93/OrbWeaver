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

Filled at landing: what ran and where its output is.
