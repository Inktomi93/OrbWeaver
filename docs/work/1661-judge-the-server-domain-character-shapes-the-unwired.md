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

Filled at landing: what ran and where its output is.
