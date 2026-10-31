---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
---

# Judge the server entry, infra and transport members no production code calls

## What

`pnpm unwired` reports each member below with no production reference; `reports/unwired/unwired.json` holds the run. Apply the decision on each row.

A delete is checked by the compiler: if a composition site still needs the member structurally, `pnpm typecheck` refuses the delete and the member is linked instead. Paths are under `packages/`.

| Member | At | Scan | Decision |
| - | - | - | - |
| `OidcTransactionStore.consume` | `server/src/infra/auth/contract.ts:70` | unreferenced | wire: `entry/http/auth-routes.ts:315` calls it through the route's own store port; derive that slot from this member so a reference links them |
| `PasswordHasher.verify` | `server/src/infra/auth/contract.ts:249` | builder-only | delete with its implementation and the 80 test files that name it |
| `ScopedEgress.endpointAdmission` | `server/src/infra/network/contract/egress.ts:100` | builder-only | wire: `domain/connection/substrate/admission.ts:40` calls it through connection's ctx; derive that slot from this member so a reference links them |
| `OwnedResponseBody.cancel` | `server/src/infra/network/contract/response-body.ts:5` | test-only | delete with its implementation and the 65 test files that name it |
| `UserRuntimeDirs.remove` | `server/src/infra/storage/contract.ts:16` | builder-only | delete with its implementation and the 97 test files that name it |
| `Cas.blobPath` | `server/src/infra/storage/contract.ts:28` | test-only | delete with its implementation and the 5 test files that name it |
| `SocketRegistry.reap` | `server/src/transport/trpc/stream/socket-registry.ts:173` | builder-only | delete with its implementation and the 14 test files that name it |
| `Context.bugReportDiagnostics` | `server/src/transport/trpc/context.ts:144` | builder-only | wire: `transport/trpc/router.ts:61` calls it on the request context; derive that slot from this member so a reference links them |
| `FrameQueue.size` | `server/src/transport/trpc/stream/frame-queue.ts:85` | builder-only | delete with its implementation and the 267 test files that name it |
| `BootOwnerSeed.hashPassword` | `server/src/entry/boot/boot-owner.ts:19` | builder-only | delete with its implementation |
| `ImageryComposeDeps.resolveChatHostUserId` | `server/src/entry/compose/imagery.ts:39` | builder-only | delete with its implementation and the 2 test files that name it |
| `ImageryComposeDeps.isCharacterSeated` | `server/src/entry/compose/imagery.ts:41` | builder-only | delete with its implementation and the 1 test files that name it |
| `ImageryComposeDeps.loadUserSettings` | `server/src/entry/compose/imagery.ts:52` | builder-only | delete with its implementation and the 3 test files that name it |
| `ServicesResult.roleClientsFor` | `server/src/entry/compose/services.ts:379` | test-only | delete with its implementation and the 9 test files that name it |
| `ServicesResult.audit` | `server/src/entry/compose/services.ts:380` | test-only | delete with its implementation and the 116 test files that name it |
| `ServicesResult.storePluginFetchedAsset` | `server/src/entry/compose/services.ts:428` | test-only | delete with its implementation and the 1 test files that name it |
| `ServicesResult.enqueueEmbedReindex` | `server/src/entry/compose/services.ts:435` | test-only | delete with its implementation and the 1 test files that name it |

## Why

Composition results, adapters and request context members nothing calls keep test-only doors and dead adapter surface in production code.

## Done when

Each member in the table is deleted or linked as its decision says, and each test that read a deleted test door reads production instead; `pnpm unwired` no longer reports any of them.

## Evidence

Ran: `pnpm typecheck` for every program, `pnpm lint:eslint packages tooling tests`, `pnpm depcruise`, `pnpm knip:prod`, `pnpm unwired`, `pnpm test` on the suites that read a changed door (`tests/server/infra/network/response-body.test.ts`, the assets GC suites, `tests/server/domain/embeddings/**` funding and sweep suites, `tests/server/domain/connection/**`, `tests/server/domain/plugin/activation/provider-contributions.suite.int.test.ts`, `tests/server/domain/workloads/persistence/funded-tenant-rows.int.test.ts`, `tests/support/node/model-kernel.int.test.ts`, `tests/support/node/identity-output.int.test.ts`), and `tests/client/features/workloads/components/failed-assets.ct.tsx`. All green except `tests/server/domain/connection/local-light-cold-cache.suite.int.test.ts`, which skips itself.

