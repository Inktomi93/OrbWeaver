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

12 rows: applied 8, kept 4, handed off 0, owner question 0. Scan: ast-grep inline rule (identifier, type_identifier, property_identifier), `-l ts` and `-l tsx`, `packages tests` (5199 ts and 1450 tsx files); the hits per name matched the files edited below.

- `SeedThemeName` x2 (`state/appearance-boot-hint.ts`, `state/index.ts`): applied. Both re-exports are deleted. The home stays `lib/resolve-theme-scope-tokens.ts`, exported by `#lib`. The one `#state` importer (`use-appearance-root-effects.ts`) and the two tests (`tests/client/state/appearance-boot-hint.ct.tsx`, `_appearance-boot-hint-stories.tsx`) now import from `#lib` and `@orb/client/lib`.
- `ChatStreamApi`, `RecallState`, `TurnSlot` (3 rows): applied. `state/index.ts` exports them from `chat-stream-types.ts`; the pass-through in `chat-stream.ts` is deleted. No other importer used `chat-stream.ts` for them.
- `MobileCuration`: applied. `state/index.ts` exports it from `section-registry.ts` beside `SectionDefinition`; the pass-through in `chrome-registry.ts` is deleted. All other importers go through `#state` or `section-registry.ts`.
- `ConfigSettingRef` / `ConfigLeafAddress`: merged. Both are `{ group, sub, setting }`, the address of one setting leaf; the leaf-address comment itself calls it the `configFocus` vocabulary and the ref is the teacher's pointer to the same leaf. `ConfigLeafAddress` is deleted and its five files use `ConfigSettingRef` from the lower `state` tier (`components` imports `#state`, not the reverse).
- `MessageSelectionState` / `RegexBulkState`: applied. Both stores keep `{ active, selectedIds }`; the new `state/bulk-selection-state.ts` holds `BulkSelectionState` and both stores use it. Their actions and stores stay separate.
- `EntityDraftStore`: kept. `.dependency-cruiser.ts` rule `client-persisted-draft-implementation` (D321) forbids any file but `state/create-entity-draft-store.ts` from importing `entity-draft-store-implementation.ts`, so the typed factory file is the type's only legal door. I tried the home export first; depcruise failed (1 error), and I reverted it.
- `ConfigSettingOption` / `ParamToggleOption` and `ConfigSettingOption` / `ToggleItem` (2 rows): kept. A bare `{ value, label }` pair is not a concept. `ConfigSettingOption` is the view of whatever items array a leaf's own control renders (its header says it is deliberately unexported); the other two type their own toggle controls in other features. The one shared option vocabulary is `@orb/ui` `SelectOption`, which carries more fields; re-typing three controls onto it is a design change, not a dedupe.
- `SectionPlaceholderCopy` / `ConfigGroupPlaceholderProps`: kept. The first is the rail section's placeholder copy; the second is the props of a component that `config-content-surface.tsx` feeds from a config group's `label` and `description`. Same two fields, different sources and owners.
- `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0; `pnpm lint:eslint` on the touched paths exit 0; `pnpm depcruise` exit 0 after the revert.
