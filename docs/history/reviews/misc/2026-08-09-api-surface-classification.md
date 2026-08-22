---
kind: review
status: complete
updated: 2026-08-09
---

# API-surface classification (`pnpm ast apisurface`)

> **Data report — drives an owner ruling, not a change.** This lane BUILT the `apisurface` verb
> (`scripts/codemods/ast.ts`) and RAN it tree-wide. No export was deleted, un-exported, or re-tagged. The
> per-package lists below are the input to a follow-up policy call (per package: delete UNUSED / un-export
> INTERNAL / keep PUBLIC) which the orchestrator/owner owns.

## What the verb answers

`orphans`/the push-tier ratchet are BINARY — an export is reached by *someone* or by *nobody*. So an export
imported all over its OWN package but by no other package reads exactly like a real cross-boundary API.
`apisurface` partitions every export by the **workspace package of its consumers**:

- **PUBLIC** — ≥1 PROD consumer in a DIFFERENT workspace package (or a `scripts/tooling` consumer). The real
  cross-boundary API. `(type-only)` when every cross-package consumer imported it as a TYPE.
- **INTERNAL** — consumed ONLY within its own package (a same-package importer, or a use in its own file). The
  barrel-bloat candidate: a module-private shape the `export` keyword buys nothing for.
- **UNUSED** — reached by nobody, prod or test: the `orphans` set verbatim (delegated to
  `collectOrphanCandidates`, so the two lenses can never disagree). `★` = star-suppressed (its file is
  `export *`-re-exported, so a namespace consumer of the barrel *might* reach it — reported, not a definite hit).
- **TEST-ONLY** — no prod consumer anywhere, but a test imports it (the `testonly` set). Cross-boundary yet NOT
  prod API — flagged distinctly so a PUBLIC count is a real prod-API count.

Reproduce: `pnpm ast apisurface <pkg-or-path>` (bare = all packages; `--public` also lists the PUBLIC rows;
`--json --max <n>` for the full machine dump). Keyed on the origin declaration node (a renaming barrel hop
cannot fork identity); mirrors `orphans`' err-alive arms (a namespace / dynamic import promotes the whole
target surface to reached).

## Instrument proof (this is a liveness verb; `instruments-lie` applies)

- **Per-class in-memory controls** (`tests/tooling/ast-lens.test.ts`, 6 new cases, all green): a planted
  cross-package importer → PUBLIC; a same-package importer AND an own-file use → INTERNAL (the exact arm a
  binary check cannot separate from PUBLIC); a type-only cross-package import → PUBLIC+typeOnly, cleared by a
  value import ANYWHERE; a test-only importer → TEST-ONLY; a fresh unconsumed export → UNUSED; a star-suppressed
  orphan (the refinery-twin shape) → UNUSED+starSuppressed; a cross-package namespace import → whole module PUBLIC.
- **UNUSED ≡ orphans, on the real tree.** `pnpm ast apisurface contracts` reports 42 UNUSED (5 star-suppressed);
  `pnpm ast orphans contracts` reports 37 hits + 5 star-suppressed = 42 candidates — identical set, by
  construction (the verb takes `collectOrphanCandidates` verbatim). The 5 star-suppressed are exactly the
  refinery twins below.
- **Known-real PUBLIC confirmed.** e.g. `db`'s `createDb` → PUBLIC (server + scripts/tooling), the schema
  tables → PUBLIC (server, scripts/tooling), `kit` macro engine → PUBLIC (server). Full receipts in the
  per-package runs.
- **Scanned-file count printed on every run** (`scanned 4852 source file(s)`) — a zero is legible as
  "searched", never "couldn't search".

## Tree-wide counts

8813 own-exports across 7 package buckets, scanned 4852 source files. (`★` = star-suppressed subset of UNUSED.)

| package | PUBLIC | INTERNAL | TEST-ONLY | UNUSED | total |
| - | - | - | - | - | - |
| `kit` | 257 | 77 | 1 | 2 | 337 |
| `contracts` | 999 | 312 | 30 | 42 (5★) | 1383 |
| `db` | 110 | 9 | 0 | 0 | 119 |
| `server` | 72 | 3736 | 42 | 2 | 3852 |
| `client` | 0 | 2401 | 28 | 1 | 2430 |
| `ui` | 188 | 449 | 43 | 6 | 686 |
| `(no-package)` | 1 | 3 | 0 | 2 | 6 |

**Reading the table.** PUBLIC is the healthy cross-boundary API. INTERNAL dominates `server` (3736) and
`client` (2401) because they are the TOP of the package cake — **nothing imports from `server`, and `client`
is the app root** — so "consumed only within its own package" is the architecturally-EXPECTED state there, not
barrel bloat. `ui` INTERNAL/UNUSED (449/6) is likewise its DESIGNED state: R2 of
`docs/architecture/core/ui-package-design.md` makes every `@orb/ui` export a sealed-surface handle that exists
to be available (the orphan ratchet exempts the whole package for this reason). The genuinely actionable
un-export surface is therefore the **shared lower-cake packages — `kit`, `contracts`, `db`** — where an
INTERNAL export is a real "could be module-private" candidate. Those three are listed in full below; `server`,
`client`, `ui` INTERNAL are counts-only with the reason above (dumping 6600 architecturally-normal rows would
bury the signal — reproduce any of them with `pnpm ast apisurface <pkg>` if a ruling needs them). UNUSED is
listed in FULL for every package (it is small and every row is a delete candidate).

## The headline: the 5 refinery `@public` twins (commit `02f0a91a0`)

All five land in **UNUSED (star-suppressed)** — the `@public` tag was masking orphan rot, not certifying an API.

| twin | site | class |
| - | - | - |
| `RenderHintRole` | `packages/contracts/src/refinery/schema-authoring.ts:62` | **UNUSED (★)** |
| `RefinerySchemaDocument` | `packages/contracts/src/refinery/schema-authoring.ts:235` | **UNUSED (★)** |
| `ForgePlanEnvelope` | `packages/contracts/src/refinery/schema-forge.ts:177` | **UNUSED (★)** |
| `ForgeFieldEnvelope` | `packages/contracts/src/refinery/schema-forge.ts:183` | **UNUSED (★)** |
| `ForgeHintEnvelope` | `packages/contracts/src/refinery/schema-forge.ts:205` | **UNUSED (★)** |

**Why "it didn't delete", answered from data.** Each twin is a bare `type X = z.infer<typeof schemaX>` /
`(typeof TUPLE)[number]`. The live consumers read the *value* (`schemaX.parse(...)`, `z.enum(TUPLE)`,
`projectJsonSchema(...)`) — never the *type alias*. So no import edge reaches the alias: it is an orphan. Its
declaring file (`schema-forge.ts` / `schema-authoring.ts`) IS `export *`-re-exported by `refinery/index.ts`,
which makes it **star-suppressed** — the orphan ratchet does not judge star-suppressed candidates (a namespace
consumer of the barrel could reach them), so the ratchet was silent on them either way. Tagging them `@public`
did not "save" a used API; it recorded a reason for a deliberately-unconsumed export and moved on. Per the
`@public` semantics, that is a legal (reason-bearing) exemption — but apisurface/orphans agree the alias has
**zero consumers of any kind**, so the tag is documenting rot, not surfacing API. The owner call: delete the 5
aliases (the value schemas/tuples they infer from stay — those ARE consumed and stay PUBLIC/INTERNAL), or keep
them as a deliberate future-client surface with the `@public` reason they already carry. This lane changed
nothing.

## UNUSED — full list, all packages (55 rows)

Every row is reached by nobody (prod or test) and unused in its own file — the delete candidates (`★` =
star-suppressed, verify a namespace/barrel consumer before deleting). This set is identical to
`pnpm ast orphans <pkg>` (hits + star-suppressed) per package.

- `useDeleteRefinerySchema` — `packages/client/src/features/refinery/hooks/use-refinery-schemas.ts:53`
- `default` — `packages/client/vite.config.ts:153`
- `ResolveBlobRefsParams` — `packages/contracts/src/assets/index.ts:148`
- `ResolveChatBlobRefsParams` — `packages/contracts/src/assets/index.ts:165`
- `AutomationTriggerBus` — `packages/contracts/src/automation/index.ts:61`
- `AutomationBusEventType` — `packages/contracts/src/automation/index.ts:344`
- `CardAsset` — `packages/contracts/src/character/index.ts:55`
- `TurnAbortedOpCode` — `packages/contracts/src/chat/bus.ts:132`
- `MessageMediaKind` — `packages/contracts/src/chat/content-blocks.ts:19`
- `MessageMediaSrc` — `packages/contracts/src/chat/content-blocks.ts:32`
- `participantKindSchema` — `packages/contracts/src/chat/participants.ts:24`
- `participantRoleSchema` — `packages/contracts/src/chat/roster.ts:28`
- `talkativenessSchema` — `packages/contracts/src/chat/roster.ts:61`
- `CharacterMemberSpec` — `packages/contracts/src/chat/roster.ts:91`
- `RosterMemberSpec` — `packages/contracts/src/chat/roster.ts:102`
- `inviteStatusSchema` — `packages/contracts/src/chat/roster.ts:405`
- `AcceptInviteInput` — `packages/contracts/src/chat/roster.ts:440`
- `ChunkParamsPin` — `packages/contracts/src/databank/index.ts:86`
- `userKindSchema` — `packages/contracts/src/identity/index.ts:21`
- `GeneratePictureRequest` — `packages/contracts/src/imagery/index.ts:224`
- `PersonaMetadataWrite` — `packages/contracts/src/persona/index.ts:53`
- `PluginInvocation` — `packages/contracts/src/plugin/host-v1.ts:58`
- `GuidedActionConfig` — `packages/contracts/src/preset/index.ts:390`
- `RefineryCustomStageConfig` — `packages/contracts/src/refinery/index.ts:270`
- `RefineryScoreConfig` — `packages/contracts/src/refinery/index.ts:275`
- `RefineryAnalyzeConfig` — `packages/contracts/src/refinery/index.ts:280`
- `RefineryFieldScore` — `packages/contracts/src/refinery/index.ts:354`
- `RenderHintRole` — `packages/contracts/src/refinery/schema-authoring.ts:62` · **star-suppressed**
- `RefinerySchemaDocument` — `packages/contracts/src/refinery/schema-authoring.ts:235` · **star-suppressed**
- `ForgePlanEnvelope` — `packages/contracts/src/refinery/schema-forge.ts:177` · **star-suppressed**
- `ForgeFieldEnvelope` — `packages/contracts/src/refinery/schema-forge.ts:183` · **star-suppressed**
- `ForgeHintEnvelope` — `packages/contracts/src/refinery/schema-forge.ts:205` · **star-suppressed**
- `RpgActorIdentityTextField` — `packages/contracts/src/rpg/actor.ts:269`
- `RpgWeatherType` — `packages/contracts/src/rpg/ambient.ts:49`
- `RpgCheckpointTrigger` — `packages/contracts/src/rpg/enums.ts:44`
- `RpgTrackerWrite` — `packages/contracts/src/rpg/enums.ts:67`
- `RpgTrackerSubject` — `packages/contracts/src/rpg/enums.ts:76`
- `rpgRelationshipKindSchema` — `packages/contracts/src/rpg/enums.ts:96`
- `rpgCyoaChoiceBehaviorSchema` — `packages/contracts/src/rpg/enums.ts:108`
- `RpgToolRoundToolName` — `packages/contracts/src/rpg/extraction.ts:412`
- `RpgPopulate` — `packages/contracts/src/rpg/extraction.ts:703`
- `RpgModeCapabilityAxis` — `packages/contracts/src/rpg/mode.ts:98`
- `RpgQuestAction` — `packages/contracts/src/rpg/tools.ts:184`
- `RollDiceArgs` — `packages/contracts/src/rpg/tools.ts:273`
- `default` — `packages/db/drizzle.config.ts:13`
- `OwnerStatId` — `packages/kit/src/ids/index.ts:165`
- `AA_LARGE_RATIO` — `packages/kit/src/theme-derivation/index.ts:55`
- `HostVersionUnservedError` — `packages/server/src/domain/plugin/contract/errors.ts:25`
- `AgentDialogKind` — `packages/server/src/infra/providers/contract/agent.ts:14`
- `AlertDialogHandle` — `packages/ui/src/primitives/alert-dialog/handle.ts:6`
- `DialogHandle` — `packages/ui/src/primitives/dialog/handle.ts:7`
- `DrawerHandle` — `packages/ui/src/primitives/drawer/handle.ts:6`
- `MenuHandle` — `packages/ui/src/primitives/menu/handle.ts:9`
- `PopoverHandle` — `packages/ui/src/primitives/popover/handle.ts:7`
- `TooltipHandle` — `packages/ui/src/primitives/tooltip/handle.ts:7`

