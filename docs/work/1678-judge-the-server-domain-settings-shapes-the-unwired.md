---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/domain/settings shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/domain/settings`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `UpdateUserSettingsSectionInput` / `ResetLeafVars` | `server/src/domain/settings/contract/params.ts:13` | restated | unknown | judge by concept: if both name one concept, keep one home and derive or import the other from `client/src/components/use-config-leaf.ts:59`; a shape that matches by coincidence stays |
| `ImportThemeFileParams` / `ImportBookFileParams` | `server/src/domain/settings/contract/params.ts:79` | restated | deliberate | keep: each verb names its own input and output (`docs/law/Core-0-Architecture-and-Structure.md` §4, `params.ts` and `results.ts`) |
| `ImportedAppearance` / `ImportedAppearance` | `server/src/domain/settings/contract/portability.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/settings/index.ts` |
| `ImportedAppearanceOutcome` / `ImportedAppearanceOutcome` | `server/src/domain/settings/contract/portability.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/settings/index.ts` |
| `ImportedThemeLanding` / `ImportedThemeLanding` | `server/src/domain/settings/contract/portability.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/settings/index.ts` |
| `SettingsImportOutcome` / `SettingsImportOutcome` | `server/src/domain/settings/contract/portability.ts:8` | reexport-chain | delete | export it from its home, not through `contracts/src/settings/index.ts` |
| `SeededPlateAsset` / `SeededPlateAsset` | `server/src/domain/settings/contract/seeder.ts:21` | reexport-chain | delete | export it from its home, not through `contracts/src/assets/index.ts` |
| `createSettingsContext` / `createSettingsAssemblyContext` | `server/src/domain/settings/index.ts:4` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |
| `SettingsContext` / `SettingsAssemblyContext` | `server/src/domain/settings/index.ts:9` | renamed-reexport | delete (read) | the door renames `…AssemblyContext`: give the type one name at its declaration |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Filled at landing: what ran and where its output is.
