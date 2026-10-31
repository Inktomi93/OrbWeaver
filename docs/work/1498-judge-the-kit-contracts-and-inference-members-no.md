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

Filled at landing: what ran and where its output is.