## INTERNAL — the actionable lower-cake packages

Consumed only within their own package. The `via` note is a same-package consumer (or "own-file use" when the
export is only used inside its declaring module — the `export` keyword then buys nothing). These are un-export
/ make-module-private candidates for the owner ruling.

### kit — INTERNAL (77 rows)

- `CARD_FRAME_DELIVERIES` — `packages/kit/src/card-frame/index.ts:45` — via own-file use — packages/kit/src/card-frame/index.ts:45
- `CardFrameDelivery` — `packages/kit/src/card-frame/index.ts:46` — via own-file use — packages/kit/src/card-frame/index.ts:46
- `CardFrameContent` — `packages/kit/src/card-frame/index.ts:63` — via own-file use — packages/kit/src/card-frame/index.ts:63
- `CelParseError` — `packages/kit/src/cel/index.ts:32` — via own-file use — packages/kit/src/cel/index.ts:32
- `CelProgram` — `packages/kit/src/cel/index.ts:41` — via own-file use — packages/kit/src/cel/index.ts:41
- `TextChunk` — `packages/kit/src/chunk/index.ts:28` — via own-file use — packages/kit/src/chunk/index.ts:28
- `CHUNK_SEPARATORS` — `packages/kit/src/chunk/split.ts:11` — via own-file use — packages/kit/src/chunk/split.ts:11
- `Span` — `packages/kit/src/chunk/split.ts:18` — via own-file use — packages/kit/src/chunk/split.ts:18
- `splitRecursive` — `packages/kit/src/chunk/split.ts:91` — via packages/kit/src/chunk/index.ts:12
- `CONTENT_SPAN_KINDS` — `packages/kit/src/content/index.ts:65` — via own-file use — packages/kit/src/content/index.ts:65
- `HiddenTagDef` — `packages/kit/src/content/index.ts:72` — via own-file use — packages/kit/src/content/index.ts:72
- `DIRECTIVE_FENCE_NAMES` — `packages/kit/src/content/index.ts:89` — via own-file use — packages/kit/src/content/index.ts:89
- `DirectiveFenceName` — `packages/kit/src/content/index.ts:90` — via own-file use — packages/kit/src/content/index.ts:90
- `TokenizeContentOptions` — `packages/kit/src/content/index.ts:94` — via own-file use — packages/kit/src/content/index.ts:94
- `contentSpanRaw` — `packages/kit/src/content/index.ts:707` — via own-file use — packages/kit/src/content/index.ts:707
- `GhostContentSegment` — `packages/kit/src/content/index.ts:847` — via own-file use — packages/kit/src/content/index.ts:847
- `PREVIEW_MAX_CHARS` — `packages/kit/src/content/index.ts:951` — via own-file use — packages/kit/src/content/index.ts:951
- `CssValidationResult` — `packages/kit/src/css-validate/index.ts:20` — via own-file use — packages/kit/src/css-validate/index.ts:20
- `RpgPlotSteerKind` — `packages/kit/src/guided/index.ts:85` — via own-file use — packages/kit/src/guided/index.ts:85
- `GuidedGameSteerDef` — `packages/kit/src/guided/index.ts:93` — via own-file use — packages/kit/src/guided/index.ts:93
- `SniffedMime` — `packages/kit/src/image-sniff/index.ts:32` — via own-file use — packages/kit/src/image-sniff/index.ts:32
- `resolveInjectionPlacement` — `packages/kit/src/injection/index.ts:54` — via packages/kit/src/persona/index.ts:3
- `LIFTABLE_JSON_SCHEMA` — `packages/kit/src/json-schema/lift.ts:28` — via own-file use — packages/kit/src/json-schema/lift.ts:28
- `MAX_LIFT_DEPTH` — `packages/kit/src/json-schema/lift.ts:68` — via own-file use — packages/kit/src/json-schema/lift.ts:68
- `WIRE_SCHEMA_MODES` — `packages/kit/src/json-schema/wire-subset.ts:55` — via own-file use — packages/kit/src/json-schema/wire-subset.ts:55
- `WireSchemaMode` — `packages/kit/src/json-schema/wire-subset.ts:56` — via own-file use — packages/kit/src/json-schema/wire-subset.ts:56
- `WIRE_SUBSETS` — `packages/kit/src/json-schema/wire-subset.ts:176` — via own-file use — packages/kit/src/json-schema/wire-subset.ts:176
- `WireSchemaScrub` — `packages/kit/src/json-schema/wire-subset.ts:265` — via own-file use — packages/kit/src/json-schema/wire-subset.ts:265
- `BUILTIN_MACRO_METADATA` — `packages/kit/src/macro/builtin-metadata.ts:37` — via packages/kit/src/macro/registry.ts:4
- `ZWSP` — `packages/kit/src/macro/content.ts:18` — via own-file use — packages/kit/src/macro/content.ts:18
- `neutralizeMacros` — `packages/kit/src/macro/content.ts:19` — via packages/kit/src/guided/index.ts:2
- `IdentityMapping` — `packages/kit/src/macro/content.ts:25` — via own-file use — packages/kit/src/macro/content.ts:25
- `TrimContentOptions` — `packages/kit/src/macro/content.ts:46` — via own-file use — packages/kit/src/macro/content.ts:46
- `trimContent` — `packages/kit/src/macro/content.ts:65` — via packages/kit/src/macro/engine.ts:6
- `evaluateMacros` — `packages/kit/src/macro/evaluator.ts:198` — via packages/kit/src/macro/engine.ts:7
- `CheckMacroArgsOptions` — `packages/kit/src/macro/metadata.ts:31` — via own-file use — packages/kit/src/macro/metadata.ts:31
- `checkMacroArgs` — `packages/kit/src/macro/metadata.ts:67` — via packages/kit/src/macro/evaluator.ts:1
- `applyArgDefaults` — `packages/kit/src/macro/metadata.ts:95` — via packages/kit/src/macro/evaluator.ts:1
- `macroArgDiagnostics` — `packages/kit/src/macro/metadata.ts:113` — via packages/kit/src/macro/evaluator.ts:1
- `SimpleMacroRegistry` — `packages/kit/src/macro/registry.ts:34` — via own-file use — packages/kit/src/macro/registry.ts:34
- `MacroNode` — `packages/kit/src/macro/types.ts:6` — via packages/kit/src/macro/parser.ts:12
- `TextNode` — `packages/kit/src/macro/types.ts:8` — via own-file use — packages/kit/src/macro/types.ts:8
- `MacroSpan` — `packages/kit/src/macro/types.ts:16` — via packages/kit/src/macro/metadata.ts:7
- `MacroFlagKey` — `packages/kit/src/macro/types.ts:56` — via packages/kit/src/macro/parser.ts:12
- `MacroFlags` — `packages/kit/src/macro/types.ts:61` — via packages/kit/src/macro/evaluator.ts:2
- `MACRO_CATEGORIES` — `packages/kit/src/macro/types.ts:63` — via own-file use — packages/kit/src/macro/types.ts:63
- `MacroCategory` — `packages/kit/src/macro/types.ts:74` — via packages/kit/src/macro/builtin-metadata.ts:10
- `MacroArgDef` — `packages/kit/src/macro/types.ts:94` — via packages/kit/src/macro/builtin-metadata.ts:10
- `MacroListSpec` — `packages/kit/src/macro/types.ts:107` — via packages/kit/src/macro/builtin-metadata.ts:10
- `MacroArgViolationKind` — `packages/kit/src/macro/types.ts:122` — via own-file use — packages/kit/src/macro/types.ts:122
- `MacroArgViolation` — `packages/kit/src/macro/types.ts:124` — via packages/kit/src/macro/metadata.ts:7
- `MacroMetadataInput` — `packages/kit/src/macro/types.ts:163` — via packages/kit/src/macro/builtin-metadata.ts:10
- `MacroCallNode` — `packages/kit/src/macro/types.ts:165` — via packages/kit/src/macro/evaluator.ts:2
- `GlobalVarWrite` — `packages/kit/src/macro/types.ts:237` — via own-file use — packages/kit/src/macro/types.ts:237
- `MacroResolveOptions` — `packages/kit/src/macro/types.ts:378` — via own-file use — packages/kit/src/macro/types.ts:378
- `MacroBudget` — `packages/kit/src/macro/types.ts:386` — via packages/kit/src/macro/engine.ts:10
- `MacroHandler` — `packages/kit/src/macro/types.ts:394` — via packages/kit/src/macro/evaluator.ts:2
- `MacroRegisterOptions` — `packages/kit/src/macro/types.ts:410` — via packages/kit/src/macro/registry.ts:5
- `UserMacroInputOption` — `packages/kit/src/macro/user-macros.ts:39` — via own-file use — packages/kit/src/macro/user-macros.ts:39
- `UserMacroInputValueBag` — `packages/kit/src/macro/user-macros.ts:92` — via own-file use — packages/kit/src/macro/user-macros.ts:92
- `ResolveUserMacroInputsOptions` — `packages/kit/src/macro/user-macros.ts:94` — via own-file use — packages/kit/src/macro/user-macros.ts:94
- `ResolvedUserMacroInputs` — `packages/kit/src/macro/user-macros.ts:102` — via own-file use — packages/kit/src/macro/user-macros.ts:102
- `RegisterUserMacrosOptions` — `packages/kit/src/macro/user-macros.ts:189` — via own-file use — packages/kit/src/macro/user-macros.ts:189
- `USER_MACRO_CONTENT_BINDING` — `packages/kit/src/macro/user-macros.ts:227` — via own-file use — packages/kit/src/macro/user-macros.ts:227
- `applyVarOp` — `packages/kit/src/macro/variables.ts:14` — via packages/kit/src/macro/registry.ts:6
- `RegexExecuteOptions` — `packages/kit/src/regex/index.ts:257` — via own-file use — packages/kit/src/regex/index.ts:257
- `ExecuteRegexScriptsArgs` — `packages/kit/src/regex/index.ts:277` — via own-file use — packages/kit/src/regex/index.ts:277
- `ReplayBuffer` — `packages/kit/src/replay-buffer/index.ts:23` — via own-file use — packages/kit/src/replay-buffer/index.ts:23
- `LEADING_SPEAKER_TAG` — `packages/kit/src/speaker-label/index.ts:11` — via own-file use — packages/kit/src/speaker-label/index.ts:11
- `SpeakerSpan` — `packages/kit/src/speaker-label/index.ts:26` — via own-file use — packages/kit/src/speaker-label/index.ts:26
- `stripInlineSpeakerLabel` — `packages/kit/src/speaker-label/index.ts:227` — via own-file use — packages/kit/src/speaker-label/index.ts:227
- `truncateAtForeignLabel` — `packages/kit/src/speaker-label/index.ts:242` — via own-file use — packages/kit/src/speaker-label/index.ts:242
- `Rgb` — `packages/kit/src/theme-derivation/index.ts:58` — via own-file use — packages/kit/src/theme-derivation/index.ts:58
- `derivedForegroundLightness` — `packages/kit/src/theme-derivation/index.ts:148` — via own-file use — packages/kit/src/theme-derivation/index.ts:148
- `rampSurface` — `packages/kit/src/theme-derivation/index.ts:160` — via own-file use — packages/kit/src/theme-derivation/index.ts:160
- `TimeLibConfig` — `packages/kit/src/time/index.ts:92` — via own-file use — packages/kit/src/time/index.ts:92
- `keyRegex` — `packages/kit/src/world-info/index.ts:80` — via own-file use — packages/kit/src/world-info/index.ts:80

