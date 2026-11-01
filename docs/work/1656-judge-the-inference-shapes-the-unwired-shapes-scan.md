---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the inference shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `inference`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `SessionEntryWriter` / `SessionEntryWriter` | `inference/src/backends/agent-sdk/index.ts:37` | reexport-chain | delete | export it from its home, not through `inference/src/backends/agent-sdk/session/index.ts`, `inference/src/contract/index.ts` |
| `SessionEntryWriter` / `SessionEntryWriter` | `inference/src/backends/agent-sdk/session/index.ts:6` | reexport-chain | delete | export it from its home, not through `inference/src/contract/index.ts` |
| `LocalLightModelSlot` / `LocalLightModelSlot` | `inference/src/backends/local-light/index.ts:13` | reexport-chain | delete | export it from its home, not through `inference/src/contract/index.ts` |
| `LOCAL_LIGHT_MODEL_SLOTS` / `LOCAL_LIGHT_MODEL_SLOTS` | `inference/src/backends/local-light/index.ts:14` | reexport-chain | delete | export it from its home, not through `inference/src/contract/index.ts` |
| `LocalLightModelCache` / `LocalLightModelCache` | `inference/src/backends/local-light/index.ts:15` | reexport-chain | delete | export it from its home, not through `inference/src/backends/local-light/model-cache.ts` |
| `LocalLightPrefetchTarget` / `LocalLightPrefetchTarget` | `inference/src/backends/local-light/index.ts:16` | reexport-chain | delete | export it from its home, not through `inference/src/backends/local-light/prefetch.ts` |
| `DiagnosticRequestCommon` / `WakeRequest` | `inference/src/contract/diagnostics.ts:13` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `inference/src/backends/openai-compat/index.ts:27`; a shape that matches by coincidence stays |
| `ChatDeltaEvent` / `ChatDeltaEvent` | `inference/src/contract/events.ts:9` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `ProviderCapabilityDrop` / `WireWarning` | `inference/src/contract/http.ts:131` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/foundation/observability/contract/wire-capture.ts:18`; a shape that matches by coincidence stays |
| `ResponseFormat` / `ResponseFormat` | `inference/src/contract/index.ts:31` | reexport-chain | delete | export it from its home, not through `inference/src/contract/chat.ts` |
| `ChatDeltaEvent` / `ChatDeltaEvent` | `inference/src/contract/index.ts:55` | reexport-chain | delete | export it from its home, not through `inference/src/contract/events.ts`, `contracts/src/chat/index.ts` |
| `GeneratedImage` / `GeneratedImage` | `inference/src/contract/index.ts:68` | reexport-chain | delete | export it from its home, not through `inference/src/contract/roles.ts` |
| `BindingActor` / `BindingActor` | `inference/src/deps.ts:5` | reexport-chain | delete | export it from its home, not through `inference/src/contract/runtime.ts` |
| `SessionEntryWriter` / `SessionEntryWriter` | `inference/src/index.ts:61` | reexport-chain | delete | export it from its home, not through `inference/src/backends/agent-sdk/index.ts`, `inference/src/backends/agent-sdk/session/index.ts`, `inference/src/contract/index.ts` |
| `LocalLightModelCache` / `LocalLightModelCache` | `inference/src/index.ts:65` | reexport-chain | delete | export it from its home, not through `inference/src/backends/local-light/index.ts`, `inference/src/backends/local-light/model-cache.ts` |
| `LocalLightModelSlot` / `LocalLightModelSlot` | `inference/src/index.ts:65` | reexport-chain | delete | export it from its home, not through `inference/src/backends/local-light/index.ts`, `inference/src/contract/index.ts` |
| `LocalLightPrefetchTarget` / `LocalLightPrefetchTarget` | `inference/src/index.ts:65` | reexport-chain | delete | export it from its home, not through `inference/src/backends/local-light/index.ts`, `inference/src/backends/local-light/prefetch.ts` |
| `LOCAL_LIGHT_MODEL_SLOTS` / `LOCAL_LIGHT_MODEL_SLOTS` | `inference/src/index.ts:66` | reexport-chain | delete | export it from its home, not through `inference/src/backends/local-light/index.ts`, `inference/src/contract/index.ts` |
| `AgentSdkNativeOptions` / `AgentSdkNativeOptions` | `inference/src/index.ts:69` | reexport-chain | delete | export it from its home, not through `inference/src/contract/agent-sdk-execution.ts` |
| `AgentSdkQuery` / `AgentSdkQuery` | `inference/src/index.ts:69` | reexport-chain | delete | export it from its home, not through `inference/src/contract/agent-sdk-execution.ts` |
| `AgentSdkSpawn` / `AgentSdkSpawn` | `inference/src/index.ts:69` | reexport-chain | delete | export it from its home, not through `inference/src/contract/agent-sdk-execution.ts` |
| `BindingActor` / `BindingActor` | `inference/src/index.ts:73` | reexport-chain | delete | export it from its home, not through `inference/src/deps.ts`, `inference/src/contract/runtime.ts` |
| `BindingStore` / `BindingStore` | `inference/src/index.ts:73` | reexport-chain | delete | export it from its home, not through `inference/src/deps.ts` |
| `ConnectionStore` / `ConnectionStore` | `inference/src/index.ts:73` | reexport-chain | delete | export it from its home, not through `inference/src/deps.ts` |
| `InferenceDeps` / `InferenceDeps` | `inference/src/index.ts:73` | reexport-chain | delete | export it from its home, not through `inference/src/deps.ts` |
| `ProviderSnapshot` / `ProviderSnapshot` | `inference/src/index.ts:73` | reexport-chain | delete | export it from its home, not through `inference/src/deps.ts` |
| `ProviderStore` / `ProviderStore` | `inference/src/index.ts:73` | reexport-chain | delete | export it from its home, not through `inference/src/deps.ts` |
| `SnapshotStore` / `SnapshotStore` | `inference/src/index.ts:73` | reexport-chain | delete | export it from its home, not through `inference/src/deps.ts` |
| `ProviderRegistry` / `ProviderRegistry` | `inference/src/index.ts:81` | reexport-chain | delete | export it from its home, not through `inference/src/registry/providers.ts` |
| `ResolveArgs` / `ResolveArgs` | `inference/src/index.ts:83` | reexport-chain | delete | export it from its home, not through `inference/src/resolve/resolve-task.ts` |
| `ResolveOutcome` / `ResolveOutcome` | `inference/src/index.ts:83` | reexport-chain | delete | export it from its home, not through `inference/src/resolve/resolve-task.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

