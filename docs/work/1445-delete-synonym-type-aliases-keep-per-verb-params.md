---
kind: work
status: open
updated: 2026-10-31
priority: P2
area: architecture
plan: unwired-code
---

# Delete synonym type aliases; keep per-verb Params and Result names

## What

Delete every exported pure-rename alias (`export type X = Y;` with no transform) that gives a second name to one concept, and point every consumer at the home name with the `rename-identifier` codemod. Examples: `SideGenSampling = RolePresetParams` (`packages/inference/src/contract/side-gen.ts:9`), `SummarizeOptions = RolePresetParams` (`packages/contracts/src/role-clients/index.ts:94`), `ReindexPreview`, `SeededLibraryEntry`, `ExportedCard`, `RingColor`, `WaystoneWeather`, `TreeImportStarted`, `BundleImportStarted` and the four `packages/inference/src/contract/diagnostics.ts` request aliases. List them all with `rg --pcre2 '^export type (\w+) = ([A-Z]\w*);$' packages/*/src`.

`pnpm unwired shapes` reports every `synonym`; `reports/unwired/shapes.json` holds the run and marks the per-verb ones `perVerb`. The aliases below are the ones outside the per-verb files, exported or not; paths are under `packages/`. A row marked Plugin API is part of the published plugin surface: keep it unless no guest can reach it through the host ABI or the plugin SDK.

| Alias | At | Names | Plugin API |
| - | - | - | - |
| `InvalidateFilter` | `client/src/data/collapse-filters.ts:6` | `InvalidateQueryFilters` from a library | |
| `BundleImportStarted` | `client/src/data/import-bundle.ts:17` | `ImportStarted` in `contracts/src/import/started.ts` | |
| `TreeImportStarted` | `client/src/data/import-tree.ts:24` | `ImportStarted` in `contracts/src/import/started.ts` | |
| `InvalidateFilter` | `client/src/data/invalidation-reads.ts:43` | `InvalidateQueryFilters` from a library | |
| `RestoreCardLorebookResult` | `client/src/data/restore-card-lorebook.ts:25` | `CardLorebookRestoreResult` in `contracts/src/import/lorebook-restore.ts` | |
| `TagGroupCensus` | `client/src/features/character/lib/character-list-view.ts:30` | `ListCharacterTagGroupsResult` in `contracts/src/character/index.ts` | |
| `SavedRosterSummary` | `client/src/features/roster-preset/components/roster-picker.tsx:47` | `RosterPresetSummary` in `contracts/src/roster-preset/index.ts` | |
| `ChatSettingsSectionContribution` | `client/src/lib/contribution-contracts.ts:104` | `ChatSettingsHostControlsContribution` in `client/src/lib/contribution-contracts.ts` | |
| `CharacterDetailContribution` | `client/src/lib/contribution-contracts.ts:226` | `CharacterDetailSectionsContribution` in `client/src/lib/contribution-contracts.ts` | |
| `ReindexPreview` | `client/src/lib/embedder-rebuild.ts:14` | `EmbedSpaceChangePreview` in `contracts/src/inference/embed-space-change-preview.ts` | |
| `ChatContextState` | `client/src/lib/registry-contracts.ts:320` | `CommittedChatContext` in `client/src/lib/registry-contracts.ts` | |
| `SuggestionCardDetail` | `contracts/src/automation/index.ts:915` | `RewriteCardDetail` in `contracts/src/automation/index.ts` | |
| `UnusedCharacter` | `contracts/src/discovery/index.ts:570` | `ArchetypeMember` in `contracts/src/discovery/artifacts.ts` | |
| `PluginVariableOp` | `contracts/src/plugin/host-v1.ts:66` | `VarOp` in `kit/src/macro/types.ts` | yes |
| `PluginVariablePrecondition` | `contracts/src/plugin/host-v1.ts:72` | `VariablePrecondition` in `contracts/src/chat/messages.ts` | yes |
| `PluginVariableWriteResult` | `contracts/src/plugin/host-v1.ts:78` | `VariableWriteResult` in `contracts/src/chat/messages.ts` | yes |
| `PluginSurfaceSpec` | `contracts/src/plugin/ui.ts:850` | `PluginSurfaceNode` in `contracts/src/plugin/ui.ts` | yes |
| `SummarizeOptions` | `contracts/src/role-clients/index.ts:94` | `RolePresetParams` in `contracts/src/preset/index.ts` | |
| `CuratedQuery` | `inference/src/capability/sources/curated/loader.ts:45` | `RowQuery` in `inference/src/contract/capability.ts` | |
| `ProbeRequest` | `inference/src/contract/diagnostics.ts:19` | `DiagnosticRequestCommon` in `inference/src/contract/diagnostics.ts` | |
| `AccountCreditsRequest` | `inference/src/contract/diagnostics.ts:21` | `DiagnosticRequestCommon` in `inference/src/contract/diagnostics.ts` | |
| `InspectRequest` | `inference/src/contract/diagnostics.ts:29` | `DiagnosticRequestCommon` in `inference/src/contract/diagnostics.ts` | |
| `VerifyAuthRequest` | `inference/src/contract/diagnostics.ts:32` | `DiagnosticRequestCommon` in `inference/src/contract/diagnostics.ts` | |
| `ScheduleTimeout` | `inference/src/contract/runtime.ts:44` | `ScheduleOp` in `kit/src/time/index.ts` | |
| `SideGenSampling` | `inference/src/contract/side-gen.ts:9` | `RolePresetParams` in `contracts/src/preset/index.ts` | |
| `SuggestionSource` | `server/src/domain/automation/contract/ops.ts:586` | `AutomationEmitSource` in `contracts/src/automation/index.ts` | |
| `DeliveredRole` | `server/src/domain/chat/assembly/shape.ts:61` | `MessageRole` in `kit/src/message-role/index.ts` | |
| `MessageMacroIdSource` | `server/src/domain/chat/contract/macro-ids.ts:20` | `RowMacroStamps` in `kit/src/macro/row-macros.ts` | |
| `MemoryRecallFilter` | `server/src/domain/chat/contract/memory.ts:238` | `RecorderFilter` in `server/src/foundation/observability/contract/debug.ts` | |
| `BackfillPassCounts` | `server/src/domain/chat/contract/memory.ts:326` | `BackfillPassResult` in `contracts/src/chat/backfill.ts` | |
| `MemoryBackfillCounts` | `server/src/domain/chat/contract/memory.ts:336` | `MemoryBackfillResult` in `contracts/src/chat/backfill.ts` | |
| `GenerateImageDeps` | `server/src/domain/chat/verbs/generate-image.ts:45` | `PostNarratorMessageDeps` in `server/src/domain/chat/contract/context.ts` | |
| `GenerationTask` | `server/src/domain/embeddings/contract/generation.ts:5` | `EmbeddingTask` in `contracts/src/embeddings/accounting.ts` | |
| `SeededLibraryEntry` | `server/src/domain/settings/contract/seeder.ts:50` | `BackgroundLibraryEntry` in `contracts/src/settings/appearance.ts` | |
| `WorkloadServiceDeps` | `server/src/domain/workloads/contract/service.ts:55` | `WorkloadServiceContext` in `server/src/domain/workloads/contract/service.ts` | |
| `AppEnv` | `server/src/entry/app.ts:182` | `PrincipalEnv` in `server/src/entry/http/contract/request-env.ts` | |
| `Logger` | `server/src/foundation/observability/contract/logging.ts:10` | `Logger` from a library | |
| `SnippetRunOut` | `server/src/infra/plugin-host/contract/port.ts:89` | `SnippetResult` in `contracts/src/plugin/snippet.ts` | |
| `LogLevel` | `server/src/infra/plugin-host/realm.ts:39` | `PluginLogLevel` in `contracts/src/plugin/host-v1.ts` | |
| `RingColor` | `ui/src/charts/meter/ring-gauge.tsx:14` | `TrackColor` in `ui/src/charts/meter/track-bar.tsx` | |
| `WaystoneWeather` | `ui/src/charts/meter/waystone-treatment.ts:35` | `WeatherType` in `kit/src/weather/index.ts` | |
| `CommandAuxiliaryButtonProps` | `ui/src/primitives/command/command.tsx:149` | `ButtonProps` in `ui/src/primitives/button/button.tsx` | |