### db — INTERNAL (9 rows)

- `LibSqlWrap` — `packages/db/src/client/index.ts:38` — via own-file use — packages/db/src/client/index.ts:38
- `BaselineCheck` — `packages/db/src/client/index.ts:338` — via own-file use — packages/db/src/client/index.ts:338
- `optimizeDb` — `packages/db/src/client/index.ts:440` — via own-file use — packages/db/src/client/index.ts:440
- `vector32` — `packages/db/src/custom-types/index.ts:26` — via packages/db/src/schema/discovery.ts:65
- `DbBatchInput` — `packages/db/src/kit/batch.ts:31` — via own-file use — packages/db/src/kit/batch.ts:31
- `CONSTRAINT_KINDS` — `packages/db/src/kit/db-errors.ts:12` — via own-file use — packages/db/src/kit/db-errors.ts:12
- `ConstraintKind` — `packages/db/src/kit/db-errors.ts:13` — via own-file use — packages/db/src/kit/db-errors.ts:13
- `ConstraintViolation` — `packages/db/src/kit/db-errors.ts:16` — via own-file use — packages/db/src/kit/db-errors.ts:16
- `OwnedColumns` — `packages/db/src/kit/fetch-owned.ts:17` — via own-file use — packages/db/src/kit/fetch-owned.ts:17

### contracts — INTERNAL (312 rows)

Many are sub-schemas / const tuples composed into a bigger schema in a sibling contracts file (legit
composition — un-exporting requires the consumer to move or import relatively) or used only in their own
barrel. The owner ruling prices each; this is the raw candidate set.

