---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the server/entry shapes the unwired shapes scan reports

## What

`pnpm unwired shapes` reports each of the shapes below in `server/entry`; `reports/unwired/shapes.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Shape | At | Kind | Class | Decision |
| - | - | - | - | - |
| `authConfigFromEnv` / `authConfigFromEnv` | `server/src/entry/auth/index.ts:1` | reexport-chain | delete | export it from its home, not through `server/src/infra/auth/index.ts` |
| `oidcPendingJoinCookieFor` / `oidcPendingJoinCookieFor` | `server/src/entry/auth/index.ts:1` | reexport-chain | delete | export it from its home, not through `server/src/infra/auth/index.ts` |
| `readRequestCookie` / `readRequestCookie` | `server/src/entry/auth/index.ts:1` | reexport-chain | delete | export it from its home, not through `server/src/infra/auth/index.ts` |
| `BackfillPluginProvenanceOnBootDeps` / `HealLegacyBackgroundPinsDeps` | `server/src/entry/boot/backfill-plugin-provenance.ts:21` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `BackfillPluginProvenanceOnBootDeps` / `MigrateHandoffOfferVocabDeps` | `server/src/entry/boot/backfill-plugin-provenance.ts:21` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `BackfillPluginProvenanceOnBootDeps` / `MigratePluginToolWireNamesDeps` | `server/src/entry/boot/backfill-plugin-provenance.ts:21` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `BackfillPluginProvenanceOnBootDeps` / `MigrateProseSlotVocabDeps` | `server/src/entry/boot/backfill-plugin-provenance.ts:21` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `BackfillPluginProvenanceOnBootDeps` / `RepairStaleJoinSeqDeps` | `server/src/entry/boot/backfill-plugin-provenance.ts:21` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `HealLegacyBackgroundPinsDeps` / `MigrateHandoffOfferVocabDeps` | `server/src/entry/boot/heal-legacy-background-pins.ts:17` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `HealLegacyBackgroundPinsDeps` / `MigratePluginToolWireNamesDeps` | `server/src/entry/boot/heal-legacy-background-pins.ts:17` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `HealLegacyBackgroundPinsDeps` / `MigrateProseSlotVocabDeps` | `server/src/entry/boot/heal-legacy-background-pins.ts:17` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `HealLegacyBackgroundPinsDeps` / `RepairStaleJoinSeqDeps` | `server/src/entry/boot/heal-legacy-background-pins.ts:17` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `MigrateHandoffOfferVocabDeps` / `MigratePluginToolWireNamesDeps` | `server/src/entry/boot/migrate-handoff-offer-vocab.ts:18` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `MigrateHandoffOfferVocabDeps` / `MigrateProseSlotVocabDeps` | `server/src/entry/boot/migrate-handoff-offer-vocab.ts:18` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `MigrateHandoffOfferVocabDeps` / `RepairStaleJoinSeqDeps` | `server/src/entry/boot/migrate-handoff-offer-vocab.ts:18` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `MigratePluginToolWireNamesDeps` / `MigrateProseSlotVocabDeps` | `server/src/entry/boot/migrate-plugin-tool-wire-names.ts:44` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `MigratePluginToolWireNamesDeps` / `RepairStaleJoinSeqDeps` | `server/src/entry/boot/migrate-plugin-tool-wire-names.ts:44` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `MigrateProseSlotVocabDeps` / `RepairStaleJoinSeqDeps` | `server/src/entry/boot/migrate-prose-slot-vocab.ts:20` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `SeedExamplePluginsDeps` / `SeedUserContentDeps` | `server/src/entry/boot/seed-example-plugins-step.ts:8` | restated | unknown (read) | two boot steps that both take `{ db, logger }` match by coincidence: keep each step's own deps |
| `ExamplePluginSeeder` / `ExamplePluginSeeder` | `server/src/entry/boot/seed-example-plugins.ts:8` | reexport-chain | delete | export it from its home, not through `server/src/domain/plugin/index.ts` |
| `UserContentSeeder` / `UserContentSeeder` | `server/src/entry/boot/seed-user-content.ts:15` | reexport-chain | delete | export it from its home, not through `server/src/domain/settings/index.ts` |
| `PortabilityTableName` / `SchemaTableName` | `server/src/entry/contract/portability.ts:3` | reexport-chain | delete | export it from its home, not through `db/src/client/wiring.ts` |
| `importStagedArchive` / `importStagedArchive` | `server/src/entry/import/index.ts:4` | reexport-chain | delete | export it from its home, not through `server/src/domain/import/index.ts` |
| `runBundleImport` / `runBundleImport` | `server/src/entry/import/index.ts:4` | reexport-chain | delete | export it from its home, not through `server/src/domain/import/index.ts` |
| `createNodeFsImportPort` / `createNodeFsImportPort` | `server/src/entry/import/index.ts:5` | reexport-chain | delete | export it from its home, not through `server/src/infra/storage/index.ts` |
| `ImportFile` / `ImportFile` | `server/src/entry/import/index.ts:8` | reexport-chain | delete | export it from its home, not through `server/src/entry/import/run-profile-import.ts`, `server/src/domain/import/index.ts` |
| `ImportFile` / `ImportFile` | `server/src/entry/import/run-profile-import.ts:35` | reexport-chain | delete | export it from its home, not through `server/src/domain/import/index.ts` |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired shapes` no longer reports the row.

## Evidence

Counts: 27 rows = 8 applied, 16 kept with reason, 3 left and flagged for 1698 (authn). 0 owner questions.

- Handed to 1698: `authConfigFromEnv`, `oidcPendingJoinCookieFor`, `readRequestCookie` reexport-chain in `packages/server/src/entry/auth/index.ts`. They are auth config and session-cookie readers, and `@orb/server/entry/auth` is a package export that `scripts/generate-seed-vectors.ts` and four test files import. Left untouched.
- Applied: `ExamplePluginSeeder` (`entry/boot/seed-example-plugins.ts`) and `UserContentSeeder` (`entry/boot/seed-user-content.ts`) re-exports deleted, importers take them from `#domain/plugin` and `#domain/settings`. `importStagedArchive`, `runBundleImport`, `createNodeFsImportPort` and `ImportFile` removed from `entry/import/index.ts`; the `ImportFile` re-export in `run-profile-import.ts` is gone; importers take them from `#domain/import` and `#infra/storage`. `PortabilityTableName` / `SchemaTableName`: `entry/contract/portability.ts` no longer renames it; the compose importer and `tests/server/entry/compose/lifecycle-portability.test-d.ts` use `SchemaTableName` from `@orb/db/wiring`. Plan built from importers (`move-import-names`; ast-grep ts 5949 / tsx 1525 tracked files, rg over `packages`, `tests`, `tooling`, `scripts`).
- Kept (16 restated `…Deps` pairs among `BackfillPluginProvenanceOnBootDeps`, `HealLegacyBackgroundPinsDeps`, `MigrateHandoffOfferVocabDeps`, `MigratePluginToolWireNamesDeps`, `MigrateProseSlotVocabDeps`, `RepairStaleJoinSeqDeps`, `SeedExamplePluginsDeps`, `SeedUserContentDeps`): each boot step declares its own `{ db, logger }`-shaped deps. They match by coincidence, not by concept: boot ordering lives in lifecycle and each step's deps grow on their own (the seed steps add policy and manifest ports). One shared type would couple unrelated steps so that widening one widens all.
- Check: `pnpm typecheck packages/server/tsconfig.json` exit 0.
