---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
---

# Judge the kit, contracts and inference members no production code calls

## What

`pnpm unwired` reports each member below with no production reference; `reports/unwired/unwired.json` holds the run. Apply the decision on each row.

A delete is checked by the compiler: if a composition site still needs the member structurally, `pnpm typecheck` refuses the delete and the member is linked instead. Paths are under `packages/`.

| Member | At | Scan | Decision |
| - | - | - | - |
| `IdSource.socketId` | `kit/src/ids/index.ts:31` | test-only | delete with its implementation and the 10 test files that name it |
| `MacroRegistry.requirementsOf` | `kit/src/macro/types.ts:496` | builder-only | delete with its implementation |
| `VersionedConfig.serialize` | `contracts/src/versioned-config/index.ts:135` | builder-only | delete with its implementation and the 3 test files that name it |
| `ChatAutomationReads.getTurnOrigin` | `contracts/src/automation/index.ts:1132` | builder-only | wire: `domain/automation/substrate/fact-resolver.ts:76` calls it through the nested `AutomationOps.chat` slot; derive that slot from this member so a reference links them |
| `ChatAutomationReads.readVariables` | `contracts/src/automation/index.ts:1135` | builder-only | wire: `entry/compose/automation-plugin.ts:325` reads it through the nested `AutomationOps.chat` slot; derive that slot from this member so a reference links them |
| `ChatAutomationReads.readChoicePicks` | `contracts/src/automation/index.ts:1138` | builder-only | wire: `domain/automation/substrate/cel-env.ts:53` calls it through the nested `AutomationOps.chat` slot; derive that slot from this member so a reference links them |
| `RoleClients.imageEmbed` | `contracts/src/role-clients/index.ts:129` | test-only | wire: the role executor runs it by task name at `inference/src/roles/executor.ts:132`; derive that slot from this member so a reference links them |
| `ProviderExecutor.runAgentTurn` | `inference/src/contract/backend.ts:92` | test-only | delete with its implementation and the 2 test files that name it |
| `ConnectionStore.listForOwner` | `inference/src/contract/runtime.ts:184` | builder-only | delete with its implementation |
| `ProviderRegistry.refresh` | `inference/src/contract/registry.ts:26` | builder-only | delete with its implementation and the 21 test files that name it |
| `Mirror.seed` | `inference/src/contract/catalog.ts:65` | builder-only | delete with its implementation and the 167 test files that name it |
| `ReachabilityProber.invalidate` | `inference/src/contract/openai-backend.ts:178` | builder-only | delete with its implementation and the 3 test files that name it |
| `LocalLightPrefetchHandle.retry` | `inference/src/contract/local-light.ts:86` | builder-only | delete with its implementation and the 68 test files that name it |
| `LocalLightPrefetchHandle.status` | `inference/src/contract/local-light.ts:87` | builder-only | delete with its implementation and the 503 test files that name it |
| `BoundedRing.size` | `kit/src/bounded-ring/index.ts:45` | builder-only | delete with its implementation and the 267 test files that name it |
| `BoundedRing.clear` | `kit/src/bounded-ring/index.ts:47` | builder-only | delete with its implementation and the 67 test files that name it |
| `ReplayBuffer.size` | `kit/src/replay-buffer/index.ts:32` | test-only | delete with its implementation and the 267 test files that name it |
| `SerialLanes.activeCount` | `kit/src/serial-lanes/index.ts:4` | test-only | delete with its implementation and the 1 test files that name it |

## Why

A member nothing calls in a shared package widens every implementer's contract for nothing; one reached only through an unlinked port hides its real caller.

## Done when

Each member in the table is deleted or linked as its decision says; `pnpm typecheck` passes for every world, and `pnpm unwired` no longer reports any of them.

## Evidence

Ran: `pnpm typecheck` for every program, `pnpm lint:eslint packages tooling tests`, `pnpm depcruise`, `pnpm knip:prod`, `pnpm unwired`, and `pnpm test` on `tests/kit/ids/injected-mints.test.ts`, `tests/kit/replay-buffer/owned-clear.test.ts`, `tests/kit/serial-lanes/ordering.test.ts` and `tests/server/domain/connection/persistence/provider-rows.int.test.ts`. All green.

| Member | Result |
| - | - |
| `IdSource.socketId`, `VersionedConfig.serialize`, `ConnectionStore.listForOwner`, `ProviderRegistry.refresh`, `Mirror.seed`, `ReachabilityProber.invalidate`, `BoundedRing.size`, `BoundedRing.clear`, `ReplayBuffer.size`, `SerialLanes.activeCount` | deleted with their implementations |
| `ChatAutomationReads.getTurnOrigin`, `readVariables`, `readChoicePicks` | wired: `AutomationOps.chat` is `Pick<ChatAutomationReads, ...>` intersected with the write ops |

Test changes: the `SerialLanes` drained-lane test asserted only through `activeCount`, so it is removed. The `provider-rows` test now reloads the registry through `registry.dropPlugin`, the production door that re-reads the store.

### Owner calls

- `MacroRegistry.requirementsOf` stays. Its doc names the prompt preview engine as the consumer, and `docs/work/0501-wire-or-delete-the-unused-prompt-preview-verbs.md` has not ruled on that engine.
- `RoleClients.imageEmbed` stays. The item's premise is false: `executor.ts:132` is `ProviderExecutor.imageEmbed`, and every production image embed calls `runtime.executor.imageEmbed` (`packages/server/src/domain/embeddings/verbs/runtime-connection.ts:63`). Nothing in production calls the `RoleClients` member. Delete it with `packages/inference/src/roles/role-clients.ts:84` or keep it as the role-bundle door; the owner decides.
- `ProviderExecutor.runAgentTurn` stays. Only tests call it, so deleting it leaves the agent-sdk turn path (`agent-runner.ts`, `AgentTurnRequest`, the backend `runAgentTurn`) with no production caller. That is an unbuilt agent-turn feature, not a stray method.
- `LocalLightPrefetchHandle.retry` and `status` stay. `packages/inference/src/backends/local-light/prefetch.ts` records per-slot download state for an in-process reader. No reader exists, and the header records that the status surface was struck. Deleting them leaves the record, `publish`, `onProgress` routing and `LocalLightPrefetchRecord` dead.