- `VARIANT_KINDS` — `packages/contracts/src/assets/index.ts:27` — via own-file use — packages/contracts/src/assets/index.ts:27
- `characterIdSchema` — `packages/contracts/src/assets/index.ts:66` — via own-file use — packages/contracts/src/assets/index.ts:66
- `ASSET_LIST_LIMIT_MIN` — `packages/contracts/src/assets/index.ts:79` — via own-file use — packages/contracts/src/assets/index.ts:79
- `AUTOMATION_ACTION_TYPES` — `packages/contracts/src/automation/index.ts:156` — via own-file use — packages/contracts/src/automation/index.ts:156
- `AUTOMATION_ACTION_ARMS_MIN` — `packages/contracts/src/automation/index.ts:183` — via own-file use — packages/contracts/src/automation/index.ts:183
- `AUTOMATION_ACTION_ARMS_MAX` — `packages/contracts/src/automation/index.ts:184` — via own-file use — packages/contracts/src/automation/index.ts:184
- `automationActionSchema` — `packages/contracts/src/automation/index.ts:186` — via own-file use — packages/contracts/src/automation/index.ts:186
- `triggerFactSchema` — `packages/contracts/src/automation/index.ts:261` — via own-file use — packages/contracts/src/automation/index.ts:261
- `AutomationEmitSource` — `packages/contracts/src/automation/index.ts:330` — via own-file use — packages/contracts/src/automation/index.ts:330
- `AUTOMATION_PROSE_SLOTS` — `packages/contracts/src/automation/prose.ts:16` — via packages/contracts/src/prose/index.ts:28
- `CARD_FACE_LIMITS` — `packages/contracts/src/card-face/index.ts:24` — via own-file use — packages/contracts/src/card-face/index.ts:24
- `cardFaceFields` — `packages/contracts/src/card-face/index.ts:28` — via packages/contracts/src/character/index.ts:9
- `CARD_SPECS` — `packages/contracts/src/character/index.ts:35` — via own-file use — packages/contracts/src/character/index.ts:35
- `cardSpecSchema` — `packages/contracts/src/character/index.ts:36` — via own-file use — packages/contracts/src/character/index.ts:36
- `cardAssetSchema` — `packages/contracts/src/character/index.ts:46` — via own-file use — packages/contracts/src/character/index.ts:46
- `greetingSchema` — `packages/contracts/src/character/index.ts:98` — via own-file use — packages/contracts/src/character/index.ts:98
- `characterCardSchema` — `packages/contracts/src/character/index.ts:112` — via own-file use — packages/contracts/src/character/index.ts:112
- `AssembleDepthNote` — `packages/contracts/src/chat/assemble.ts:32` — via own-file use — packages/contracts/src/chat/assemble.ts:32
- `CHAT_INJECTION_ORIGINS` — `packages/contracts/src/chat/assemble.ts:109` — via own-file use — packages/contracts/src/chat/assemble.ts:109
- `SHAPE_BREAKPOINT_DECISIONS` — `packages/contracts/src/chat/assemble.ts:247` — via own-file use — packages/contracts/src/chat/assemble.ts:247
- `SHAPE_ROW_SOURCES` — `packages/contracts/src/chat/assemble.ts:263` — via own-file use — packages/contracts/src/chat/assemble.ts:263
- `SentPrompt` — `packages/contracts/src/chat/assemble.ts:376` — via own-file use — packages/contracts/src/chat/assemble.ts:376
- `CHAT_WARNING_CODES` — `packages/contracts/src/chat/bus.ts:63` — via own-file use — packages/contracts/src/chat/bus.ts:63
- `TURN_INTENTS` — `packages/contracts/src/chat/bus.ts:118` — via own-file use — packages/contracts/src/chat/bus.ts:118
- `TURN_ABORT_REASONS` — `packages/contracts/src/chat/bus.ts:122` — via own-file use — packages/contracts/src/chat/bus.ts:122
- `PROMPT_TRANSFORM_POINTS` — `packages/contracts/src/chat/bus.ts:167` — via packages/contracts/src/automation/index.ts:14
- `messageMediaKindSchema` — `packages/contracts/src/chat/content-blocks.ts:17` — via own-file use — packages/contracts/src/chat/content-blocks.ts:17
- `cardTrustSchema` — `packages/contracts/src/chat/content-blocks.ts:22` — via own-file use — packages/contracts/src/chat/content-blocks.ts:22
- `CardTrust` — `packages/contracts/src/chat/content-blocks.ts:23` — via own-file use — packages/contracts/src/chat/content-blocks.ts:23
- `messageMediaSrcSchema` — `packages/contracts/src/chat/content-blocks.ts:27` — via own-file use — packages/contracts/src/chat/content-blocks.ts:27
- `ContentClassPolicy` — `packages/contracts/src/chat/content-classes.ts:24` — via own-file use — packages/contracts/src/chat/content-classes.ts:24
- `messageSlotSchema` — `packages/contracts/src/chat/messages.ts:27` — via own-file use — packages/contracts/src/chat/messages.ts:27
- `standaloneVariableDeltaSchema` — `packages/contracts/src/chat/messages.ts:80` — via own-file use — packages/contracts/src/chat/messages.ts:80
- `macroFreezeSchema` — `packages/contracts/src/chat/messages.ts:100` — via own-file use — packages/contracts/src/chat/messages.ts:100
- `memberCardVisibilitySchema` — `packages/contracts/src/chat/metadata.ts:54` — via own-file use — packages/contracts/src/chat/metadata.ts:54
- `groupPolicySchema` — `packages/contracts/src/chat/metadata.ts:68` — via own-file use — packages/contracts/src/chat/metadata.ts:68
- `GUIDED_STEER_INPUT_MAX` — `packages/contracts/src/chat/metadata.ts:209` — via own-file use — packages/contracts/src/chat/metadata.ts:209
- `AI_DRIVEN_KINDS` — `packages/contracts/src/chat/participants.ts:29` — via own-file use — packages/contracts/src/chat/participants.ts:29
- `USER_BACKED_KINDS` — `packages/contracts/src/chat/participants.ts:30` — via own-file use — packages/contracts/src/chat/participants.ts:30
- `CAST_KINDS` — `packages/contracts/src/chat/producers.ts:22` — via own-file use — packages/contracts/src/chat/producers.ts:22
- `CastCharacterEntry` — `packages/contracts/src/chat/producers.ts:31` — via own-file use — packages/contracts/src/chat/producers.ts:31
- `CastPersonaEntry` — `packages/contracts/src/chat/producers.ts:41` — via own-file use — packages/contracts/src/chat/producers.ts:41
- `CHAT_PROSE_SLOTS` — `packages/contracts/src/chat/prose.ts:74` — via packages/contracts/src/prose/index.ts:29
- `characterMemberSpecSchema` — `packages/contracts/src/chat/roster.ts:84` — via own-file use — packages/contracts/src/chat/roster.ts:84
- `rosterMemberSpecSchema` — `packages/contracts/src/chat/roster.ts:100` — via own-file use — packages/contracts/src/chat/roster.ts:100
- `CarriedBackground` — `packages/contracts/src/chat/roster.ts:281` — via own-file use — packages/contracts/src/chat/roster.ts:281
- `InviteStatus` — `packages/contracts/src/chat/roster.ts:403` — via own-file use — packages/contracts/src/chat/roster.ts:403
- `CHAT_APIS` — `packages/contracts/src/connection/index.ts:17` — via own-file use — packages/contracts/src/connection/index.ts:17
- `chatApiSchema` — `packages/contracts/src/connection/index.ts:19` — via packages/contracts/src/settings/index.ts:9
- `REASONING_MODES` — `packages/contracts/src/connection/index.ts:71` — via own-file use — packages/contracts/src/connection/index.ts:71
- `reasoningModeSchema` — `packages/contracts/src/connection/index.ts:73` — via own-file use — packages/contracts/src/connection/index.ts:73
- `effortLevelSchema` — `packages/contracts/src/connection/index.ts:79` — via own-file use — packages/contracts/src/connection/index.ts:79
- `VERBOSITY_LEVELS` — `packages/contracts/src/connection/index.ts:82` — via packages/contracts/src/preset/index.ts:20
- `verbositySchema` — `packages/contracts/src/connection/index.ts:84` — via own-file use — packages/contracts/src/connection/index.ts:84
- `REASONING_DISPLAY_MODES` — `packages/contracts/src/connection/index.ts:87` — via own-file use — packages/contracts/src/connection/index.ts:87
- `reasoningDisplayModeSchema` — `packages/contracts/src/connection/index.ts:89` — via own-file use — packages/contracts/src/connection/index.ts:89
- `roleHandlingSchema` — `packages/contracts/src/connection/index.ts:95` — via packages/contracts/src/preset/index.ts:20
- `rangeSchema` — `packages/contracts/src/connection/index.ts:99` — via own-file use — packages/contracts/src/connection/index.ts:99
- `modelCapabilitySchema` — `packages/contracts/src/connection/index.ts:104` — via own-file use — packages/contracts/src/connection/index.ts:104
- `CHAT_UNAVAILABLE_CAUSES` — `packages/contracts/src/connection/index.ts:350` — via own-file use — packages/contracts/src/connection/index.ts:350
- `CRED_SOURCES` — `packages/contracts/src/credentials/index.ts:18` — via own-file use — packages/contracts/src/credentials/index.ts:18
- `customOpenAiResponseMapSchema` — `packages/contracts/src/credentials/index.ts:32` — via own-file use — packages/contracts/src/credentials/index.ts:32
- `scraperKindSchema` — `packages/contracts/src/databank/index.ts:30` — via own-file use — packages/contracts/src/databank/index.ts:30
- `documentIdSchema` — `packages/contracts/src/databank/index.ts:35` — via packages/contracts/src/workloads/params.ts:15
- `chunkParamsSchema` — `packages/contracts/src/databank/index.ts:73` — via packages/contracts/src/settings/index.ts:11
- `ChunkParamsWire` — `packages/contracts/src/databank/index.ts:79` — via own-file use — packages/contracts/src/databank/index.ts:79
- `databankRetrievalSettingsSchema` — `packages/contracts/src/databank/index.ts:89` — via packages/contracts/src/settings/index.ts:11
- `databankSettingsSchema` — `packages/contracts/src/databank/index.ts:96` — via own-file use — packages/contracts/src/databank/index.ts:96
- `INGEST_OUTCOMES` — `packages/contracts/src/databank/index.ts:181` — via own-file use — packages/contracts/src/databank/index.ts:181
- `ComputeThemesWorkloadParams` — `packages/contracts/src/discovery/index.ts:33` — via packages/contracts/src/workloads/params.ts:16
- `FindDuplicatesWorkloadParams` — `packages/contracts/src/discovery/index.ts:40` — via packages/contracts/src/workloads/params.ts:16
- `DISCOVERY_PROSE_SLOTS` — `packages/contracts/src/discovery/prose.ts:57` — via packages/contracts/src/prose/index.ts:30
- `DOMAIN_EVENT_TYPES` — `packages/contracts/src/events/index.ts:19` — via own-file use — packages/contracts/src/events/index.ts:19
- `DomainEventType` — `packages/contracts/src/events/index.ts:20` — via packages/contracts/src/automation/index.ts:15
- `DOC_FORMATS` — `packages/contracts/src/extraction/index.ts:15` — via own-file use — packages/contracts/src/extraction/index.ts:15
- `ExtractionMeta` — `packages/contracts/src/extraction/index.ts:19` — via own-file use — packages/contracts/src/extraction/index.ts:19
- `GLOBAL_ACTIONS` — `packages/contracts/src/identity/index.ts:59` — via own-file use — packages/contracts/src/identity/index.ts:59
- `CHAT_ACTIONS` — `packages/contracts/src/identity/index.ts:63` — via own-file use — packages/contracts/src/identity/index.ts:63
- `GlobalResource` — `packages/contracts/src/identity/index.ts:78` — via own-file use — packages/contracts/src/identity/index.ts:78
- `ChatResource` — `packages/contracts/src/identity/index.ts:82` — via own-file use — packages/contracts/src/identity/index.ts:82
- `EXTRACTION_MODES` — `packages/contracts/src/imagery/index.ts:31` — via own-file use — packages/contracts/src/imagery/index.ts:31
- `MULTIMODAL_MODES` — `packages/contracts/src/imagery/index.ts:36` — via own-file use — packages/contracts/src/imagery/index.ts:36
- `IMAGERY_PROSE_SLOTS` — `packages/contracts/src/imagery/index.ts:96` — via packages/contracts/src/prose/index.ts:31
- `IMAGERY_TEMPLATE_SLOT_IDS` — `packages/contracts/src/imagery/index.ts:187` — via packages/contracts/src/prose/index.ts:31
- `IMAGERY_CAPTION_SLOT_IDS` — `packages/contracts/src/imagery/index.ts:196` — via packages/contracts/src/prose/index.ts:31
- `SIZE_PRESET_NAMES` — `packages/contracts/src/imagery/index.ts:204` — via own-file use — packages/contracts/src/imagery/index.ts:204
- `CLIP_KINDS` — `packages/contracts/src/memory/index.ts:13` — via own-file use — packages/contracts/src/memory/index.ts:13
- `CLIP_SOURCE_KINDS` — `packages/contracts/src/memory/index.ts:20` — via own-file use — packages/contracts/src/memory/index.ts:20
- `CLIP_SCOPES` — `packages/contracts/src/memory/index.ts:26` — via own-file use — packages/contracts/src/memory/index.ts:26
- `NOTIFICATION_RECIPIENTS` — `packages/contracts/src/notifications/index.ts:28` — via packages/contracts/src/automation/index.ts:17
- `personaMetadataWriteSchema` — `packages/contracts/src/persona/index.ts:44` — via own-file use — packages/contracts/src/persona/index.ts:44
- `ChatHandle` — `packages/contracts/src/plugin/host-v1.ts:20` — via own-file use — packages/contracts/src/plugin/host-v1.ts:20
- `PluginVariableOp` — `packages/contracts/src/plugin/host-v1.ts:43` — via own-file use — packages/contracts/src/plugin/host-v1.ts:43
- `PluginHostV1` — `packages/contracts/src/plugin/host-v1.ts:64` — via own-file use — packages/contracts/src/plugin/host-v1.ts:64
- `pluginBuiltAgainstSchema` — `packages/contracts/src/plugin/manifest.ts:76` — via own-file use — packages/contracts/src/plugin/manifest.ts:76
- `PORTABLE_PARSE_FAILURES` — `packages/contracts/src/portability/index.ts:78` — via own-file use — packages/contracts/src/portability/index.ts:78
- `SIDE_GEN_KINDS` — `packages/contracts/src/preset/index.ts:109` — via own-file use — packages/contracts/src/preset/index.ts:109
- `EFFORT_LEVELS` — `packages/contracts/src/preset/index.ts:185` — via own-file use — packages/contracts/src/preset/index.ts:185
- `effortLevelSchema` — `packages/contracts/src/preset/index.ts:187` — via own-file use — packages/contracts/src/preset/index.ts:187
- `generationKnobSchemas` — `packages/contracts/src/preset/index.ts:241` — via own-file use — packages/contracts/src/preset/index.ts:241
- `GUIDED_IMPERSONATE_PERSONS` — `packages/contracts/src/preset/index.ts:342` — via packages/contracts/src/chat/metadata.ts:11
- `guidedActionKindSchema` — `packages/contracts/src/preset/index.ts:344` — via packages/contracts/src/chat/metadata.ts:11
- `guidedActionConfigSchema` — `packages/contracts/src/preset/index.ts:371` — via own-file use — packages/contracts/src/preset/index.ts:371
- `guidedActionsSchema` — `packages/contracts/src/preset/index.ts:392` — via own-file use — packages/contracts/src/preset/index.ts:392
- `GuidedActionsConfig` — `packages/contracts/src/preset/index.ts:422` — via own-file use — packages/contracts/src/preset/index.ts:422
- `RewriteToggle` — `packages/contracts/src/preset/index.ts:463` — via own-file use — packages/contracts/src/preset/index.ts:463
- `REWRITE_TOGGLE_IDS` — `packages/contracts/src/preset/index.ts:474` — via packages/contracts/src/chat/metadata.ts:11
- `GreetingTransform` — `packages/contracts/src/preset/index.ts:518` — via own-file use — packages/contracts/src/preset/index.ts:518
- `customParametersSchema` — `packages/contracts/src/preset/index.ts:602` — via own-file use — packages/contracts/src/preset/index.ts:602
- `PLAIN_MARKERS` — `packages/contracts/src/preset/index.ts:626` — via own-file use — packages/contracts/src/preset/index.ts:626
- `promptSectionSchema` — `packages/contracts/src/preset/index.ts:711` — via own-file use — packages/contracts/src/preset/index.ts:711
- `FormatStringKey` — `packages/contracts/src/preset/index.ts:737` — via own-file use — packages/contracts/src/preset/index.ts:737
- `choiceBlockSchema` — `packages/contracts/src/preset/index.ts:1916` — via own-file use — packages/contracts/src/preset/index.ts:1916
- `MAX_USER_MACROS` — `packages/contracts/src/preset/index.ts:1945` — via packages/contracts/src/rpg/config.ts:9
- `userMacroInputValueSchema` — `packages/contracts/src/preset/index.ts:2005` — via own-file use — packages/contracts/src/preset/index.ts:2005
- `formatStringsSchema` — `packages/contracts/src/preset/index.ts:2030` — via own-file use — packages/contracts/src/preset/index.ts:2030
- `promptConfigSchema` — `packages/contracts/src/preset/index.ts:2038` — via own-file use — packages/contracts/src/preset/index.ts:2038
- `POST_PROCESS_LANE` — `packages/contracts/src/preset/index.ts:2111` — via own-file use — packages/contracts/src/preset/index.ts:2111
- `ProseCarrierToken` — `packages/contracts/src/preset/index.ts:2183` — via own-file use — packages/contracts/src/preset/index.ts:2183
- `CONFIG_LIFTS` — `packages/contracts/src/preset/index.ts:2312` — via own-file use — packages/contracts/src/preset/index.ts:2312
- `promptConfigConfig` — `packages/contracts/src/preset/index.ts:2525` — via own-file use — packages/contracts/src/preset/index.ts:2525
- `ParsePresetResult` — `packages/contracts/src/preset/index.ts:3072` — via own-file use — packages/contracts/src/preset/index.ts:3072
- `PRESET_PROSE_SLOTS` — `packages/contracts/src/preset/prose.ts:24` — via packages/contracts/src/preset/index.ts:24
- `PRESET_REWRITE_TOGGLE_PROSE_SLOTS` — `packages/contracts/src/preset/prose.ts:188` — via packages/contracts/src/prose/index.ts:32
- `PRESET_GREETING_TRANSFORM_PROSE_SLOTS` — `packages/contracts/src/preset/prose.ts:271` — via packages/contracts/src/prose/index.ts:32
- `PRESET_COMPACTION_SLOT_ID` — `packages/contracts/src/preset/prose.ts:445` — via packages/contracts/src/preset/index.ts:24
- `PROSE_HOMES` — `packages/contracts/src/prose-slot/index.ts:18` — via own-file use — packages/contracts/src/prose-slot/index.ts:18
- `ProseHome` — `packages/contracts/src/prose-slot/index.ts:19` — via packages/contracts/src/prose/index.ts:33
- `PROSE_MACRO_MODES` — `packages/contracts/src/prose-slot/index.ts:24` — via own-file use — packages/contracts/src/prose-slot/index.ts:24
- `ProseMacroMode` — `packages/contracts/src/prose-slot/index.ts:25` — via own-file use — packages/contracts/src/prose-slot/index.ts:25
- `ProseSlotDef` — `packages/contracts/src/prose-slot/index.ts:28` — via packages/contracts/src/automation/prose.ts:14
- `proseSlotIdSchema` — `packages/contracts/src/prose-slot/index.ts:244` — via own-file use — packages/contracts/src/prose-slot/index.ts:244
- `proseOverrideSchema` — `packages/contracts/src/prose-slot/index.ts:277` — via own-file use — packages/contracts/src/prose-slot/index.ts:277
- `proseOverridesSchema` — `packages/contracts/src/prose-slot/index.ts:286` — via packages/contracts/src/preset/index.ts:22
- `ProseResolution` — `packages/contracts/src/prose-slot/index.ts:296` — via packages/contracts/src/prose/index.ts:33
- `LEGACY_PROSE_BASE_VERSION` — `packages/contracts/src/prose-slot/index.ts:308` — via own-file use — packages/contracts/src/prose-slot/index.ts:308
- `proseOverrideFromLegacy` — `packages/contracts/src/prose-slot/index.ts:311` — via packages/contracts/src/prose/index.ts:34
- `resolveProseFrom` — `packages/contracts/src/prose-slot/index.ts:332` — via packages/contracts/src/prose/index.ts:34
- `spliceProseTokens` — `packages/contracts/src/prose-slot/index.ts:364` — via packages/contracts/src/prose/index.ts:34
- `hasProseToken` — `packages/contracts/src/prose-slot/index.ts:383` — via packages/contracts/src/preset/index.ts:22
- `PRESET_PROSE_SLOT_IDS` — `packages/contracts/src/prose/index.ts:94` — via own-file use — packages/contracts/src/prose/index.ts:94
- `SteerCatalogEntry` — `packages/contracts/src/prose/index.ts:151` — via own-file use — packages/contracts/src/prose/index.ts:151
- `embedResultSchema` — `packages/contracts/src/providers/index.ts:24` — via own-file use — packages/contracts/src/providers/index.ts:24
- `rerankHitSchema` — `packages/contracts/src/providers/index.ts:34` — via own-file use — packages/contracts/src/providers/index.ts:34
- `rerankResultSchema` — `packages/contracts/src/providers/index.ts:46` — via own-file use — packages/contracts/src/providers/index.ts:46
- `imageEmbedResultSchema` — `packages/contracts/src/providers/index.ts:60` — via own-file use — packages/contracts/src/providers/index.ts:60
- `summarizeResultItemSchema` — `packages/contracts/src/providers/index.ts:67` — via own-file use — packages/contracts/src/providers/index.ts:67
- `summarizeResultSchema` — `packages/contracts/src/providers/index.ts:81` — via own-file use — packages/contracts/src/providers/index.ts:81
- `accountCreditsSchema` — `packages/contracts/src/providers/index.ts:91` — via own-file use — packages/contracts/src/providers/index.ts:91
- `generationCostSchema` — `packages/contracts/src/providers/index.ts:99` — via own-file use — packages/contracts/src/providers/index.ts:99
- `endpointInspectionSchema` — `packages/contracts/src/providers/index.ts:109` — via own-file use — packages/contracts/src/providers/index.ts:109
- `verifyAuthAccountSchema` — `packages/contracts/src/providers/index.ts:135` — via own-file use — packages/contracts/src/providers/index.ts:135
- `verifyAuthResultSchema` — `packages/contracts/src/providers/index.ts:145` — via own-file use — packages/contracts/src/providers/index.ts:145
- `SCORE_MIN` — `packages/contracts/src/refinery/core.ts:10` — via packages/contracts/src/refinery/index.ts:32
- `REFINERY_VERDICTS` — `packages/contracts/src/refinery/core.ts:16` — via packages/contracts/src/refinery/schema-authoring.ts:29
- `REFINERY_SCORE_MODES` — `packages/contracts/src/refinery/index.ts:177` — via own-file use — packages/contracts/src/refinery/index.ts:177
- `refineryScoreModeSchema` — `packages/contracts/src/refinery/index.ts:179` — via own-file use — packages/contracts/src/refinery/index.ts:179
- `REFINERY_REWRITE_MODES` — `packages/contracts/src/refinery/index.ts:181` — via own-file use — packages/contracts/src/refinery/index.ts:181
- `refineryRewriteModeSchema` — `packages/contracts/src/refinery/index.ts:183` — via own-file use — packages/contracts/src/refinery/index.ts:183
- `REFINERY_ANALYZE_MODES` — `packages/contracts/src/refinery/index.ts:185` — via own-file use — packages/contracts/src/refinery/index.ts:185
- `refineryAnalyzeModeSchema` — `packages/contracts/src/refinery/index.ts:187` — via own-file use — packages/contracts/src/refinery/index.ts:187
- `RefineryScoreFixedConfig` — `packages/contracts/src/refinery/index.ts:247` — via own-file use — packages/contracts/src/refinery/index.ts:247
- `RefineryRewriteConfig` — `packages/contracts/src/refinery/index.ts:253` — via own-file use — packages/contracts/src/refinery/index.ts:253
- `RefineryAnalyzeFixedConfig` — `packages/contracts/src/refinery/index.ts:259` — via own-file use — packages/contracts/src/refinery/index.ts:259
- `refineryScoreConfigSchema` — `packages/contracts/src/refinery/index.ts:273` — via own-file use — packages/contracts/src/refinery/index.ts:273
- `refineryAnalyzeConfigSchema` — `packages/contracts/src/refinery/index.ts:278` — via own-file use — packages/contracts/src/refinery/index.ts:278
- `RefineryManualRewriteConfig` — `packages/contracts/src/refinery/index.ts:319` — via own-file use — packages/contracts/src/refinery/index.ts:319
- `refineryFieldScoreSchema` — `packages/contracts/src/refinery/index.ts:338` — via own-file use — packages/contracts/src/refinery/index.ts:338
- `refineryScorePayloadSchema` — `packages/contracts/src/refinery/index.ts:356` — via own-file use — packages/contracts/src/refinery/index.ts:356
- `refineryAnalyzePayloadSchema` — `packages/contracts/src/refinery/index.ts:451` — via packages/contracts/src/character/index.ts:10
- `payloadSchemaFor` — `packages/contracts/src/refinery/index.ts:478` — via own-file use — packages/contracts/src/refinery/index.ts:478
- `RefineScoreSweepWorkloadParams` — `packages/contracts/src/refinery/index.ts:516` — via packages/contracts/src/workloads/params.ts:17
- `refineryRunSchema` — `packages/contracts/src/refinery/index.ts:581` — via own-file use — packages/contracts/src/refinery/index.ts:581
- `refinerySessionSummarySchema` — `packages/contracts/src/refinery/index.ts:623` — via own-file use — packages/contracts/src/refinery/index.ts:623
- `REFINERY_PROSE_SLOTS` — `packages/contracts/src/refinery/prose.ts:246` — via packages/contracts/src/prose/index.ts:35
- `REFINERY_ADVISORY_CODES` — `packages/contracts/src/refinery/schema-advisory.ts:44` — via own-file use — packages/contracts/src/refinery/schema-advisory.ts:44
- `RefineryAdvisoryCode` — `packages/contracts/src/refinery/schema-advisory.ts:45` — via own-file use — packages/contracts/src/refinery/schema-advisory.ts:45
- `RefinerySchemaAdvisory` — `packages/contracts/src/refinery/schema-advisory.ts:48` — via own-file use — packages/contracts/src/refinery/schema-advisory.ts:48
- `RefinerySchemaStats` — `packages/contracts/src/refinery/schema-advisory.ts:56` — via own-file use — packages/contracts/src/refinery/schema-advisory.ts:56
- `RefinerySchemaAssessment` — `packages/contracts/src/refinery/schema-advisory.ts:65` — via own-file use — packages/contracts/src/refinery/schema-advisory.ts:65
- `REFINERY_SCHEMA_NAME_PATTERN` — `packages/contracts/src/refinery/schema-authoring.ts:35` — via own-file use — packages/contracts/src/refinery/schema-authoring.ts:35
- `REFINERY_SCHEMA_NAME_MAX` — `packages/contracts/src/refinery/schema-authoring.ts:36` — via packages/contracts/src/refinery/schema-forge.ts:59
- `REFINERY_SCHEMA_MAX_DEPTH` — `packages/contracts/src/refinery/schema-authoring.ts:40` — via packages/contracts/src/refinery/schema-forge.ts:59
- `REFINERY_SCHEMA_MAX_PROPERTIES` — `packages/contracts/src/refinery/schema-authoring.ts:42` — via packages/contracts/src/refinery/schema-forge.ts:59
- `REFINERY_SCHEMA_MAX_ENUM` — `packages/contracts/src/refinery/schema-authoring.ts:44` — via packages/contracts/src/refinery/schema-forge.ts:59
- `RENDER_HINT_TONES` — `packages/contracts/src/refinery/schema-authoring.ts:54` — via packages/contracts/src/refinery/schema-forge.ts:59
- `RENDER_HINT_ROLES` — `packages/contracts/src/refinery/schema-authoring.ts:58` — via packages/contracts/src/refinery/schema-forge.ts:59
- `renderHintSchema` — `packages/contracts/src/refinery/schema-authoring.ts:72` — via own-file use — packages/contracts/src/refinery/schema-authoring.ts:72
- `refinerySchemaSummarySchema` — `packages/contracts/src/refinery/schema-authoring.ts:239` — via own-file use — packages/contracts/src/refinery/schema-authoring.ts:239
- `FORGE_FIELD_TYPES` — `packages/contracts/src/refinery/schema-forge.ts:94` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:94
- `ForgeFieldType` — `packages/contracts/src/refinery/schema-forge.ts:95` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:95
- `REFINERY_FORGE_MAX_FIELDS` — `packages/contracts/src/refinery/schema-forge.ts:99` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:99
- `REFINERY_FORGE_MAX_PATH_SEGMENTS` — `packages/contracts/src/refinery/schema-forge.ts:105` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:105
- `forgeFieldRowSchema` — `packages/contracts/src/refinery/schema-forge.ts:113` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:113
- `REFINERY_FORGE_MAX_PLAN_FIELDS` — `packages/contracts/src/refinery/schema-forge.ts:161` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:161
- `forgeHintRowSchema` — `packages/contracts/src/refinery/schema-forge.ts:188` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:188
- `ForgeHintRow` — `packages/contracts/src/refinery/schema-forge.ts:199` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:199
- `REFINERY_FORGE_CORE_NODES` — `packages/contracts/src/refinery/schema-forge.ts:220` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:220
- `ForgeTranspileDrop` — `packages/contracts/src/refinery/schema-forge.ts:245` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:245
- `ForgeTranspileResult` — `packages/contracts/src/refinery/schema-forge.ts:252` — via own-file use — packages/contracts/src/refinery/schema-forge.ts:252
- `regexHistoryDepthSchema` — `packages/contracts/src/regex/index.ts:67` — via own-file use — packages/contracts/src/regex/index.ts:67
- `regexScriptSchema` — `packages/contracts/src/regex/index.ts:134` — via own-file use — packages/contracts/src/regex/index.ts:134
- `structuredOutputVehicleSchema` — `packages/contracts/src/role-clients/index.ts:36` — via packages/contracts/src/settings/index.ts:16
- `responseFormatSchema` — `packages/contracts/src/role-clients/index.ts:44` — via own-file use — packages/contracts/src/role-clients/index.ts:44
- `rpgCastRefSchema` — `packages/contracts/src/rpg/actor.ts:62` — via packages/contracts/src/rpg/inputs.ts:19
- `rpgInventoryItemSchema` — `packages/contracts/src/rpg/actor.ts:96` — via own-file use — packages/contracts/src/rpg/actor.ts:96
- `rpgRelationshipSchema` — `packages/contracts/src/rpg/actor.ts:124` — via own-file use — packages/contracts/src/rpg/actor.ts:124
- `rpgActorIdentitySchema` — `packages/contracts/src/rpg/actor.ts:141` — via own-file use — packages/contracts/src/rpg/actor.ts:141
- `rpgActorVolatileSchema` — `packages/contracts/src/rpg/actor.ts:213` — via own-file use — packages/contracts/src/rpg/actor.ts:213
- `RPG_ACTOR_OP_FIELDS` — `packages/contracts/src/rpg/actor.ts:251` — via own-file use — packages/contracts/src/rpg/actor.ts:251
- `RPG_ACTOR_IDENTITY_TEXT_FIELDS` — `packages/contracts/src/rpg/actor.ts:258` — via own-file use — packages/contracts/src/rpg/actor.ts:258
- `rpgActorOpSchema` — `packages/contracts/src/rpg/actor.ts:290` — via packages/contracts/src/rpg/inputs.ts:19
- `rpgWeatherTypeSchema` — `packages/contracts/src/rpg/ambient.ts:50` — via own-file use — packages/contracts/src/rpg/ambient.ts:50
- `rpgWeatherLabelSchema` — `packages/contracts/src/rpg/ambient.ts:57` — via packages/contracts/src/rpg/tools.ts:25
- `TimeOfDay` — `packages/contracts/src/rpg/ambient.ts:95` — via own-file use — packages/contracts/src/rpg/ambient.ts:95
- `TIME_OF_DAY_RANGES` — `packages/contracts/src/rpg/ambient.ts:122` — via own-file use — packages/contracts/src/rpg/ambient.ts:122
- `timeOfDayAtHour` — `packages/contracts/src/rpg/ambient.ts:150` — via own-file use — packages/contracts/src/rpg/ambient.ts:150
- `RPG_BUS_EVENT_TYPES` — `packages/contracts/src/rpg/bus.ts:62` — via own-file use — packages/contracts/src/rpg/bus.ts:62
- `rpgGameFeaturesSchema` — `packages/contracts/src/rpg/config.ts:43` — via own-file use — packages/contracts/src/rpg/config.ts:43
- `RPG_FOLD_FALLBACK_REASONS` — `packages/contracts/src/rpg/config.ts:127` — via own-file use — packages/contracts/src/rpg/config.ts:127
- `RPG_DELIVERY_PATHS` — `packages/contracts/src/rpg/config.ts:139` — via own-file use — packages/contracts/src/rpg/config.ts:139
- `RPG_DATE_MODES` — `packages/contracts/src/rpg/config.ts:173` — via packages/contracts/src/rpg/inputs.ts:20
- `RpgGameMode` — `packages/contracts/src/rpg/enums.ts:14` — via packages/contracts/src/rpg/mode.ts:17
- `rpgGameModeSchema` — `packages/contracts/src/rpg/enums.ts:15` — via packages/contracts/src/rpg/inputs.ts:29
- `RpgGameStatus` — `packages/contracts/src/rpg/enums.ts:20` — via packages/contracts/src/rpg/views.ts:11
- `RPG_QUEST_STATUSES` — `packages/contracts/src/rpg/enums.ts:24` — via packages/contracts/src/rpg/snapshot.ts:17
- `rpgQuestStatusSchema` — `packages/contracts/src/rpg/enums.ts:26` — via packages/contracts/src/rpg/inputs.ts:29
- `RPG_TRACKER_SHAPES` — `packages/contracts/src/rpg/enums.ts:55` — via packages/contracts/src/rpg/tracker.ts:25
- `RPG_TRACKER_WRITES` — `packages/contracts/src/rpg/enums.ts:63` — via packages/contracts/src/rpg/tracker.ts:25
- `RPG_TRACKER_SUBJECTS` — `packages/contracts/src/rpg/enums.ts:72` — via packages/contracts/src/rpg/tracker.ts:25
- `RPG_TRACKER_CARRIER_CLASSES` — `packages/contracts/src/rpg/enums.ts:82` — via packages/contracts/src/rpg/tracker.ts:25
- `RPG_CYOA_CHOICE_BEHAVIORS` — `packages/contracts/src/rpg/enums.ts:103` — via packages/contracts/src/rpg/config.ts:10
- `ExtractionPromptContext` — `packages/contracts/src/rpg/extraction-prompt.ts:52` — via own-file use — packages/contracts/src/rpg/extraction-prompt.ts:52
- `ExtractionPlanePrompt` — `packages/contracts/src/rpg/extraction-prompt.ts:78` — via own-file use — packages/contracts/src/rpg/extraction-prompt.ts:78
- `EXTRACTION_PLANE_PROMPTS` — `packages/contracts/src/rpg/extraction-prompt.ts:126` — via own-file use — packages/contracts/src/rpg/extraction-prompt.ts:126
- `RPG_TOOL_ROUND_TOOL_NAMES` — `packages/contracts/src/rpg/extraction.ts:400` — via own-file use — packages/contracts/src/rpg/extraction.ts:400
- `RpgExtractionDropPlane` — `packages/contracts/src/rpg/extraction.ts:546` — via own-file use — packages/contracts/src/rpg/extraction.ts:546
- `RpgExtractionDrop` — `packages/contracts/src/rpg/extraction.ts:550` — via own-file use — packages/contracts/src/rpg/extraction.ts:550
- `RpgExtractionSalvage` — `packages/contracts/src/rpg/extraction.ts:563` — via own-file use — packages/contracts/src/rpg/extraction.ts:563
- `rpgPopulateSheetSchema` — `packages/contracts/src/rpg/extraction.ts:685` — via own-file use — packages/contracts/src/rpg/extraction.ts:685
- `RpgPopulateSheet` — `packages/contracts/src/rpg/extraction.ts:689` — via own-file use — packages/contracts/src/rpg/extraction.ts:689
- `RpgPopulateSalvage` — `packages/contracts/src/rpg/extraction.ts:708` — via own-file use — packages/contracts/src/rpg/extraction.ts:708
- `RpgMalformedToolCall` — `packages/contracts/src/rpg/extraction.ts:800` — via own-file use — packages/contracts/src/rpg/extraction.ts:800
- `RpgModePolicy` — `packages/contracts/src/rpg/mode.ts:21` — via own-file use — packages/contracts/src/rpg/mode.ts:21
- `rpgStatAttributeDefSchema` — `packages/contracts/src/rpg/profile.ts:20` — via own-file use — packages/contracts/src/rpg/profile.ts:20
- `rpgStatResolutionSchema` — `packages/contracts/src/rpg/profile.ts:32` — via own-file use — packages/contracts/src/rpg/profile.ts:32
- `RpgStatResolution` — `packages/contracts/src/rpg/profile.ts:33` — via own-file use — packages/contracts/src/rpg/profile.ts:33
- `RPG_PACKAGED_PROFILES` — `packages/contracts/src/rpg/profile.ts:72` — via own-file use — packages/contracts/src/rpg/profile.ts:72
- `RPG_PROFILE_SPECIAL` — `packages/contracts/src/rpg/profile.ts:118` — via own-file use — packages/contracts/src/rpg/profile.ts:118
- `RPG_SEED_HP_MAX` — `packages/contracts/src/rpg/profile.ts:163` — via own-file use — packages/contracts/src/rpg/profile.ts:163
- `RPG_PROSE_SLOTS` — `packages/contracts/src/rpg/prose.ts:42` — via packages/contracts/src/prose/index.ts:36
- `rpgPlotActSchema` — `packages/contracts/src/rpg/snapshot.ts:29` — via own-file use — packages/contracts/src/rpg/snapshot.ts:29
- `rpgQuestObjectiveSchema` — `packages/contracts/src/rpg/snapshot.ts:47` — via own-file use — packages/contracts/src/rpg/snapshot.ts:47
- `RPG_SNAPSHOT_STATE_PLANES` — `packages/contracts/src/rpg/snapshot.ts:115` — via own-file use — packages/contracts/src/rpg/snapshot.ts:115
- `RPG_LITE_TOOL_NAMES` — `packages/contracts/src/rpg/tools.ts:32` — via packages/contracts/src/rpg/mode.ts:19
- `RpgToolName` — `packages/contracts/src/rpg/tools.ts:41` — via packages/contracts/src/rpg/mode.ts:18
- `RPG_QUEST_ACTIONS` — `packages/contracts/src/rpg/tools.ts:179` — via own-file use — packages/contracts/src/rpg/tools.ts:179
- `RPG_JOURNAL_TYPE_FALLBACK` — `packages/contracts/src/rpg/tools.ts:238` — via own-file use — packages/contracts/src/rpg/tools.ts:238
- `rpgTrackerAppliesToSchema` — `packages/contracts/src/rpg/tracker.ts:51` — via own-file use — packages/contracts/src/rpg/tracker.ts:51
- `RpgTrackerAppliesTo` — `packages/contracts/src/rpg/tracker.ts:52` — via own-file use — packages/contracts/src/rpg/tracker.ts:52
- `rpgTrackerValueSchema` — `packages/contracts/src/rpg/tracker.ts:100` — via packages/contracts/src/rpg/actor.ts:28
- `RpgTrackerCarrierKind` — `packages/contracts/src/rpg/tracker.ts:140` — via own-file use — packages/contracts/src/rpg/tracker.ts:140
- `trackerAppliesToCarrier` — `packages/contracts/src/rpg/tracker.ts:156` — via own-file use — packages/contracts/src/rpg/tracker.ts:156
- `carriesTracker` — `packages/contracts/src/rpg/tracker.ts:166` — via own-file use — packages/contracts/src/rpg/tracker.ts:166
- `RpgTrackerWriteGroup` — `packages/contracts/src/rpg/tracker.ts:214` — via packages/contracts/src/rpg/extraction.ts:54
- `actorTrackerWriteKeys` — `packages/contracts/src/rpg/tracker.ts:250` — via packages/contracts/src/rpg/extraction.ts:55
- `trackerGloss` — `packages/contracts/src/rpg/tracker.ts:303` — via own-file use — packages/contracts/src/rpg/tracker.ts:303
- `logLevelSchema` — `packages/contracts/src/settings/index.ts:30` — via own-file use — packages/contracts/src/settings/index.ts:30
- `memoryDefaultsSchema` — `packages/contracts/src/settings/index.ts:90` — via own-file use — packages/contracts/src/settings/index.ts:90
- `GEN_PRESENCE_PENALTY_MIN` — `packages/contracts/src/settings/index.ts:142` — via own-file use — packages/contracts/src/settings/index.ts:142
- `GEN_PRESENCE_PENALTY_MAX` — `packages/contracts/src/settings/index.ts:143` — via own-file use — packages/contracts/src/settings/index.ts:143
- `memorySummarizerSchema` — `packages/contracts/src/settings/index.ts:144` — via own-file use — packages/contracts/src/settings/index.ts:144
- `RATE_LIMIT_CAP_MAX` — `packages/contracts/src/settings/index.ts:178` — via own-file use — packages/contracts/src/settings/index.ts:178
- `rateLimitsSchema` — `packages/contracts/src/settings/index.ts:180` — via own-file use — packages/contracts/src/settings/index.ts:180
- `vllmConcurrencySchema` — `packages/contracts/src/settings/index.ts:209` — via own-file use — packages/contracts/src/settings/index.ts:209
- `agentSdkConcurrencySchema` — `packages/contracts/src/settings/index.ts:218` — via own-file use — packages/contracts/src/settings/index.ts:218
- `engineLaunchSchema` — `packages/contracts/src/settings/index.ts:243` — via own-file use — packages/contracts/src/settings/index.ts:243
- `appSettingsConfig` — `packages/contracts/src/settings/index.ts:419` — via own-file use — packages/contracts/src/settings/index.ts:419
- `GENERATE_IMAGE_SOURCES` — `packages/contracts/src/settings/index.ts:446` — via own-file use — packages/contracts/src/settings/index.ts:446
- `ImagerySettings` — `packages/contracts/src/settings/index.ts:688` — via own-file use — packages/contracts/src/settings/index.ts:688
- `DEFAULT_BLUR_SURFACES` — `packages/contracts/src/settings/index.ts:783` — via own-file use — packages/contracts/src/settings/index.ts:783
- `SURFACE_TEXTURES` — `packages/contracts/src/settings/index.ts:792` — via own-file use — packages/contracts/src/settings/index.ts:792
- `backgroundLibraryEntrySchema` — `packages/contracts/src/settings/index.ts:803` — via own-file use — packages/contracts/src/settings/index.ts:803
- `userSettingsSchema` — `packages/contracts/src/settings/index.ts:929` — via own-file use — packages/contracts/src/settings/index.ts:929
- `userSettingsConfig` — `packages/contracts/src/settings/index.ts:1083` — via own-file use — packages/contracts/src/settings/index.ts:1083
- `statsDeltaSchema` — `packages/contracts/src/stats/index.ts:15` — via own-file use — packages/contracts/src/stats/index.ts:15
- `streamRoomRefSchema` — `packages/contracts/src/stream/index.ts:43` — via own-file use — packages/contracts/src/stream/index.ts:43
- `TAG_TARGET_TYPES` — `packages/contracts/src/tag/index.ts:14` — via own-file use — packages/contracts/src/tag/index.ts:14
- `themeSchema` — `packages/contracts/src/theme/index.ts:53` — via own-file use — packages/contracts/src/theme/index.ts:53
- `MaterializedBackgroundAsset` — `packages/contracts/src/theme/materialize.ts:14` — via own-file use — packages/contracts/src/theme/materialize.ts:14
- `BACKGROUND_MATERIALIZE_FAILURES` — `packages/contracts/src/theme/materialize.ts:23` — via own-file use — packages/contracts/src/theme/materialize.ts:23
- `BackgroundMaterializeFailure` — `packages/contracts/src/theme/materialize.ts:24` — via own-file use — packages/contracts/src/theme/materialize.ts:24
- `THEME_KEY_REACHES` — `packages/contracts/src/theme/override.ts:77` — via own-file use — packages/contracts/src/theme/override.ts:77
- `ThemeKeyReach` — `packages/contracts/src/theme/override.ts:78` — via own-file use — packages/contracts/src/theme/override.ts:78
- `CardEmbeddableThemeKey` — `packages/contracts/src/theme/override.ts:101` — via own-file use — packages/contracts/src/theme/override.ts:101
- `ViewerSacredThemeKey` — `packages/contracts/src/theme/override.ts:103` — via own-file use — packages/contracts/src/theme/override.ts:103
- `CARD_EMBEDDABLE_THEME_KEYS` — `packages/contracts/src/theme/override.ts:108` — via own-file use — packages/contracts/src/theme/override.ts:108
- `CardEmbeddableTheme` — `packages/contracts/src/theme/override.ts:117` — via packages/contracts/src/chat/roster.ts:13
- `SeededBackground` — `packages/contracts/src/theme/seeded-backgrounds.ts:13` — via own-file use — packages/contracts/src/theme/seeded-backgrounds.ts:13
- `EffectiveUploadOverrides` — `packages/contracts/src/uploads/index.ts:76` — via own-file use — packages/contracts/src/uploads/index.ts:76
- `VersionedConfigDef` — `packages/contracts/src/versioned-config/index.ts:17` — via own-file use — packages/contracts/src/versioned-config/index.ts:17
- `VersionedConfig` — `packages/contracts/src/versioned-config/index.ts:28` — via own-file use — packages/contracts/src/versioned-config/index.ts:28
- `defineVersionedConfig` — `packages/contracts/src/versioned-config/index.ts:46` — via packages/contracts/src/preset/index.ts:23
- `indexSourceSchema` — `packages/contracts/src/workloads/axes.ts:47` — via packages/contracts/src/workloads/params.ts:19
- `WorkloadModePolicy` — `packages/contracts/src/workloads/axes.ts:61` — via own-file use — packages/contracts/src/workloads/axes.ts:61
- `WORKLOAD_RESUME_POLICIES` — `packages/contracts/src/workloads/execution.ts:26` — via own-file use — packages/contracts/src/workloads/execution.ts:26
- `NoWorkloadParams` — `packages/contracts/src/workloads/params.ts:24` — via own-file use — packages/contracts/src/workloads/params.ts:24
- `StartWorkloadEnvelope` — `packages/contracts/src/workloads/params.ts:124` — via own-file use — packages/contracts/src/workloads/params.ts:124
- `WORLD_INFO_SCOPES` — `packages/contracts/src/world-info/index.ts:27` — via own-file use — packages/contracts/src/world-info/index.ts:27
- `worldInfoScopeSchema` — `packages/contracts/src/world-info/index.ts:28` — via own-file use — packages/contracts/src/world-info/index.ts:28
- `loreEntryProvenanceSchema` — `packages/contracts/src/world-info/index.ts:51` — via own-file use — packages/contracts/src/world-info/index.ts:51
- `entryMetadataWriteSchema` — `packages/contracts/src/world-info/index.ts:83` — via own-file use — packages/contracts/src/world-info/index.ts:83

