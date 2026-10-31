---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/import fields the unwired fields scan reports

## What

`pnpm unwired fields` reports each of the fields below in `server/domain/import`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `BundleImportReport.aborted` | `server/src/domain/import/contract/bundle.ts:20` | never-read | delete | delete the field and its writes (`server/src/domain/import/loader/import-bundle.ts:189`) |
| `ParsedPersonas.defaultAvatarFile` | `server/src/domain/import/contract/collection.ts:27` | never-read | delete | delete the field and its writes (`server/src/domain/import/substrate/persona.ts:76`) |
| `CollectedGroup.sourceFile` | `server/src/domain/import/contract/collection.ts:141` | never-read | delete | delete the field and its writes (`server/src/domain/import/loader/collect.ts:489`) |
| `CollectResult.collidedCards` | `server/src/domain/import/contract/collection.ts:211` | never-read | delete | delete the field and its writes (`server/src/domain/import/loader/collect.ts:790`) |
| `CollectResult.fuzzyPairedDirs` | `server/src/domain/import/contract/collection.ts:213` | never-read | delete | delete the field and its writes (`server/src/domain/import/loader/collect.ts:794`) |
| `GroupChatInputDeps.primaryCharacterId` | `server/src/domain/import/contract/params.ts:64` | never-read | delete | delete the field and its writes (`server/src/domain/import/verbs/import-group-chats.ts:192`) |
| `ImportCharacterResult.attachedBooksLinked` | `server/src/domain/import/contract/results.ts:32` | never-read | delete | delete the field and its writes (`server/src/domain/import/verbs/import-character.ts:159`) |
| `ImportCharacterResult.attachedBooksSkipped` | `server/src/domain/import/contract/results.ts:33` | never-read | delete | delete the field and its writes (`server/src/domain/import/verbs/import-character.ts:159`) |
| `ImportChatsResult.characterId` | `server/src/domain/import/contract/results.ts:58` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportChatsResult.chatsSkipped` | `server/src/domain/import/contract/results.ts:60` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportChatsResult.messagesImported` | `server/src/domain/import/contract/results.ts:61` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportChatsResult.variantsImported` | `server/src/domain/import/contract/results.ts:62` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportChatsResult.branchesLinked` | `server/src/domain/import/contract/results.ts:63` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportPersonasResult.personasSkipped` | `server/src/domain/import/contract/results.ts:122` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportPersonasResult.personasMerged` | `server/src/domain/import/contract/results.ts:123` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `ImportPersonasResult.defaultPersonaId` | `server/src/domain/import/contract/results.ts:125` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `Group.dirName` | `server/src/domain/import/loader/collect.ts:53` | never-written | delete | delete the field and the branch that reads its default at `server/src/domain/import/loader/collect.ts:269` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Applied: every row except `Group.dirName`.

- The `ImportChatsResult` and `ImportPersonasResult` unknown rows: every caller reads these by field name (`packages/server/src/domain/import/loader/profile-directory.ts`, `packages/server/src/domain/import/verbs/import-chat-file.ts`, `packages/server/src/domain/import/loader/workload-drivers.ts`), and the value is not serialized whole. The unread counts are deleted.
- Removing `collidedCards` also removes its push in `disambiguate`; removing `fuzzyPairedDirs` leaves `fuzzyPair` returning nothing. The handle suffix and the chat pairing are unchanged.
- Kept: `Group.dirName`. The scan reads `??=` as no write. It is written at `packages/server/src/domain/import/loader/collect.ts` in `collectChatsForDir` and read in `collectBundlesFromDir` for `orphanBundles`.
- Survey: `codegraph_explore` on the result types; `ast-grep` and `rg` over `packages`, `tests`, `scripts`, `tooling` and `docs`.
- Ran: `pnpm typecheck tsconfig.node.json`; `pnpm test tests/server/domain/import` (one timeout under load, solo rerun of `library-planes.int.test.ts` passed).
