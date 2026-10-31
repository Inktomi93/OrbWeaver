---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/primitives fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/primitives`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PortableSeatCard.importHash` | `server/src/primitives/serde/chat-bundle/index.ts:181` | unreferenced | delete | delete the field |
| `PortableSeatCard.textHash` | `server/src/primitives/serde/chat-bundle/index.ts:182` | unreferenced | delete | delete the field |
| `PortableSeatCard.fileHash` | `server/src/primitives/serde/chat-bundle/index.ts:183` | unreferenced | delete | delete the field |
| `wireVariantSchema.tokenProvenance` | `server/src/primitives/serde/chat-bundle/index.ts:233` | never-read | delete | delete the key and its writes (`server/src/primitives/serde/chat-bundle/index.ts:416`) |
| `wireInjectionSchema.order` | `server/src/primitives/serde/chat-bundle/index.ts:266` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/primitives/serde/chat-bundle/index.ts:625` |
| `wireChatSchema.seatCards.handle` | `server/src/primitives/serde/chat-bundle/index.ts:347` | unreferenced | delete | delete the key |
| `wireChatSchema.seatCards.importHash` | `server/src/primitives/serde/chat-bundle/index.ts:347` | unreferenced | delete | delete the key |
| `wireChatSchema.seatCards.textHash` | `server/src/primitives/serde/chat-bundle/index.ts:347` | unreferenced | delete | delete the key |
| `wireChatSchema.seatCards.fileHash` | `server/src/primitives/serde/chat-bundle/index.ts:347` | unreferenced | delete | delete the key |
| `ParsedScriptInject.key` | `server/src/primitives/serde/chat/index.ts:157` | never-read | delete | delete the field and its writes (`server/src/primitives/serde/chat/index.ts:498`) |
| `ParsedChat.isBranch` | `server/src/primitives/serde/chat/index.ts:172` | never-read | delete | delete the field and its writes (`server/src/primitives/serde/chat/index.ts:889`) |
| `ParsedChat.sourceMetadata` | `server/src/primitives/serde/chat/index.ts:196` | never-read | delete | delete the field and its writes (`server/src/primitives/serde/chat/index.ts:897`) |
| `JsonSerde.schemaKind` | `server/src/primitives/serde/lib/index.ts:49` | never-read | delete | delete the field and its writes (`server/src/primitives/serde/lib/index.ts:225`) |
| `JsonSerde.schemaVersion` | `server/src/primitives/serde/lib/index.ts:50` | never-read | delete | delete the field and its writes (`server/src/primitives/serde/lib/index.ts:226`) |
| `PersonaPlacement.descriptionPosition` | `server/src/primitives/serde/persona/index.ts:83` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PersonaPlacement.inject` | `server/src/primitives/serde/persona/index.ts:84` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PersonaPlacement.swapMacros` | `server/src/primitives/serde/persona/index.ts:85` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `userSettingsSerde.bodySchema.settings` | `server/src/primitives/serde/user-settings/index.ts:90` | unreferenced | delete | delete the key |
| `fileEntrySchema.title` | `server/src/primitives/serde/world-info/index.ts:21` | unreferenced | delete | delete the key |
| `fileEntrySchema.description` | `server/src/primitives/serde/world-info/index.ts:22` | unreferenced | delete | delete the key |
| `fileEntrySchema.content` | `server/src/primitives/serde/world-info/index.ts:23` | unreferenced | delete | delete the key |
| `fileEntrySchema.keys` | `server/src/primitives/serde/world-info/index.ts:24` | unreferenced | delete | delete the key |
| `fileEntrySchema.enabled` | `server/src/primitives/serde/world-info/index.ts:25` | unreferenced | delete | delete the key |
| `fileEntrySchema.priority` | `server/src/primitives/serde/world-info/index.ts:26` | unreferenced | delete | delete the key |
| `fileEntrySchema.ignoreBudget` | `server/src/primitives/serde/world-info/index.ts:27` | unreferenced | delete | delete the key |
| `fileEntrySchema.metadata` | `server/src/primitives/serde/world-info/index.ts:28` | unreferenced | delete | delete the key |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
