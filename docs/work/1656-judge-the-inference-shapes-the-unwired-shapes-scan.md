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

Filled at landing: what ran and where its output is.
