---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/entry fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/entry`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `AuthSeamResolution.csrfHeaderPresent` | `server/src/entry/auth/seam.ts:103` | never-read | delete | delete the field and its writes (`server/src/entry/auth/seam.ts:360`) |
| `ReactivatePluginsReport.restored` | `server/src/entry/boot/reactivate-plugins.ts:54` | never-read | delete | delete the field and its writes (`server/src/entry/boot/reactivate-plugins.ts:94`) |
| `ReactivatePluginsReport.failed` | `server/src/entry/boot/reactivate-plugins.ts:55` | never-read | delete | delete the field and its writes (`server/src/entry/boot/reactivate-plugins.ts:94`) and the 1 test reference |
| `AdminComposeDeps.idSource` | `server/src/entry/compose/admin.ts:24` | never-read | delete | delete the field and its writes (`server/src/entry/compose/services.ts:950`) |
| `AdminComposeDeps.logger` | `server/src/entry/compose/admin.ts:26` | never-read | delete | delete the field and its writes (`server/src/entry/compose/services.ts:951`) |
| `AssetsCharacterComposeResult.assetsCtx` | `server/src/entry/compose/assets-character.ts:116` | never-read | delete | delete the field and its writes (`server/src/entry/compose/assets-character.ts:266`) |
| `ServicesResult.automation` | `server/src/entry/compose/services.ts:353` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.presence` | `server/src/entry/compose/services.ts:354` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.embeddings` | `server/src/entry/compose/services.ts:358` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.indexer` | `server/src/entry/compose/services.ts:359` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.eventBus` | `server/src/entry/compose/services.ts:367` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.databankIngest` | `server/src/entry/compose/services.ts:373` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.effectiveConfig` | `server/src/entry/compose/services.ts:383` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.secretBox` | `server/src/entry/compose/services.ts:384` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.characterSeeder` | `server/src/entry/compose/services.ts:387` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.personaSeeder` | `server/src/entry/compose/services.ts:389` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.rpgChatOps` | `server/src/entry/compose/services.ts:405` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.cas` | `server/src/entry/compose/services.ts:417` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.crossFeatureOps` | `server/src/entry/compose/services.ts:420` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.toolUse` | `server/src/entry/compose/services.ts:446` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ServicesResult.chatRpgOps` | `server/src/entry/compose/services.ts:450` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `NonPortableCanon.classification` | `server/src/entry/contract/portability.ts:9` | never-read | delete | delete the field and its writes (`server/src/entry/compose/portability.ts:185`) and the 2 test references |
| `NonPortableCanon.why` | `server/src/entry/contract/portability.ts:11` | never-read | delete | delete the field and its writes (`server/src/entry/compose/portability.ts:186`) and the 2 test references |
| `LifecycleDoors.singleExport` | `server/src/entry/contract/portability.ts:23` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LifecycleDoors.singleImport` | `server/src/entry/contract/portability.ts:24` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `LifecycleDoors.chrome` | `server/src/entry/contract/portability.ts:25` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PrincipalEnv.Variables` | `server/src/entry/http/contract/request-env.ts:17` | unreferenced | delete | delete the field |
| `PrincipalEnv.Variables.principal` | `server/src/entry/http/contract/request-env.ts:17` | unreferenced | delete | delete the field |
| `PrincipalEnv.Variables.sessionId` | `server/src/entry/http/contract/request-env.ts:17` | unreferenced | delete | delete the field |
| `FrameHandleEntry.grant` | `server/src/entry/http/frame-handle-store.ts:61` | never-written | delete | delete the field and the branch that reads its default at `server/src/entry/http/card-frame.ts:252` |
| `FrameHandleEntry.grant.chatId` | `server/src/entry/http/frame-handle-store.ts:62` | unreferenced | delete | delete the field |
| `FrameHandleEntry.grant.characterId` | `server/src/entry/http/frame-handle-store.ts:63` | unreferenced | delete | delete the field |
| `CardLorebookRestoreDeps.worldInfo` | `server/src/entry/import/run-profile-import.ts:31` | never-read | delete | delete the field and its writes (`server/src/entry/http/upload.ts:257`) |
| `LifecycleOptions.relaySeams.pin` | `server/src/entry/lifecycle.ts:191` | unreferenced | delete | delete the field |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