## `server` / `client` / `ui` INTERNAL — counts only (with reason)

Not listed here (3736 + 2401 + 449 =
6586 rows). `server` and `client` are
the top of the package cake — nothing imports from `server`, `client` is the app root — so INTERNAL is the
expected state, not barrel bloat. `ui` is R2-sealed (every export exists to be available). Reproduce any of
these with `pnpm ast apisurface server` / `client` / `ui` if a ruling needs the rows. Their UNUSED and
TEST-ONLY rows ARE captured above / are reproducible the same way.

## Recommendation: close the `@public`-parks-an-orphan hole in `orphan-export-ratchet` (report-only; gate build is a follow-up)

**The open rot vector, quantified.** The ratchet catches ONE `@public` rot direction — its `staleTags` arm
reds a `@public` tag on an export that GAINED a prod consumer (the "deliberately unconsumed" claim gone
false; it fired this morning on 3 tags). The OTHER direction is open: the ratchet's orphan arm EXEMPTS
anything `@public`-tagged, so a `@public` tag on a genuinely-UNUSED export is a permanent parking permit that
hides a delete-candidate forever. apisurface measures how wide the hole is:

- The ratchet baseline (`scripts/verify/orphan-export-ratchet.baseline.json`) is **empty** — and green — not
  because there is no orphan rot in scope, but because **every in-scope orphan is exempt.** apisurface finds
  **47 UNUSED exports in the ratchet's scope** (kit/contracts/db/server/client), and every one is exempt:
  **42 by a `@public` tag**, **5 by star-suppression** (the refinery twins). There are **zero** plain orphans
  in scope (the 8 plain orphans apisurface finds are all in `ui` — R2-exempt — or are config `default`
  exports outside the scope). So the ratchet's clean orphan arm is entirely the exemptions doing the work; the
  `@public` exemption alone is carrying 42 delete-candidates.

