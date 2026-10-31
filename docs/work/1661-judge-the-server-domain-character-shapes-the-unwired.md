---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/character shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/character`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `CharacterAvatarLinkContext` / `WorldInfoDuplicateCarryContext` | `server/src/domain/character/contract/avatar-link.ts:20` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/world-info/contract/import.ts:37`; a shape that matches by coincidence stays |
| `GreetingCompletionDeps` / `CaptionImageDeps` | `server/src/domain/character/contract/greeting-ops.ts:12` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `server/src/domain/imagery/contract/generation-ops.ts:23`; a shape that matches by coincidence stays |
| `HandoffCardCopy` / `HandoffCardCopy` | `server/src/domain/character/contract/handoff-copy.ts:55` | reexport-chain | delete | export it from its home, not through `contracts/src/chat/index.ts` |
| `RemoveCharacterParams` / `ListConnectedParams` | `server/src/domain/character/contract/params.ts:35` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `RemoveCharacterParams` / `ListForCharacterParams` | `server/src/domain/character/contract/params.ts:35` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `RemoveCharacterParams` / `ListForCharacterParams` | `server/src/domain/character/contract/params.ts:35` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListSnapshotsParams` / `ListConnectedParams` | `server/src/domain/character/contract/params.ts:62` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListSnapshotsParams` / `ListForCharacterParams` | `server/src/domain/character/contract/params.ts:62` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListSnapshotsParams` / `ListForCharacterParams` | `server/src/domain/character/contract/params.ts:62` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DefaultCharacterSeeder` / `DefaultCharacterSeeder` | `server/src/domain/character/index.ts:24` | reexport-chain | delete | export it from its home, not through `server/src/domain/character/seeder/index.ts` |
| `createDefaultCharacterSeeder` / `createDefaultCharacterSeeder` | `server/src/domain/character/index.ts:25` | reexport-chain | delete | export it from its home, not through `server/src/domain/character/seeder/index.ts` |
| `DEFAULT_CHARACTER_CARDS` / `DEFAULT_CHARACTER_CARDS` | `server/src/domain/character/index.ts:25` | reexport-chain | delete | export it from its home, not through `server/src/domain/character/seeder/index.ts` |
| `WELCOME_ASSISTANT_HANDLE` / `WELCOME_ASSISTANT_HANDLE` | `server/src/domain/character/index.ts:25` | reexport-chain | delete | export it from its home, not through `server/src/domain/character/seeder/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 14 rows = 6 applied, 2 kept with reason, 6 kept deliberate (law section 4). 0 handed off, 0 owner questions.

- `HandoffCardCopy` reexport-chain: applied. `domain/character/contract/handoff-copy.ts` no longer re-exports it; its one user, `persistence/handoff-copy-write.ts`, imports it from `@orb/contracts/chat`. ast-grep ts, 5949 tracked files, tsx 1525: no other importer through the character contract.
- `DefaultCharacterSeeder`, `createDefaultCharacterSeeder`, `DEFAULT_CHARACTER_CARDS`, `WELCOME_ASSISTANT_HANDLE`: applied (4 rows). `domain/character/index.ts` exports each from its home (`contract/seeder.ts`, `seeder/cards.ts`, `seeder/seed.ts`). `seeder/index.ts` had `character/index.ts` as its only importer (rg across packages, tests, tooling, docs: 0 other), so it is deleted.
- `CharacterAvatarLinkContext` / `WorldInfoDuplicateCarryContext`: kept. Both are `{ db, now }`, but each is the context of a different domain's own write (character avatar relink, world-info duplicate carry). `domain-no-cross-feature` bars one domain from importing the other's contract, and `{ db, now }` is a coincidence, not one concept.
- `GreetingCompletionDeps` / `CaptionImageDeps`: kept. Same two fields, but one is character's greeting completion seam, the other imagery's caption seam; a shared type would need a cross-domain import or a new home for two unrelated seams.
- Six `…Params` rows (`RemoveCharacterParams`, `ListSnapshotsParams` against list verbs): kept, per-verb names (`docs/law/Core-0-Architecture-and-Structure.md` section 4).
