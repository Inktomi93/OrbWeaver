---
kind: work
status: open
updated: 2026-10-31
priority: P3
area: architecture
plan: unwired-code
---

# Judge the contracts fields the unwired fields scan reports: plugin to providers

## What

`pnpm unwired fields` reports each of the fields below in `contracts`; `reports/unwired/fields.json` holds the run. Apply the decision on each row. Paths are under `packages/`. A class marked `(read)` was judged by reading the cited code; the others follow the class rules in the [unwired-code plan](../plans/unwired-code/design.md#judging-a-finding).

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PortableEnvelope.schemaKind` | `contracts/src/portability/index.ts:100` | never-read | delete | delete the field and its writes (`server/src/primitives/serde/lib/index.ts:173`) |
| `PortableEnvelope.schemaVersion` | `contracts/src/portability/index.ts:101` | never-read | delete | delete the field and its writes (`server/src/primitives/serde/lib/index.ts:173`) |
| `PortableEntity.ext` | `contracts/src/portability/index.ts:138` | never-read | delete | delete the field and its writes (`server/src/entry/compose/portability.ts:125`) and the 2 test references |
| `userIntentSchema.quality` | `contracts/src/preset/index.ts:456` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:96` |
| `userIntentSchema.thinkingDisplay` | `contracts/src/preset/index.ts:460` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:446` |
| `userIntentSchema.carryReasoning` | `contracts/src/preset/index.ts:462` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:285` |
| `userIntentSchema.providerContextCompression` | `contracts/src/preset/index.ts:466` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/backends/openai-compat/chat.ts:432` |
| `userIntentSchema.responseCache` | `contracts/src/preset/index.ts:467` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/backends/anthropic-messages/chat.ts:393` |
| `userIntentSchema.drySequenceBreakers` | `contracts/src/preset/index.ts:489` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:522` |
| `userIntentSchema.bannedStrings` | `contracts/src/preset/index.ts:501` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:523` |
| `userIntentSchema.banEos` | `contracts/src/preset/index.ts:503` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:524` |
| `userIntentSchema.samplerOrder` | `contracts/src/preset/index.ts:505` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:525` |
| `userIntentSchema.logitBias` | `contracts/src/preset/index.ts:507` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:520` |
| `userIntentSchema.verbosity` | `contracts/src/preset/index.ts:510` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:621` |
| `userIntentSchema.replyMedia` | `contracts/src/preset/index.ts:511` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `inference/src/funnel/resolve-chat.ts:594` |
| `userIntentSchema.compaction.instructions` | `contracts/src/preset/index.ts:517` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/engine/engine.ts:1046` |
| `guidedActionConfigSchema.depth` | `contracts/src/preset/index.ts:686` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/assembly/context.ts:615` |
| `RewriteToggle.slot` | `contracts/src/preset/index.ts:761` | never-read | delete | delete the field and its writes (`contracts/src/preset/index.ts:771`) |
| `GreetingTransform.slot` | `contracts/src/preset/index.ts:817` | never-read | delete | delete the field and its writes (`contracts/src/preset/index.ts:843`) |
| `literalSection.inject` | `contracts/src/preset/index.ts:951` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/assembly/assemble.ts:706` |
| `templatedMarkerSection.template` | `contracts/src/preset/index.ts:990` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/assembly/assemble.ts:108` |
| `templatedMarkerSection.inject` | `contracts/src/preset/index.ts:991` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/assembly/assemble.ts:706` |
| `templatedMarkerSection.forbidCharacterOverride` | `contracts/src/preset/index.ts:994` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/assembly/assemble.ts:445` |
| `templatedMarkerSection.forbidRoomOverride` | `contracts/src/preset/index.ts:996` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/assembly/assemble.ts:449` |
| `choiceBlockSchema.defaultValue` | `contracts/src/preset/index.ts:2250` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/substrate/variables.ts:31` |
| `userMacroArgSchema.name` | `contracts/src/preset/index.ts:2281` | never-read | delete | delete the key and its writes (`client/src/components/user-macro-editor-dialog.tsx:157`) |
| `userMacroArgSchema.type` | `contracts/src/preset/index.ts:2282` | never-read | delete | delete the key and its writes (`client/src/components/user-macro-editor-dialog.tsx:157`) |
| `userMacroArgSchema.default` | `contracts/src/preset/index.ts:2284` | unreferenced | delete | delete the key |
| `userMacroArgSchema.description` | `contracts/src/preset/index.ts:2285` | unreferenced | delete | delete the key |
| `userMacroInputOptionSchema.value` | `contracts/src/preset/index.ts:2290` | never-read | delete | delete the key and its writes (`client/src/components/user-macro-editor-dialog.tsx:223`) and the 6 test references |
| `userMacroInputSchema.label` | `contracts/src/preset/index.ts:2299` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `userMacroInputSchema.separator` | `contracts/src/preset/index.ts:2301` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `userMacroInputSchema.onValue` | `contracts/src/preset/index.ts:2302` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `userMacroInputSchema.offValue` | `contracts/src/preset/index.ts:2303` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `userMacroInputSchema.defaultValue` | `contracts/src/preset/index.ts:2304` | never-read | unknown | nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `userMacroSchema.strict` | `contracts/src/preset/index.ts:2316` | unreferenced | delete | delete the key and the 3 test references |
| `promptConfigSchema.namesBehavior` | `contracts/src/preset/index.ts:2392` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/engine/pipeline.ts:777` |
| `promptConfigSchema.continuePostfix` | `contracts/src/preset/index.ts:2393` | never-written | unknown | name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/domain/chat/engine/engine.ts:128` |
| `stPromptSchema.system_prompt` | `contracts/src/preset/index.ts:2959` | unreferenced | delete | delete the key |
| `stPromptSchema.marker` | `contracts/src/preset/index.ts:2960` | unreferenced | delete | delete the key |
| `stPresetSchema.prompt_order.character_id` | `contracts/src/preset/index.ts:2977` | unreferenced | delete | delete the key |
| `PresetDetail.schemaVersion` | `contracts/src/preset/index.ts:3663` | never-read | delete | delete the field and its writes (`server/src/domain/preset/substrate/views.ts:61`) |
| `StaleKnob.knob` | `contracts/src/preset/index.ts:3732` | never-read | delete | delete the field and its writes (`server/src/domain/preset/verbs/resolve-effective.ts:240`) and the 1 test reference |
| `StaleKnob.value` | `contracts/src/preset/index.ts:3733` | never-read | delete | delete the field and its writes (`server/src/domain/preset/verbs/resolve-effective.ts:240`) |
| `EffectivePreset.presetId` | `contracts/src/preset/index.ts:3757` | never-read | delete | delete the field and its writes (`server/src/domain/preset/verbs/resolve-effective.ts:255`) and the 4 test references |
| `ProseSlotDef.id` | `contracts/src/prose-slot/index.ts:29` | never-read | delete | delete the field and its writes (`contracts/src/preset/prose.ts:26`) and the 2 test references |
| `ProseSlotDef.macros` | `contracts/src/prose-slot/index.ts:35` | never-read | delete | delete the field and its writes (`contracts/src/preset/prose.ts:30`) |
| `ProseResolution.source` | `contracts/src/prose-slot/index.ts:329` | never-read | delete | delete the field and its writes (`contracts/src/prose-slot/index.ts:365`) |
| `ProseResolution.stale` | `contracts/src/prose-slot/index.ts:332` | never-read | delete | delete the field and its writes (`contracts/src/prose-slot/index.ts:365`) |
| `embedResultSchema.usage` | `contracts/src/providers/index.ts:32` | never-read | delete | delete the key and its writes (`inference/src/backends/google/embed.ts:161`) and the 1 test reference |
| `rerankResultSchema.model` | `contracts/src/providers/index.ts:52` | never-read | delete | delete the key and its writes (`inference/src/backends/local-light/tasks.ts:149`) and the 1 test reference |
| `rerankResultSchema.usage` | `contracts/src/providers/index.ts:53` | never-read | delete | delete the key and its writes (`inference/src/backends/local-light/tasks.ts:149`) |
| `rerankResultSchema.usage.totalTokens` | `contracts/src/providers/index.ts:55` | never-read | delete | delete the key and its writes (`inference/src/backends/local-light/tasks.ts:149`) |
| `imageEmbedResultSchema.usage` | `contracts/src/providers/index.ts:67` | never-read | delete | delete the key and its writes (`inference/src/backends/local-light/tasks.ts:260`) |
| `summarizeResultSchema.model` | `contracts/src/providers/index.ts:90` | never-read | delete | delete the key and its writes (`inference/src/roles/side-gen.ts:183`) |
| `generationCostSchema.tokensPrompt` | `contracts/src/providers/index.ts:106` | never-read | delete | delete the key and its writes (`inference/src/backends/openai-compat/diagnostics.ts:115`) |
| `generationCostSchema.tokensCompletion` | `contracts/src/providers/index.ts:107` | never-read | delete | delete the key and its writes (`inference/src/backends/openai-compat/diagnostics.ts:115`) |
| `verifyAuthAccountSchema.apiProvider` | `contracts/src/providers/index.ts:144` | unreferenced | delete | delete the key |
| `verifyAuthResultSchema.source` | `contracts/src/providers/index.ts:149` | never-read | delete | delete the key and its writes (`inference/src/backends/agent-sdk/catalog.ts:161`) |
| `verifyAuthResultSchema.model` | `contracts/src/providers/index.ts:154` | never-read | delete | delete the key and its writes (`inference/src/backends/agent-sdk/catalog.ts:161`) |

### Plugin API: keep unless no guest can reach it

Plugin guests use the published plugin surface from outside the tree, so the scan cannot see their reads, writes and calls. Delete a row only after proving no guest reaches it through the host ABI or the plugin SDK.

| Field | At | Kind | Class | Decision |
| - | - | - | - | - |
| `PluginInvocationLiveness.aborted` | `contracts/src/plugin/bridge.ts:31` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/infra/plugin-host/process-runtime.ts:243`) |
| `pluginFrameMintResponseSchema.expiresInMs` | `contracts/src/plugin/frame.ts:107` | unreferenced | unknown | keep unless no guest can reach it; else delete the key and the 3 test references |
| `PluginMessageView.id` | `contracts/src/plugin/host-v1.ts:43` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginMessageView.role` | `contracts/src/plugin/host-v1.ts:44` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginMessageView.authorDisplayName` | `contracts/src/plugin/host-v1.ts:46` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginMessageView.characterId` | `contracts/src/plugin/host-v1.ts:47` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginMessageView.seq` | `contracts/src/plugin/host-v1.ts:48` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 2 test references |
| `PluginMessageView.content` | `contracts/src/plugin/host-v1.ts:49` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 2 test references |
| `PluginCharacterView.id` | `contracts/src/plugin/host-v1.ts:59` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 2 test references |
| `PluginCharacterView.name` | `contracts/src/plugin/host-v1.ts:60` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginCharacterView.avatarAssetId` | `contracts/src/plugin/host-v1.ts:61` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginWorldEntryUpsert.position` | `contracts/src/plugin/host-v1.ts:87` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/infra/plugin-host/bridge-rpc.ts:232`) |
| `PluginWorldBookView.id` | `contracts/src/plugin/host-v1.ts:93` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginWorldBookView.name` | `contracts/src/plugin/host-v1.ts:94` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginWorldEntryView.id` | `contracts/src/plugin/host-v1.ts:101` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginWorldEntryView.keys` | `contracts/src/plugin/host-v1.ts:102` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginWorldEntryView.content` | `contracts/src/plugin/host-v1.ts:103` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginWorldEntryView.enabled` | `contracts/src/plugin/host-v1.ts:104` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginAssetView.mime` | `contracts/src/plugin/host-v1.ts:125` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginAssetView.sizeBytes` | `contracts/src/plugin/host-v1.ts:127` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginAssetView.dataBase64` | `contracts/src/plugin/host-v1.ts:132` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginSearchHit.documentId` | `contracts/src/plugin/host-v1.ts:144` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginSearchHit.documentName` | `contracts/src/plugin/host-v1.ts:145` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginSearchHit.content` | `contracts/src/plugin/host-v1.ts:146` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginSearchHit.score` | `contracts/src/plugin/host-v1.ts:147` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginHostV1.version` | `contracts/src/plugin/host-v1.ts:181` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.grants` | `contracts/src/plugin/host-v1.ts:183` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.clock` | `contracts/src/plugin/host-v1.ts:186` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.random` | `contracts/src/plugin/host-v1.ts:187` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.ids` | `contracts/src/plugin/host-v1.ts:188` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.log` | `contracts/src/plugin/host-v1.ts:190` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.tokens` | `contracts/src/plugin/host-v1.ts:207` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.chat` | `contracts/src/plugin/host-v1.ts:211` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.worldInfo` | `contracts/src/plugin/host-v1.ts:244` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.assets` | `contracts/src/plugin/host-v1.ts:260` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.search` | `contracts/src/plugin/host-v1.ts:270` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.variables` | `contracts/src/plugin/host-v1.ts:280` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.storage` | `contracts/src/plugin/host-v1.ts:288` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.notifications` | `contracts/src/plugin/host-v1.ts:318` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.imagery` | `contracts/src/plugin/host-v1.ts:326` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.llm` | `contracts/src/plugin/host-v1.ts:338` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.databank` | `contracts/src/plugin/host-v1.ts:369` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.character` | `contracts/src/plugin/host-v1.ts:386` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.events` | `contracts/src/plugin/host-v1.ts:449` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.pubsub` | `contracts/src/plugin/host-v1.ts:467` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.tools` | `contracts/src/plugin/host-v1.ts:479` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.transforms` | `contracts/src/plugin/host-v1.ts:495` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.macros` | `contracts/src/plugin/host-v1.ts:540` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.net` | `contracts/src/plugin/host-v1.ts:566` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginHostV1.ui` | `contracts/src/plugin/host-v1.ts:600` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `pluginLogInputSchema.limit` | `contracts/src/plugin/index.ts:239` | never-written | unknown | keep unless no guest can reach it; else name the outside writer if a parse fills it; otherwise delete the key and the default branch at `server/src/transport/trpc/routers/plugin.ts:260` |
| `pluginBuiltAgainstSchema.engineCommit` | `contracts/src/plugin/manifest.ts:230` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `ProviderManifestFields.capabilities` | `contracts/src/plugin/manifest.ts:297` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `pluginManifestSchema.entry` | `contracts/src/plugin/manifest.ts:368` | unreferenced | unknown | keep unless no guest can reach it; else delete the key and the 8 test references |
| `PluginInstanceCreateData.budgets` | `contracts/src/plugin/runtime-input.ts:17` | never-written | unknown | keep unless no guest can reach it; else delete the field and the branch that reads its default at `server/src/infra/plugin-host/port.ts:197` |
| `PluginBoundGridTile.id` | `contracts/src/plugin/ui.ts:749` | unreferenced | unknown | keep unless no guest can reach it; else delete the field and the 1 test reference |
| `PluginBoundGridTile.title` | `contracts/src/plugin/ui.ts:750` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginBoundGridTile.subtitle` | `contracts/src/plugin/ui.ts:751` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginBoundGridTile.badge` | `contracts/src/plugin/ui.ts:752` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginBoundGridTile.assetId` | `contracts/src/plugin/ui.ts:755` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginBoundGridTile.alt` | `contracts/src/plugin/ui.ts:756` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `PluginBoundGridTile.tags` | `contracts/src/plugin/ui.ts:758` | unreferenced | unknown | keep unless no guest can reach it; else delete the field |
| `stateBindingSchema.$state` | `contracts/src/plugin/ui.ts:854` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.rows.key` | `contracts/src/plugin/ui.ts:902` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.rows.value` | `contracts/src/plugin/ui.ts:902` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.options.value` | `contracts/src/plugin/ui.ts:936` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.options.label` | `contracts/src/plugin/ui.ts:936` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.id` | `contracts/src/plugin/ui.ts:973` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.title` | `contracts/src/plugin/ui.ts:974` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.subtitle` | `contracts/src/plugin/ui.ts:975` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.badge` | `contracts/src/plugin/ui.ts:976` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.assetId` | `contracts/src/plugin/ui.ts:977` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.bundleAsset` | `contracts/src/plugin/ui.ts:978` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.alt` | `contracts/src/plugin/ui.ts:979` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.tags` | `contracts/src/plugin/ui.ts:980` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.tiles.actionId` | `contracts/src/plugin/ui.ts:981` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.id` | `contracts/src/plugin/ui.ts:1013` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.kind` | `contracts/src/plugin/ui.ts:1014` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.title` | `contracts/src/plugin/ui.ts:1015` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.hero` | `contracts/src/plugin/ui.ts:1016` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.hero.assetId` | `contracts/src/plugin/ui.ts:1018` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.hero.assetFrom` | `contracts/src/plugin/ui.ts:1019` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.hero.bundleAsset` | `contracts/src/plugin/ui.ts:1020` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.hero.alt` | `contracts/src/plugin/ui.ts:1021` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginSurfaceNodeSchema.stages.body` | `contracts/src/plugin/ui.ts:1024` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginBoundKeyValueRowSchema.key` | `contracts/src/plugin/ui.ts:1327` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginBoundKeyValueRowSchema.value` | `contracts/src/plugin/ui.ts:1327` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginCommandArgSpecBaseSchema.required` | `contracts/src/plugin/ui.ts:1559` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginCommandArgSpecBaseSchema.describe` | `contracts/src/plugin/ui.ts:1560` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginUiOutcomeSchema.toasts.level` | `contracts/src/plugin/ui.ts:1781` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginUiOutcomeSchema.toasts.message` | `contracts/src/plugin/ui.ts:1781` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `PluginToolCardState.args` | `contracts/src/plugin/ui.ts:1868` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginToolCardState.result` | `contracts/src/plugin/ui.ts:1869` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginToolCardState.isError` | `contracts/src/plugin/ui.ts:1870` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginToolCardState.durationMs` | `contracts/src/plugin/ui.ts:1871` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `pluginViewSchema.origin` | `contracts/src/plugin/view.ts:24` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `pluginViewSchema.sourceUrl` | `contracts/src/plugin/view.ts:25` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `pluginViewSchema.sourceCommit` | `contracts/src/plugin/view.ts:26` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `pluginViewSchema.installedAt` | `contracts/src/plugin/view.ts:36` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `pluginViewSchema.updatedAt` | `contracts/src/plugin/view.ts:37` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginSurfaceView.pluginId` | `contracts/src/plugin/view.ts:45` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/domain/plugin/verbs/list-surfaces.ts:22`) and the 1 test reference |
| `PluginSurfaceView.toolWireName` | `contracts/src/plugin/view.ts:50` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/domain/plugin/verbs/list-surfaces.ts:28`) and the 1 test reference |
| `PluginDisplayTransformView.pluginId` | `contracts/src/plugin/view.ts:89` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/domain/plugin/verbs/list-display-transforms.ts:26`) and the 2 test references |
| `PluginDisplayTransformView.name` | `contracts/src/plugin/view.ts:90` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/domain/plugin/verbs/list-display-transforms.ts:26`) and the 1 test reference |
| `DistributedPluginView.distributedAt` | `contracts/src/plugin/view.ts:103` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/domain/plugin/persistence/distributed-plugins.ts:31`) and the 1 test reference |
| `DistributedPluginView.updatedAt` | `contracts/src/plugin/view.ts:104` | never-read | unknown | keep unless no guest can reach it; else delete the field and its writes (`server/src/domain/plugin/persistence/distributed-plugins.ts:32`) and the 1 test reference |
| `PluginFanoutSkip.userId` | `contracts/src/plugin/view.ts:128` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginFanoutSkip.userHandle` | `contracts/src/plugin/view.ts:129` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginFanoutSkip.reason` | `contracts/src/plugin/view.ts:130` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginFanoutResult.slug` | `contracts/src/plugin/view.ts:137` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginFanoutResult.name` | `contracts/src/plugin/view.ts:138` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginFanoutResult.version` | `contracts/src/plugin/view.ts:139` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginFanoutResult.applied` | `contracts/src/plugin/view.ts:140` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `PluginFanoutResult.skipped` | `contracts/src/plugin/view.ts:141` | never-read | unknown | keep unless no guest can reach it; else nothing reads this type's fields by name, so its value is handed on whole: find the slot it flows into, then derive that slot from this type or delete the unread fields |
| `pluginFanoutResultSchema.skipped.userId` | `contracts/src/plugin/view.ts:149` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginFanoutResultSchema.skipped.userHandle` | `contracts/src/plugin/view.ts:149` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |
| `pluginFanoutResultSchema.skipped.reason` | `contracts/src/plugin/view.ts:149` | unreferenced | unknown | keep unless no guest can reach it; else delete the key |

## Why

AGENTS.md: unwired code is a question about intent, and a second copy of a shape is a defect. Each row is dead inside live code that export-level liveness cannot see.

## Done when

Each row is applied as its decision says; `pnpm typecheck` passes for every world, the affected suites pass, and `pnpm unwired fields` no longer reports the row.

## Evidence

Judged from `reports/unwired/fields-tsapi.json` (`unwired`), not the stale table above. A row of the table that the fresh report no longer lists is not re-judged: the structural scan dropped it.

Deleted, with the writers:

- `ProseSlotDef.id` and `ProseSlotDef.macros`: the slot tables in `packages/contracts/src/*/prose.ts` and `imagery/index.ts`, `PROSE_MACRO_MODES`. The preset storage test reads the id from the registry key.
- `ProseResolution.source` and `ProseResolution.stale`: `resolveProseFrom`. `proseFooterState` derives its own staleness.
- `PresetDetail.schemaVersion`: `toPresetDetail`, the testkit factory and the contract test.
- `embedResultSchema.usage`, `imageEmbedResultSchema.usage`, `rerankResultSchema.model` and `.usage`, `summarizeResultSchema.model`: the Google, OpenAI-compatible, local-light and side-gen writers. Token accounting still flows through `recordBatch`.
- `generationCostSchema.tokensPrompt` and `.tokensCompletion`, `verifyAuthAccountSchema.apiProvider`, `verifyAuthResultSchema.source` and `.model`.

Kept, with the reader:

- `PortableEnvelope.schemaKind` and `.schemaVersion`: written by `envelopeOf` into every native file and read by string key in `packages/server/src/primitives/serde/lib/index.ts` (`raw["schemaKind"]`, the version walk). The on-disk format.
- `PortableEntity.ext`: read only by `tests/client/data/import-tree-plan.int.test.ts`. Owner call below.
- `RewriteToggle.slot` and `GreetingTransform.slot`: read through the structural `SteerCatalogEntry.slot` in `resolveSteerFragments` (`packages/contracts/src/prose/index.ts`). Prompt assembly.
- `EffectivePreset.presetId`: read by `tests/support/iso/corpus-library-relations.ts`, a testkit helper.
- The `userIntentSchema` knobs, `guidedActionConfigSchema.depth`, `templatedMarkerSection.forbidRoomOverride`, `choiceBlockSchema.defaultValue`, `promptConfigSchema.namesBehavior` and `.continuePostfix`: the report samples name the client editors that write them (`params-deck.tsx`, `params-limits.tsx`, `response-replay-controls.tsx`, `preset-editor-model.ts`, `template-drill-in.tsx`, `section-row.tsx`, `macro-picks-section.tsx`). Writers were taken from the report samples and not re-derived key by key.
- `userMacroArgSchema.description`: mirrors `MacroArgDef.description` in `packages/kit/src/macro/types.ts`, which is outside this item.
- `stPromptSchema.system_prompt`, `.marker`, `stPresetSchema.prompt_order.character_id`: SillyTavern foreign-format schema.
- `subscriptionErrorFrameSchema.__subscriptionError`: read with the `in` operator in `use-orb-socket.ts`, `use-guided-actions.ts` and `tooling/src/wire-tap/ops/sse.ts`. `okResultSchema.ok` is the acknowledgement.
- All rows under Plugin API: published surface. The host-only views in `plugin/view.ts`, `bridge.ts`, `frame.ts` and `index.ts` are not proven unreachable by guests.

Verification: `pnpm typecheck` on the contracts, inference, server, client, node and tests-dom programs, the targeted suites and the corpus republish named in the commit.

Owner call: `PortableEntity.ext` has only `tests/client/data/import-tree-plan.int.test.ts` as a reader. Delete it and derive the test file names from the exports, or keep it as the descriptor contract.