31 rows: applied 23, kept 8, handed off 0, owner question 0. No request shaping, executor or wire code changed: only type re-export paths. Scan: a per-statement import and export scanner over every ts and tsx file under `packages tests tooling` (`git ls-files`), plus ast-grep (`-l ts`, `-l tsx`); the first scan filtered out server importers of `BindingActor` by mistake, which the server typecheck then caught, and I fixed it with the codemod below.

Applied (23):

- `SessionEntryWriter` (rows 1, 2, 14): the forwards in `backends/agent-sdk/index.ts`, `backends/agent-sdk/session/index.ts` and `src/index.ts` are deleted. The package root still exports it through `export * from "./contract/index.ts"`, which exports it from `contract/agent.ts`, its home. The server import from `@orb/inference` is unchanged.
- `LocalLightModelSlot`, `LOCAL_LIGHT_MODEL_SLOTS` (rows 3, 4, 16, 18): the forwards in `backends/local-light/index.ts` and the explicit root export are deleted; the same `export *` carries them from `contract/runtime.ts`.
- `LocalLightModelCache`, `LocalLightPrefetchTarget` (rows 5, 6, 15, 17): the forwards in `local-light/index.ts`, `model-cache.ts` and `prefetch.ts` are deleted; the root exports them from `contract/local-light.ts`.
- `AgentSdkNativeOptions`, `AgentSdkQuery`, `AgentSdkSpawn` (rows 19 to 21): the root exports them from `contract/agent-sdk-native.ts`; the forward in `contract/agent-sdk-execution.ts` is deleted.
- `ProviderRegistry` (row 29): the root exports it from `contract/registry.ts`; the forward at the end of `registry/providers.ts` is deleted.
- `ResolveArgs`, `ResolveOutcome` (rows 30, 31): the root exports them from `contract/task-resolution.ts`; `resolve/resolve-task.ts` keeps forwarding only `ResolverContext`.
- `ChatDeltaEvent` (rows 8, 11): `contract/index.ts` exports it from `@orb/contracts/chat`; the forward in `contract/events.ts` is deleted and `contract/chat.ts` imports it from the contract.
- `ResponseFormat` (row 10): `contract/index.ts` exports it from `@orb/contracts/role-clients`; the forward in `contract/chat.ts` is deleted and `contract/structured.ts` and `structured/plan.ts` import it from the contract.
- `GeneratedImage` (row 12): `contract/index.ts` exports it from `contract/generation.ts`; the forward in `contract/roles.ts` is deleted.
- `BindingActor` (rows 13, 22): `deps.ts` and `contract/runtime.ts` no longer forward it, and the root no longer exports it. `precedence.ts` and `role-clients.ts` import it from `@orb/contracts/inference`, and the 7 server files that imported it from `@orb/inference` now import it from `@orb/contracts/inference`, moved with `move-import-names` (dry run listed exactly the 7 planned files).

Kept (8):

- `BindingStore`, `ConnectionStore`, `InferenceDeps`, `ProviderSnapshot`, `ProviderStore`, `SnapshotStore` (rows 23 to 28): `deps.ts` is the sanctioned package-root composition seam that re-exports the port shapes owned by `contract/runtime.ts`, and `src/index.ts` exports that seam. `docs/law/Tier-3b-Providers.md` (the `deps.ts` seam section) and `docs/adr/0015-every-importable-module-directory-module.md` name it as one of the two permitted root files, and 14 internal and server importers use it.
- `DiagnosticRequestCommon` / `WakeRequest` (row 7): `WakeRequest` in `backends/openai-compat/index.ts` is a private structural port of what the wake reads from any task request (connection and cancel). `DiagnosticRequestCommon` is the diagnostics surface's request base. Same two fields, different owners.
- `ProviderCapabilityDrop` / `WireWarning` (row 9): `WireWarning` lives in the server observability foundation, which stays free of provider-package types; `ProviderCapabilityDrop` is the inference package's own drop record.

Commands: `pnpm typecheck packages/inference/tsconfig.json packages/server/tsconfig.json tsconfig.node.json tsconfig.tests-iso.json packages/client/tsconfig.json` exit 0; `pnpm typecheck tsconfig.tests-dom.json` exit 0; `pnpm lint:eslint` on the touched paths exit 0; `pnpm depcruise` exit 0.