**The key fact apisurface establishes.** A `@public` tag in the ratchet ONLY ever lands on an UNUSED export.
A cross-package-consumed export is not an orphan candidate at all (nothing to exempt), and a `@public` tag
that HAS a prod consumer is already red via `staleTags`. So `@public` is not certifying "cross-package API" —
apisurface confirms all 42 currently-exempt tags sit on exports with **zero consumers of any kind** (no
cross-package, no same-package prod, no test). The tag is certifying "intended-but-unconsumed", and its only
guard is a prose reason a barrels lane can write for genuine rot as easily as for real future API.

**Proposed gate rule (uses apisurface's PUBLIC/INTERNAL/UNUSED split).** Split the single `@public`
exemption into two reason-bearing markers — the same two-marker discipline the `unwired` lens already uses
(`@server-only:` / `@test-fixture:`), each two-sided from birth:

- `@public-future: <names the unbuilt consumer/surface>` — a deliberately-unconsumed export waiting for a
  NAMED, not-yet-built consumer (e.g. `PluginInvocation` "the membrane does not deliver it yet";
  `memory/index.ts`'s `ClipKind` "lands with the memory domain"; the rpg "full-mode" locked shapes). Exempt
  from the orphan arm. **Two-sided:** when apisurface later classifies it PUBLIC or INTERNAL (a consumer
  arrived), the marker is STALE → red ("it has a consumer now; drop the future marker") — the existing
  `staleTags` transition, generalized.
- `@public-twin: <names the consumed value it is the named spelling of>` — a type alias / schema whose VALUE
  is consumed but whose ALIAS nobody imports (the twin-conformance class: `RenderHintRole` =
  `(typeof RENDER_HINT_ROLES)[number]`, `ChunkParamsPin` a compile-time assignability pin, the 5 refinery
  twins). Exempt. **Two-sided:** red if the gate cannot find the NAMED value itself consumed (then even the
  twin is dead), or if the alias gains its own importer.
- **A bare `@public: <reason>` on an apisurface-UNUSED export → RED**, with the remedy "migrate to
  `@public-future:`/`@public-twin:` naming the specific target, or DELETE it." This converts an open-ended
  parking permit into a named, re-challengeable claim — the gate can verify the named target (a future
  consumer that arrives flips the export to PUBLIC and reds the future-marker; a twin whose value is dead
  reds the twin-marker), which a prose reason can never be checked against.
- **Genuine PUBLIC stays untouched** — it is never an orphan candidate, so it never carries or needs a tag;
  the `staleTags` arm already reds a `@public` tag that gained a prod consumer.
- **Optional stronger arm — judge star-suppression with apisurface.** The ratchet skips star-suppressed
  orphans because "a namespace consumer of the re-exporting barrel might reach them." apisurface's err-alive
  namespace/dynamic arm actually RESOLVES that: the 5 refinery twins came back UNUSED even after accounting
  for every cross-package `import * as` of the `refinery` barrel (there is none that reaches them). So the
  ratchet could safely JUDGE a star-suppressed export that apisurface confirms no namespace consumer reaches
  — closing the star blind spot the `@public`-twin tag currently doubles up on.

**What the stricter rule newly catches (and what it would NOT wrongly delete).** All **42** currently
`@public`-tagged-UNUSED exports (full list in the UNUSED section above — every row tagged `@public`) would be
CHALLENGED: each must migrate its bare `@public` to `@public-future:` or `@public-twin:` naming a concrete
target, or be deleted. Plus the **5** star twins if the star arm is added. It would red a legitimate future
export ONLY if it is left as a bare `@public` — the migration keeps every real future/twin surface exempt
while forcing it to name what it is waiting for. The **5 refinery twins from `02f0a91a0`** are the first test
case: apisurface calls all 5 UNUSED; their existing reasons ("belongs to the client editor", "a future typed
client-side forge preview", "reads the tuple, never this alias") are `@public-twin` claims (the VALUE —
`RENDER_HINT_ROLES`, `forgePlanEnvelopeSchema`, … — IS consumed; the alias is not). Under the rule they
migrate to `@public-twin: <the schema/tuple>` (and the gate confirms that value is live), OR — if the owner
decides a named type nobody imports is just noise — they are deleted with their value schemas untouched. Both
are explicit calls the current bare-`@public` tag lets nobody make.

**Where the classifier CANNOT decide — the residue for a human/marker.** apisurface distinguishes
consumed-across-a-boundary (PUBLIC) from consumed-only-internally (INTERNAL) from unconsumed (UNUSED). It
CANNOT distinguish "design-stage future API whose consumer is genuinely coming" from "rot nobody will ever
wire" — both are UNUSED, identical to every static tool. The gate can only force the distinction to be
DECLARED (`@public-future:` with a named target vs delete) and can re-challenge the named claim once a
consumer is built (the two-sided arm). Whether a claimed-future consumer will ever exist is the owner's call;
the marker's named target is the audit trail that makes that call reviewable instead of a permanent prose
parking permit.

## Honest limits of the classification

- **Namespace / dynamic-import consumers err ALIVE.** `import * as ns` from another package marks the WHOLE
  target module PUBLIC without naming a member (same err-alive arm `orphans` uses). A PUBLIC verdict resting
  only on a namespace swallow is a candidate, not proof — cross-check with `pnpm ast swallowed`.
- **The tRPC proxy is invisible here.** The client consumes server procedures through the typed `trpc.*` proxy,
  not an import edge, so a server procedure's contract types can read less-public than they are. `pnpm ast
  unwired` / `clientgap` are the lenses for that seam.
- **Imported-but-unused counts as consumed.** An import EDGE is consumption (matching `usedProd`), even if the
  binding is never used in the importer — so a dead import elsewhere can hold an export PUBLIC. Deliberate: it
  matches the orphan/ratchet definition of "reached", and the safe direction for a lens that feeds a delete ruling.
- **type-only note is import-SYNTAX based.** `(type-only)` means every cross-package import used `import type`
  syntax; a plain `import { X }` of a type reads as a value consumer. Honest and cheap, not a type-system proof.
- **TEST-ONLY vs INTERNAL is prod-consumer based.** An export with an own-package prod consumer AND a test
  consumer is INTERNAL; TEST-ONLY means NO prod consumer anywhere.

## Verification receipts (this lane)

- `pnpm typecheck` · `pnpm typecheck:graph` · `pnpm typecheck:tests-dom` — all exit 0.
- `npx biome check scripts/codemods/ast.ts tests/tooling/ast-lens.test.ts` — exit 0.
- `pnpm check:structure` — clean (single-pass).
- `pnpm vitest run tests/tooling/ast-lens.test.ts` — 45 passed (39 pre-existing + 6 new apisurface).
- `pnpm ast apisurface` run tree-wide + per-package; `pnpm ast orphans contracts` for the parity receipt.
