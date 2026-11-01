---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the client/state fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `client/state`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AuthedComposition.configGroups` | `client/src/state/authed-composition.ts:16` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AuthedComposition.chatContextContributors` | `client/src/state/authed-composition.ts:21` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `AuthedComposition.chatContextRegions` | `client/src/state/authed-composition.ts:22` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PersistedCharacterLibraryState.sortMode` | `client/src/state/character-library-store.ts:57` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `PersistedCharacterLibraryState.viewMode` | `client/src/state/character-library-store.ts:58` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `PersistedCharacterLibraryState.favoritesOnly` | `client/src/state/character-library-store.ts:59` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `PersistedCharacterLibraryState.showArchived` | `client/src/state/character-library-store.ts:60` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `PersistedCharacterLibraryState.tagFilter` | `client/src/state/character-library-store.ts:61` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `PersistedCharacterLibraryState.spoilerBlur` | `client/src/state/character-library-store.ts:62` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `PersistedCharacterLibraryState.filtersOpen` | `client/src/state/character-library-store.ts:63` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `ConfigFocus.group` | `client/src/state/config-focus-store.ts:18` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ConfigFocus.sub` | `client/src/state/config-focus-store.ts:19` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ConfigFocus.setting` | `client/src/state/config-focus-store.ts:20` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ConfigSettingLeaf.advanced` | `client/src/state/config-group-registry.ts:90` | never-written | delete | delete the field and the branch that reads its default at `client/src/features/config/lib/config-search.ts:82` |
| `ConfigSearchMatch.memberId` | `client/src/state/config-search-store.ts:36` | never-read | delete | delete the field and its writes (`client/src/features/config/lib/config-palette-source.ts:45`) |
| `UnclaimedSettingsKey.reason` | `client/src/state/config-section-partition.ts:34` | never-read | delete | delete the field and its writes (`client/src/state/config-section-partition.ts:42`) |
| `DeviceLocalClassification.why` | `client/src/state/device-local-registry.ts:3` | never-read | delete | delete the field and its writes (`client/src/state/device-local-registry.ts:8`) |
| `ImageSubject.dims.w` | `client/src/state/imagery-store.ts:41` | unreferenced | delete | delete the field and the 1 test reference |
| `ImageSubject.dims.h` | `client/src/state/imagery-store.ts:41` | unreferenced | delete | delete the field and the 1 test reference |
| `SectionWithList.listSearch` | `client/src/state/section-registry.ts:101` | never-read | delete | delete the field and its writes (`client/src/features/chat/lib/chats-section.tsx:141`) |
| `PersistedShellState.activeSection` | `client/src/state/shell-store.ts:62` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |
| `PersistedShellState.panelOverrides` | `client/src/state/shell-store.ts:63` | never-read | unknown (read) | zustand `persist` serializes and restores it, a library read the scan cannot see; keep, and teach the scan the persisted-state read |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

22 rows: 4 deleted, 5 derived, 9 kept, 2 handed off, 2 under owner question Q2.

| Row | Result |
| - | - |
| `AuthedComposition.chatContextContributors`, `.chatContextRegions` | deleted from the type and from the object `createAuthedComposition` returns; the two locals stay because the chats section takes them. No reader in production, `tests/support`, tooling or tests |
| `ConfigSettingLeaf.advanced` | deleted with the `setting.advanced ?? false` default branch: `config-search.ts` now writes `advanced: false` for a leaf entry. No leaf in the repo sets it, so `@advanced` behaves as before |
| `ConfigSearchMatch.memberId` | deleted with its four writes (`config-search-input.tsx`, `config-palette-source.ts`); `setting-teach-row.tsx` reads `group`, `sub` and `setting` only |
| `ConfigFocus.group`, `.sub`, `.setting` | derived: `focusedLeafAddress` in `config-context.tsx` read them through an inline twin of the type; it now takes `ConfigFocus \| null` |
| `ImageSubject.dims.w`, `.h` | derived: `dims` is handed whole to `MessageMedia`, which reads `dims.w` and `dims.h` (`packages/ui/src/content/message-media/message-media.tsx:65` and `:74`); the field is `MessageMediaProps["dims"]` |
| `PersistedCharacterLibraryState.sortMode`, `.viewMode`, `.favoritesOnly`, `.showArchived`, `.tagFilter`, `.spoilerBlur`, `.filtersOpen` | kept: `migrate` reads each as `p.<key>` off `Partial<Record<keyof PersistedCharacterLibraryState, unknown>>` (`character-library-store.ts:119-131`), and zustand `persist` writes the `partialize` result |
| `PersistedShellState.activeSection`, `.panelOverrides` | kept: same shape at `shell-store.ts:148-151`. The item's own decision for these nine rows is keep and teach the scan the persisted-state read |
| `AuthedComposition.configGroups` | handed off. Only test files read it: `tests/client/state/registry-definitions.dom.test.ts:46`, `:51`, `:63`, `:128`. Production builds it and passes the local to `makeConfigSection` |
| `SectionWithList.listSearch` | handed off. Only a type test reads it: `tests/client/state/section-registry.dom.test-d.ts:5` (`Pick<SectionDefinition, "listSearch">`). Production writes `listSearch: "required"` in nine section definitions and reads it nowhere, so it is delete work once that test is rewritten |
| `UnclaimedSettingsKey.reason`, `DeviceLocalClassification.why` | owner question Q2; nothing changed |

Q2 (default: keep). Both fields are the required rationale of a compile-time registry that production never reads: `reason` is demanded by the partition gate's own message (`config-section-partition.ts:228`), and `why` is required of every `DEVICE_LOCAL_REGISTRY` entry by `satisfies Record<string, DeviceLocalClassification>`. The law (`docs/law/UI-Primitives-and-Reuse.md:89`) names the registry's keys, not the prose. Keep the prose as typed data, or delete the fields and turn the prose into comments (the `why` type then has no members)?

New orphan for the next scan: none from this item.

Survey: `codegraph_explore` on the state files named by the item; ast-grep (`-l ts` and `-l tsx`) on `setConfigSearchMatch($$$)` (4 writes), `useConfigSearchMatch()` (1 reader), `createAuthedComposition($$$)` (5 callers, 3 test files, `ct-data-providers.tsx`, `authed-app.tsx`), `focusedLeafAddress($$$)` (1). Typecheck: `pnpm typecheck packages/client/tsconfig.json tsconfig.tests-dom.json` exit 0, which is the probe that no twin type or test reads the four deleted fields. Tests: `pnpm test` on `registry-definitions.dom` and `authed-composition.dom`, 25 passed. CT: `config-search-input` and `config-content-surface` mount the search writes and `SettingRow`, 7 passed. Lint: `pnpm lint:eslint` on the touched trees exit 0.