Keep the per-verb names in a domain's `contract/params.ts` and `contract/results.ts` (`ListSessionsParams = RefineryActorParams`, `SetRoleResult = AdminUserData`): Core-0 §4's template gives every verb a named input and output. Add a check that refuses a new pure-rename alias outside those two files, with planted cases.

## Why

The writing law uses one word for one thing, and AGENTS.md says one home per concept. A synonym alias hides a type's home: the port census misclassified `RolePresetParams` shapes as inference-owned because of `SideGenSampling`. No law approves rename aliases outside the per-verb params and results template.

## Done when

No exported pure-rename alias remains outside `domain/*/contract/params.ts` and `results.ts`. The check refuses a planted one and accepts a per-verb params alias, `pnpm typecheck` passes on every program, and the affected suites pass.

## Evidence

Removed (every use points at the target, the alias is gone, `ast-grep` finds no identifier of the name in `packages`, `tooling` and `tests` for `-l ts` and `-l tsx`): all table rows except the kept ones below.

- Where the target was a non-exported interface (`ChatSettingsHostControlsContribution`, `CharacterDetailSectionsContribution`, `RewriteCardDetail`, `DiagnosticRequestCommon`), the interface took the name its consumers used, or was exported under its own name, so one name remains.
- `PluginVariableOp`, `PluginVariablePrecondition`, `PluginVariableWriteResult` and the `PluginSurfaceSpec` of `packages/contracts/src/plugin/ui.ts` are removed. No guest reaches them: they were file-local or host-side, guests type against `packages/plugin-sdk/shared.d.ts`, and `tests/contracts/plugin/sdk-conformance.test-d.ts` compares structure, never alias names.

Kept:

- `PluginSurfaceSpec` in `packages/plugin-sdk/shared.d.ts`: published guest surface, used by `packages/showcase-plugins/bundles/affinity-tracker/main.ts`.
- `Logger` in `packages/server/src/foundation/observability/contract/logging.ts`: owner ruling, one home for the logger type at the observability boundary. The scan's `synonym` report for it is accepted. `packages/server/src/infra/network/contract/egress.ts` and `packages/server/src/infra/plugin-host/contract/port.ts` import `Logger` from that contract file. `packages/server/src/transport/trpc/subscriptions.ts` and `packages/server/src/transport/trpc/stream/socket.ts` keep `pino.Logger`: the `package-subpath-crossing` rule refuses the contract file, and importing the observability barrel makes `tests/server/transport/trpc/router-declaration.repo.int.test.ts` fail, because the router declaration would then resolve server source.

Ran green: `pnpm typecheck` (every program), `pnpm depcruise`, `pnpm knip:prod`, `pnpm lint:eslint packages tooling tests`, `pnpm test` on the client, contracts, inference, kit, ui, showcase-plugins and server suites. Timeouts under load passed on rerun.

`pnpm unwired shapes` after the change lists `synonym` only for `Logger` (accepted above) and for per-verb names in `domain/*/contract/params.ts` and `results.ts`. No separate check refuses a new pure-rename alias: that scan is the home, and a lint rule would be a second one.
