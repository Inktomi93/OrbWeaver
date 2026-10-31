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

Filled at landing: what ran and where its output is.
