---
kind: history
status: superseded
updated: 2026-07-03
---

# Shared-Drawer Dissolution — the per-file symbol map (RESOLVED record)

> **The dissolution is DONE.** Every symbol below has a real home in the built code (verified against `packages/` 2026-07-03; deviations from the original plan are marked `LANDED-AS` in their rows). This is the resolved record of how neo-tavern's `_shared`/`shared/_kit` junk drawers dissolved into `kit`/`contracts`/`db`/domain/server-tier homes. Split out of `core/Core-Shared-Dissolution.md`, which retains the still-live kit-purity law (§0) and load-bearing invariants (§9). **§ numbering is preserved** — code comments cite `shared-dissolution §N` and docs cite `Core-Legacy-Migration-and-Gaps.md §N`; both resolve here for §1–§8/§10.
>
> `Source (steady)` columns are a frozen clone of the legacy codebase (`/tmp/neo-tavern-steady`, commit `da9af861`, pre-revamp), produced by a 4-agent whole-file fan-out. Destination columns are where the symbol actually lives now.

## Why this was the FIRST deliverable

The boundary scan found the legacy codebase clean at the feature level (0 file cycles, 0 upward edges) — the one real entanglement was the drawers, reached 245× with `_shared/ids.ts`-style hubs at fan-in 446. Dissolving them was the leaf prerequisite: `@orb/kit/ids`, the kit engines, and `@orb/contracts/*` had to exist before any domain could compile.

## 1. Destination: `@orb/kit` (pure primitives + engines, isomorphic)

All rows landed as mapped (verified: `packages/kit/src/<module>/`).