| Member | Result |
| - | - |
| `OwnedResponseBody.cancel`, `Cas.blobPath`, `SocketRegistry.reap`, `FrameQueue.size`, `ScopedEgress.endpointAdmission`, `ServicesResult.roleClientsFor`, `ServicesResult.enqueueEmbedReindex` | deleted with their implementations |
| `OidcTransactionStore.consume` | wired: `DomainOidcStore` extends `Pick<OidcTransactionStore, "consume">`, and `OidcMintStore` picks from it |
| `PasswordHasher.verify` | wired, not deleted: `SessionsPasswordVerifier` is `Pick<PasswordHasher, "verify" | "dummyHash">`, and `sessions/context.ts` reads it for login |
| `Context.bugReportDiagnostics` | wired: the `bugReportDiagnostics` handler types its context through `Pick<Context, ...>` |
| `ImageryComposeDeps.resolveChatHostUserId`, `isCharacterSeated`, `loadUserSettings` | wired: `ImageryComposeDeps` extends `Pick<ImageryRoomAccessDeps, ...>` and `ImageryInstructionDeps` |

Premise corrections:
- `ScopedEgress.endpointAdmission` was deleted, not linked. The connection ctx slot reads `resolvedEndpointAdmission`, and nothing calls the synchronous form.
- Deleting `ServicesResult.enqueueEmbedReindex` left `SearchDiscoveryComposeResult.enqueueEmbedReindex` and `EmbeddingReindexTriggers.enqueueEmbedReindex` with no reader, so both are deleted. The seed ops and `scripts/generate-seed-vectors.ts` use `detachEmbedReindex` with `settleBackground`, and `built.runtime.roleClientsFor`.

Test doors replaced by production reads: the harness gains `roleClientsFor`, built from `app.runtime.roleClientsFor` and `principalFor`. Blob removal reads `cas.remove`. Blob aging in `tests/server/domain/assets/gc-box.ts` re-puts the bytes at the chosen time through `cas.putBytes`, the mtime bump a dedup hit does in production.

### Owner calls

- `BootOwnerSeed.hashPassword` stays. `lifecycle.ts:168` builds it and the seed spreads it into `seedOwner`, which reads `deps.hashPassword` to set the first-boot password. Deleting it compiles and silently drops `LOCAL_INITIAL_PASSWORD`. The member scan does not follow the spread.
- `UserRuntimeDirs.remove` is wired. `credentials.remove` releases the owner's runtime state through an injected `releaseRuntimeState` op once the owner holds no other key on the removed key's wire, because two agent-sdk keys share one CLI config directory. Compose maps the wire to its tool through `RUNTIME_TOOL_OF_WIRE` (`packages/server/src/infra/storage/contract.ts`) and calls `remove`. `tests/server/domain/credentials/verbs/remove-runtime-dir.int.test.ts` prepares the directory through a production auth check, keeps it while a second agent-sdk key remains, and finds it gone with the last key. That last check was red before the wiring.
- `ServicesResult.audit` is deleted. The harness builds its workload runner deps from its own audit wiring, the same writer it hands compose, and exposes them as `workloadExecution`; the two workload suites run admitted rows with those deps. The root-isolation suite drives its failing audit write through `settings.updateAppSettings`, an audited production verb.
- `ServicesResult.storePluginFetchedAsset` is deleted, with the compose product's `storeFetchedAsset` field and the `seedPluginFetchedAsset` seed. The sweep test now installs a real guest that calls `net.fetchAsset` against a cover host its box serves. The guest helper moved into the testkit (`tests/support/node/factories/plugin-guest.ts`) so the plugin substrate suites and the assets suite share it.

