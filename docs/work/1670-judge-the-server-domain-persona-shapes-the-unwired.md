---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/persona shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/persona`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `GetPersonaParams` / `ListForPersonaParams` | `server/src/domain/persona/contract/params.ts:16` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `RemovePersonaParams` / `ListForPersonaParams` | `server/src/domain/persona/contract/params.ts:25` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListConnectedParams` / `ListForCharacterParams` | `server/src/domain/persona/contract/params.ts:45` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListConnectedParams` / `ListForCharacterParams` | `server/src/domain/persona/contract/params.ts:45` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ListConnectedCharactersParams` / `ListForPersonaParams` | `server/src/domain/persona/contract/params.ts:49` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `DuplicatePersonaParams` / `ListForPersonaParams` | `server/src/domain/persona/contract/params.ts:61` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ResolvePersonasForParticipants` / `ResolvePersonasForParticipants` | `server/src/domain/persona/index.ts:7` | reexport-chain | delete | export it from its home, not through `server/src/domain/persona/contract/ops.ts` |
| `PersonaContext` / `PersonaAssemblyContext` | `server/src/domain/persona/index.ts:9` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 2 rows = 2 applied. 0 kept, 0 handed off, 0 owner questions.

- `ResolvePersonasForParticipants` reexport-chain: applied. Home is `@orb/contracts/persona`. The `contract/ops.ts` re-export and the door's line are deleted; 4 importers (compose files and `ops.ts` users, plan from importers of both modules; ast-grep ts 5949 / tsx 1525 tracked files) import it from `@orb/contracts/persona`.
- `PersonaContext` / `PersonaAssemblyContext` renamed-reexport: applied. The door exports the declared name; the one importer is renamed. The inner `PersonaContext` is a different type.
- Check: `pnpm typecheck packages/server/tsconfig.json` exit 0 (covers 1667 to 1670).