| Source (steady) | Symbol(s) | Kit module | Note |
| - | - | - | - |
| `shared/_kit/ids.ts` (whole, fanIn **446**) | `Branded`, `TypeIdOf`, `ID_PREFIX`, all 40 entity/value brands, `castId` (the ONE sanctioned `as`), `brandedId`, `mintTypeId`, `typeIdSchema` | `kit/ids` | universal leaf; biome `no-raw-id`/`no-loose-id-cast` enforced |
| `_shared/ids.ts` | `newId`, `newTypeId` | `kit/ids` | collapsed into the canonical mint |
| `shared/_kit/errors.ts` **and** `_shared/errors.ts` | `DomainError`, `DomainNotFoundError`, `DomainConflictError`, `DomainForbiddenError`, `DomainOperationError`, `DomainRateLimitError`, `DomainUnavailableError`, `DomainNoCredentialError` | `kit/errors` | BOOT-CRITICAL: `DomainNotFoundError` before tag/credentials/character front doors re-export it |
| `shared/prompt/macro/*` (parser/evaluator/registry/types, \~1205L) | `parseMacros`, `evaluateMacros`, `SimpleMacroRegistry`, `createDefaultRegistry`, `globalMacroRegistry`, `createMacroContext`, `processMacros`, `MacroAST`/`MacroContext`/… | `kit/macro` | single-tenant `globalMacroRegistry` singleton → vitest single-worker for macro tests |
| `shared/_kit/regex-execute.ts` + the engine vocab of `shared/_kit/regex.ts` | `executeRegexScripts`, `RegexReplacer`, `RegexExecuteOptions`, `REGEX_PLACEMENTS`/`RegexPlacement`, `SubstituteFindRegex`, `MAX_FIND_REGEX_LENGTH` | `kit/regex` | depends on `kit/macro`; NOT the `node:vm` guard (→ server/kit §2) |
| `shared/_kit/speaker-label.ts` (whole) | `stripSelfSpeakerLabel`, `stripLeadingSpeakerName`, `cleanPerSpeakerReply`, `truncateAtForeignLabel`, `speakerTagsToPlain`, `normalizeExampleStart`, `LEADING_SPEAKER_TAG` | `kit/speaker-label` | used at BOTH persist and render — the "live once" mandate |
| `shared/_kit/fix-markdown.ts` | `fixMarkdown`, `repairStreamingTail` | `kit/fix-markdown` | streaming-tail `<speaker>` hold is load-bearing |
| `shared/_kit/{error-message,guards,json,slug,time,tokens}.ts` | `errorMessage`; `isPlainObject`; `JsonValue`+`jsonValueSchema`; `slugifyHandle`; `epochToMs`/`secondsToMs`/`isoToMs`/`utcFormatToMs`; `estimateTokens` | `kit/{error-message,guards,json,slug,time,tokens}` | `estimateTokens` keeps OpenRouter-normalized parity (advisory) |
| `shared/_kit/assets.ts` (split) | `isAssetHash` | `kit/assets` | only the pure hash guard; route + sizing went elsewhere (§5) |
| the `system\|user\|assistant` role axis (neo's `messageRole` + 3 injection-role tuples — the SAME 4× axis) + the ST numeric role bimap | `MESSAGE_ROLES`/`MessageRole`, `messageRoleFromSt`/`messageRoleToSt` | `kit/message-role` (D32 — NEUTRAL home) | THE canonical role union (the 132-touch axis); `z.enum(MESSAGE_ROLES)` → `contracts/chat.messageRoleSchema` (tuple-in-kit, §5) |
| the at-depth `{depth, role}` injection placement shared by world-info / author's note / card depth-prompt / persona / memory / guided | `InjectionPlacement`, `MAX_INJECTION_DEPTH`, `injectionDirectiveSchema`, `resolveInjectionPlacement(raw, defaults)` | `kit/injection` (D32 — NEUTRAL home) | the shared inject SHAPE; each consumer passes its OWN defaults. Depends on `kit/message-role` |
| `shared/world-info/world-info-schema.ts` (WI-specific tuples + resolvers) | `ENTRY_SCOPE_MODES`/`EntryScopeMode`, `ENTRY_POSITIONS`/`EntryPosition`, `resolveEntryScope`/`resolveEntryInjection`/`resolveEntryPosition`, `keyRegex`/`matchEntryKeys`/`buildKeywordHaystack` | `kit/world-info` | WI-only; role union + `{depth,role}` shape moved out per D32 |
| `shared/persona/persona-schema.ts` (resolver + tuple) | `PERSONA_DESCRIPTION_POSITIONS`, `PersonaDescriptionPosition`, `PersonaDescriptionPlacement`, `resolvePersonaDescriptionPlacement` | `kit/persona` | imports from `kit/message-role`+`kit/injection` (NOT world-info — D32) |
| `shared/prompt/guided-actions.ts` (the pure fn only) | `resolveGuidedInstruction` + `neutralizeMacros` + `ZWSP` | `kit/guided` | U+200B BETWEEN the `{{` braces — change this and macro re-injection re-opens |
| `_shared/strip-undefined.ts` | `stripUndefined` | `kit/objects` | |
| `_shared/replay-buffer.ts` | `ReplayBuffer`, `createReplayBuffer` | `kit/replay-buffer` | refiled from "feature-internal": 3 feature consumers + pure → kit |
| `_shared/stats-tally.ts` (pure half) | `wordCount`, `utcDay`, `modelKey` | `kit/stats-tally` | one home so live deltas can't drift from reconcile; ST `\b\w+\b` parity |
| `_shared/png-card-codec.ts` | `isPng`, `readCardChunk`, `writeCardChunk` (+ crc32/makeChunk/PNG\_SIGNATURE) | `kit/png-card-chunk` | string-based so it never imports the card type; dual-chunk (chara V2 + ccv3 V3) load-bearing |
| triplicated `escapeRegExp` (in `wi-keyword-match`, `speaker-label`, `select-speakers`) | `escapeRegExp` | `kit/strings` (one copy) | 3 re-declarations → one primitive (§7.7) |
| `server/providers/_shared/vector-math.ts` + `corpus/substrate/pair-cosine.ts` | `cosineSim`/`l2Normalize`/`pairwiseCosine`/… | `kit/vector-math` | was out-of-slice, flagged by §8.1; landed |

## 2. Destination: `@orb/server/kit` (server-only pure)

| Source | Symbol(s) | Module | Landed reality |
| - | - | - | - |
| `shared/prompt/post-process.ts` (whole) | `collapseNewlines`, `trimTrailingWhitespace`, `dropIncompleteSentence`, `collapseToSingleLine`, `applyReceivePostProcess`, `applyAssemblePostProcess` | `server/kit/post-process` | landed as mapped |
| `shared/prompt/custom-parameters.ts` (merge half) | `deepMergeRequestBody` (+ `FORBIDDEN_KEYS`) | `server/kit/custom-parameters` | **NOT BUILT — the one open row.** Placeholder scaffold only; runners use a shallow overlay. Tracked **PD-101** (`Core-Audits-and-Debt.md`); `FORBIDDEN_KEYS` + the schema superRefine (Layer 1) live in `contracts/preset` |
| `_shared/regex.ts` (the vm guard) | `createRegexService`/`RegexService`, `getDisabledScripts`/`resetDisabledScripts` | `server/kit/regex` | **LANDED-AS** `createRegexApplyReplace`/`applyReplace` + `REGEX_APPLY_TIMEOUT_MS` (the `node:vm` 50ms ReDoS watchdog as an injectable `applyReplace` seam). No disable registry — disable rides `script.enabled` filtering in the kit executor |
| `_shared/serde/card-serde.ts` (mappers) | `cardFromJson` (tolerant IN), `buildCardV3` (strict OUT) + internals | `server/kit/serde/card` | landed as mapped; schema in contracts (§4) |
| `_shared/serde/world-entry-serde.ts` (mappers) | `loreEntryColumns`, `loreEntryMetadata`, `exportBookEntry` | `server/kit/serde/world-entry` | **LANDED-AS** part of `server/kit/serde/card/index.ts` (co-located with the card round-trip; PD-44 moved it there from `domain/export/substrate`) |
| `server/content-hash.ts` | `contentHash`/`collapseByContentHash` | `server/kit/content-hash` | **LANDED-AS** `domain/embeddings/substrate/hash.ts` (embeddings-private — its only consumers) |

## 3. Destination: `@orb/db/kit` (db-layer primitives — need drizzle types)

All rows landed as mapped (`packages/db/src/kit/{batch,db-errors,fetch-owned}.ts`).

| Source | Symbol(s) | Note |
| - | - | - |
| `_shared/batch.ts` | `batchStmt`, `batchMany` | resolved domain/tag's open kit-vs-db question → db/kit (needs `Parameters<Db["batch"]>`) |
| `_shared/db-errors.ts` | `isConstraintViolation` | unified with credentials' + workloads' constraint walks |
| `_shared/fetch-owned.ts` | `fetchOwned` (`OwnedTable` constraint) | `OwnedTable` requires drizzle column types; `ownerId` → `principal.userId` under §7.1 |

## 4. Destination: `@orb/contracts` (cross-boundary wire shapes + zod; namespaced)

The dominant bucket — the client needs runtime zod but may not import `@orb/server`. All namespaces below exist and carry their listed symbols (spot-verified 2026-07-03). Tuple-vs-schema rule: a const tuple shared by a pure kit resolver AND a zod schema lives in `kit`; the `z.enum(TUPLE)` schema lives in `contracts` and imports the tuple downward.

| Namespace | Symbols (from where) |
| - | - |
| `contracts/preset` | `PromptConfig`+`DEFAULT_PROMPT_CONFIG`+`CONFIG_LIFTS`; `UserIntent`+`userIntentSchema`+`generationKnobSchemas` (co-located); `PresetFormValues`+mappers; `GuidedActionsConfig`+`DEFAULT_GUIDED_ACTIONS`; `customParametersSchema`; `PROMPT_MACROS`; ST/neo serde (`st-preset`+`preset-file`) |
| `contracts/chat` | all 8 assemble types (`AssembleContext`/`AssembleCharacter`/`AssemblePersona`/`AssembleWorldEntry`/`ChatInjection`/`AssembleTrace`/`AssembledPrompt`/`SectionPreview`); `ChatDeltaEvent`; `RoomOverrides`+`roomOverridesSchema`, `GroupConfig`+`groupConfigSchema`+`GroupPolicy`, `OpeningPolicy` (MISFILED in neo's `shared/settings` — they are chat shapes, §7.4); the unified-roster wire shapes (D16): invite params + `InviteView`, `ParticipantView`, `MemberCardView` (+ `memberCardVisibility`, D22), the group-macro context |
| `contracts/connection` | `ChatApi`/`ChatSource` unions+schemas (18 touch / 11 re-decls — the measured pain); `OpenRouterProviderRouting`+`parseProviderRouting` |
| `contracts/credentials` | `ResolvedCredential` (brand), `CredentialHealth`, `ProviderMetadata`+`providerMetadataSchema`, `CredentialProvider`/`CRED_PROVIDERS`, `CredentialSource` |
| `contracts/character` | `createCharacterSchema`/`updateCharacterSchema` + the canonical card (`CharacterCard`/`characterCardV3Schema`/`CHARA_CARD_V3_SPEC`) — §7.3 LOCKED one-card |
| `contracts/persona` | `createPersonaSchema`/`updatePersonaSchema`/`personaMetadataSchema`(+write) |
| `contracts/world-info` | `WORLD_BOOK_ROLES`/`worldBookRoleSchema`/`WorldBookRole`, book+entry create/update schemas, `entryMetadataSchema`/`EntryMetadata`(+write), `WiBusEvent`, `WorldInfoScope` |
| `contracts/settings` | `AppSettings`+schema+`parseAppSettings`, `UserSettings`+schema+`parseUserSettings`, `MemoryDefaults`/`MemorySummarizerConfig`, `LogLevel`, section unions |
| `contracts/versioned-config` | `defineVersionedConfig` + `VersionedConfig`/`VersionedConfigDef` — the ONE primitive shared by AppSettings/UserSettings/PromptConfig (§7.2) |
| `contracts/buddy` | the taxonomy vocab (`RARITIES`/`SPECIES`/`MOODS`/`STAT_NAMES`/… + weight/threshold maps + `CompanionBones`/`CompanionStats`) — db imports for enum columns |
| `contracts/stats` | `StatsDelta`, `ApplyStatsDelta` (the chat↔stats wire) |
| `contracts/regex` | `regexScriptSchema`/`RegexScript`; kit executor stays generic via kit-local structural `RegexScriptInput`; `RegexScript satisfies RegexScriptInput` (kit may not import contracts) |
| `contracts/assets` | `BLOB_ROUTE`, `blobUrl`; + `ASSET_KINDS`/`assetKindSchema` (§5 CORRECTED row) |
| `contracts/identity` / `contracts/session` | `ResolvedIdentity`; `UserRole`/`USER_ROLES` = `owner\|admin\|user` (D17 — the ONE global-role axis); `Principal`; `SessionView` (BFF-session ≠ SDK-session) |
| `contracts/notifications` | the CLOSED `NotificationEvent` discriminated union (`recipientUserId` mandatory; credentials/secrets type-level-unrepresentable) + `PresenceView` (D16) |
| `contracts/role-clients` | `RoleClients` — depends on the provider result contracts (`EmbedResult`/`RerankResult`/… moved to `contracts/providers` first, §8) |

## 5. Destination: a DOMAIN (un-inverted services + feature-internals + policy)

| Source | Symbol(s) | Destination | Landed reality |
| - | - | - | - |
| `_shared/credentials.ts` (640L, 15 exports) | resolver + all CRUD + revoke + mint + maybe-revoke | `domain/credentials` | landed; composition-root injection into consumers |
| `_shared/users.ts` (216L) | `ensureUser`, `provisionIdentity` (+ ownerHandles/determineRole) | `domain/sessions` | landed (`verbs/ensure-user.ts`, `verbs/provision-identity.ts`); the auth seam calls it |
| `_shared/admin.ts` | `requireAdmin` | `domain/admin` | landed |
| `_shared/user-settings.ts` | `loadUserSettings` | `domain/settings` | landed (`verbs/load-user-settings.ts`) |
| `_shared/group-character-rows.ts` | `buildGroupCharacterRows` | `domain/character` (`mintSyntheticGroupCharacter`) | **LANDED-AS** nothing of that shape — no synthetic group character exists; group membership is chat-owned rows (`domain/chat/persistence/{roster,participant}.ts`, D16 unified roster) |
| `_shared/roster-rows.ts` | `buildInitialRosterRows` | `domain/chat` (`persistence/roster.ts`) | landed; chat-private |
| `_shared/stats-tally.ts` (impl path) | apply-delta | `domain/stats` | landed; injected into chat (`ApplyStatsDelta`, §4) |
| `shared/_kit/assets.ts` (policy) | `BLOB_WIDTHS`, `snapBlobWidth` | `domain/assets` | landed (`verbs/resolve-variant.ts`) — variant-sizing policy, not a kit primitive |
| `shared/_kit/assets.ts` (wire union) | `AssetKind` | `@orb/contracts/assets` (+ `assetKindSchema`) | landed (CORRECTED 2026-06-25: a cross-boundary wire union re-spelled inline 4×, not feature-internal); tuple now 6 kinds (`generated`/`gallery`/`attachment` added post-dissolution). `StoredAsset` → contracts too |
| `shared/character/character-schema.ts` | `resolveCharacterDepthPrompt` | `@orb/server/kit/serde` | **LANDED-AS** private `parseDepthPrompt` inside `server/kit/serde/card` (part of `cardFromJson`); consumers read the parsed `card.depthPrompt` field — no exported resolver |
| `shared/settings/app-settings.ts` | `resolveGuidedActions` projection | RETIRED — D33 | the neo projection read a field that never existed; resolution is `activePreset.guidedActions ?? DEFAULT_GUIDED_ACTIONS` at the consumer |

## 6. Destination: server tiers (foundation / transport / entry)

| Source | Symbol(s) | Landed reality |
| - | - | - |
| `_shared/audit.ts` (fanIn 60) | `logAudit` (+ failure-snapshot) | `foundation/observability/audit.ts` — as mapped |
| `_shared/rate-limit.ts` | `createRateLimiter`/`RateLimiter`/`RateLimitConfig` | `transport/rate-limit.ts` — as mapped |
| `_shared/role-clients-binder.ts` | `createVllmRoleClients` | **LANDED-AS** `bindRoleClientsForUser` in `entry/compose/role-clients.ts` — ONE async binder honoring per-role `routing.roleDefaults`; the sync vLLM-floor binder was deliberately not ported (it silently overrode user routing — see the file header) |
| `_shared/role-clients-binder.ts` | `createDefaultRoleClients` | DELETED as planned — contexts receive `roleClients` as a required `entry/`-wired dep (missing → `tsc` red) |

## 7. Refinements locked by this pass (all built)

1. `replay-buffer` → `@orb/kit`, not "feature-internal": 3 feature consumers, pure.
2. `stats-tally` splits: pure fns → `kit/stats-tally`, `StatsDelta`/`ApplyStatsDelta` → `contracts/stats` — a feature home would force an illegal chat→stats sideways import.
3. `fetch-owned` + `batch` + `db-errors` → `@orb/db/kit` (need drizzle types).
4. `room-overrides` / `group-config` / `opening-policy` were MISFILED in `shared/settings` → `contracts/chat` (chatMetadata sub-blobs, not the settings KV).
5. The kit↔contracts tuple rule: const tuples shared by a kit resolver AND a contracts schema live in kit; the schema imports them down.
6. `RegexScript` direction: kit-local structural `RegexScriptInput`; `contracts/regex.RegexScript satisfies RegexScriptInput`.
7. `escapeRegExp` triplication → one `kit/strings` export.

## 8. Boot order (the build sequence the scaffold followed)

Within the cake `kit ← contracts ← db ← server ← client`, the internal DAG:

**`@orb/kit`:**

1. `kit/ids` (the universal leaf), `kit/errors`, `kit/guards`, `kit/strings`, `kit/objects`, `kit/json`, `kit/time`, `kit/tokens`, `kit/slug`, `kit/error-message`, `kit/assets`, `kit/fix-markdown`, `kit/speaker-label`, `kit/vector-math`, `kit/replay-buffer`, `kit/stats-tally`, `kit/png-card-chunk`, `kit/message-role` (D32; depends on nothing).
2. `kit/macro` (engine) → then `kit/regex` and `kit/guided` (both depend on `kit/macro`); `kit/injection` (D32; depends on `kit/message-role`).
3. `kit/world-info` and `kit/persona` — both depend on `kit/message-role` + `kit/injection`.

**`@orb/contracts` (surprising edges):**

- `contracts/versioned-config` before `contracts/settings` AND `contracts/preset` — the most boot-fragile cross-slice edge.
- `contracts/world-info` before `contracts/persona` and `contracts/character`.
- `contracts/connection` before `contracts/settings` (`UserSettings.routing.roleDefaults.chat`).
- `contracts/chat` + `contracts/regex` before `contracts/settings` (`UserSettings.groupDefaults`/`regexScripts`) — contracts/settings depends on contracts/chat, the reverse of intuition.
- provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`, → `contracts/providers`) before `contracts/role-clients`.

**Then:** `@orb/db` → `@orb/server` (foundation + transport, then domains bottom-up, then entry wires injection) → `@orb/client`.

## 10. Open decisions at map time — final states

- Kit-purity ruling (§0) — RESOLVED 2026-06-25; law lives in `core/Core-Shared-Dissolution.md` + `Core-0-Architecture-and-Structure.md` §2.
- `jsonValueSchema` — stayed in `kit/json`; the promote-only-if-it-gates-a-wire-input rule stands.
- buddy `sprites.ts` — client presentation (imports a contracts taxonomy type, so can't be kit); no server-side ASCII preview was wanted.
- `character_summaries.tags` / facets vs labels — handled in the domain fan-out, out of this slice.
- The full per-symbol tables (file:line + consumer lists) were in the 4 agent returns, not retained; use the codemod-kit `findImportersOfFile` for exact references.
