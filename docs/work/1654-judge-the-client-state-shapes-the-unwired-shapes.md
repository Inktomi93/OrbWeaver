---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/state shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `client/state`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `SeedThemeName` / `SeedThemeName` | `client/src/state/appearance-boot-hint.ts:24` | reexport-chain | delete | export it from its home, not through `client/src/lib/index.ts` |
| `ConfigSettingRef` / `ConfigLeafAddress` | `client/src/state/config-group-registry.ts:37` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/components/use-config-leaf.ts:31`; a shape that matches by coincidence stays |
| `ConfigSettingOption` / `ParamToggleOption` | `client/src/state/config-group-registry.ts:78` | restated | unknown (read) | a two-field `{ value, label }` option in two features: merge only if both are one option concept |
| `ConfigSettingOption` / `ToggleItem` | `client/src/state/config-group-registry.ts:78` | restated | unknown (read) | a two-field `{ value, label }` option in two features: merge only if both are one option concept |
| `SeedThemeName` / `SeedThemeName` | `client/src/state/index.ts:34` | reexport-chain | delete | export it from its home, not through `client/src/state/appearance-boot-hint.ts`, `client/src/lib/index.ts` |
| `ChatStreamApi` / `ChatStreamApi` | `client/src/state/index.ts:84` | reexport-chain | delete | export it from its home, not through `client/src/state/chat-stream.ts` |
| `RecallState` / `RecallState` | `client/src/state/index.ts:84` | reexport-chain | delete | export it from its home, not through `client/src/state/chat-stream.ts` |
| `TurnSlot` / `TurnSlot` | `client/src/state/index.ts:84` | reexport-chain | delete | export it from its home, not through `client/src/state/chat-stream.ts` |
| `MobileCuration` / `MobileCuration` | `client/src/state/index.ts:96` | reexport-chain | delete | export it from its home, not through `client/src/state/chrome-registry.ts` |
| `EntityDraftStore` / `EntityDraftStore` | `client/src/state/index.ts:201` | reexport-chain | delete | export it from its home, not through `client/src/state/create-entity-draft-store.ts` |
| `MessageSelectionState` / `RegexBulkState` | `client/src/state/message-selection-store.ts:11` | restated | delete (read) | both stores hold the same bulk-selection state: give it one home both stores use |
| `SectionPlaceholderCopy` / `ConfigGroupPlaceholderProps` | `client/src/state/section-registry.ts:57` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/features/config/components/config-group-placeholder.tsx:15`; a shape that matches by coincidence stays |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
