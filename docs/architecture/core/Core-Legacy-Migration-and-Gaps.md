# Legacy-Migration-and-Gaps

> Auto-generated from reorg manifest.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## Orbweaver — the shared-dissolution inventory

> **Status: planning (execution-grade).** This is the cross-cutting map that the layer cake stands on:
> every exported symbol in neo-tavern's junk drawers → its orbweaver home + the enforcement tier that
> goes red on violation. There is **no `_shared` and no catch-all `shared/`** in orbweaver; every symbol
> below lands in `@orb/kit`, `@orb/contracts`, `@orb/db`, a domain, or a server tier (`foundation` /
> `transport` / `entry` / `server/kit`).
>
> Produced by a 4-agent whole-file fan-out over the **steady clone** (`/tmp/neo-tavern-steady`, commit
> `da9af861`, frozen pre-revamp). Each agent read every file top-to-bottom, mapped consumers (server vs
> client vs db), and reconciled against the per-domain target docs. This doc is the consolidation +
> the rulings + the boot order. The per-domain docs reference it instead of each re-deriving "where does
> `newTypeId` go."

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## Why this is the FIRST deliverable

The boundary scan (`reports/boundary-scan` / `scratchpad/orb-scan.json`) found the codebase is already
clean at the feature level (0 file cycles, 0 upward edges in the 5-cake) — the **one** real entanglement
is the drawers, reached **245×** with `_shared/ids.ts`-style hubs at fan-in 446. Dissolving them is the
leaf prerequisite: `@orb/kit/ids` (446 importers), the kit engines, and `@orb/contracts/*` must exist and
be populated **before any domain can compile**. You cannot port `credentials` until its 15 exiled exports
have homes; you cannot write `chat` until `AssembleContext` lives in `contracts/chat`.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 0. The kit-purity ruling (load-bearing — everything below depends on it)

`core/Core-0-Architecture-and-Structure.md §2` says `kit` has "ZERO runtime deps (isomorphic)." Taken literally that is false against
the code — the canonical kit primitive `ids.ts` imports `zod` + `typeid-js`; `time.ts` imports `luxon`;
`fix-markdown.ts` imports `remend`; the `resolveEntry*` / `resolvePersonaDescriptionPlacement` resolvers
call `z.enum().safeParse` internally. **Ruling (LOCKED 2026-06-25 — Nate confirmed):**

> **`@orb/kit` MAY depend on isomorphic, side-effect-free npm libraries (zod, typeid-js, luxon, remend).
> It may NOT depend on: Node built-ins (`node:vm`, `node:fs`, …), `@orb/contracts`, `@orb/db`, any
> domain, or anything doing I/O.** "Zero runtime deps" means **zero domain/I/O/Node deps**, not zero npm.
> The split: isomorphic-pure → `@orb/kit`; Node-only-pure → `@orb/server/kit` (e.g. the `node:vm` regex
> guard). The `kit-purity` gate asserts _no domain/contracts/db import + no `node:_`import* — NOT _no
> package.json dep_.`core/Core-0-Architecture-and-Structure.md §2`'s "ZERO runtime deps" wording will be amended to match.

The proof case is the regex engine: the pure executor (`executeRegexScripts`) is kit, but its `node:vm`
ReDoS guard is **Node-only → `@orb/server/kit`**. `node:vm` is exactly the thing that can't be kit. The
`kit-purity` gate enforces _no domain/contracts/db import + no `node:_` import*, not*no package.json dep\*.

If you reject this, the fallback is rewriting ~6 resolvers to drop their internal zod for hand guards —
possible but pure cost. Recommendation: **accept the ruling.**

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 1. Destination: `@orb/kit` (pure primitives + engines, isomorphic)

| Source (steady)                                                                                                                                                                                         | Symbol(s)                                                                                                                                                                                       | Kit module                                         | Note                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shared/_kit/ids.ts` (whole, fanIn **446**)                                                                                                                                                             | `Branded`, `TypeIdOf`, `ID_PREFIX`, all 40 entity/value brands, `castId` (the ONE sanctioned `as`), `brandedId`, `mintTypeId`, `typeIdSchema`                                                   | `kit/ids`                                          | universal leaf; biome `no-raw-id`/`no-loose-id-cast` enforced                                                                                                                                  |
| `_shared/ids.ts`                                                                                                                                                                                        | `newId`, `newTypeId`                                                                                                                                                                            | `kit/ids`                                          | collapses into the canonical mint (re-export shim today)                                                                                                                                       |
| `shared/_kit/errors.ts`… **and** `_shared/errors.ts`                                                                                                                                                    | `DomainError`, `DomainNotFoundError`, `DomainConflictError`, `DomainForbiddenError`, `DomainOperationError`, `DomainRateLimitError`, `DomainUnavailableError`, `DomainNoCredentialError`        | `kit/errors`                                       | **BOOT-CRITICAL: `DomainNotFoundError` must exist before tag/credentials/character front doors re-export it**                                                                                  |
| `shared/prompt/macro/*` (parser/evaluator/registry/types/index, ~1205L)                                                                                                                                 | `parseMacros`, `evaluateMacros`, `SimpleMacroRegistry`, `createDefaultRegistry`, `globalMacroRegistry`, `createMacroContext`, `processMacros`, `MacroAST`/`MacroContext`/…                      | `kit/macro`                                        | the engine; **single-tenant `globalMacroRegistry` singleton** → vitest single-worker for macro tests                                                                                           |
| `shared/_kit/regex-execute.ts` + the engine vocab of `shared/_kit/regex.ts`                                                                                                                             | `executeRegexScripts`, `RegexReplacer`, `RegexExecuteOptions`, `REGEX_PLACEMENTS`/`RegexPlacement`, `SubstituteFindRegex`, `MAX_FIND_REGEX_LENGTH`                                              | `kit/regex`                                        | depends on `kit/macro` (macro-substitute hook). **NOT** the `node:vm` guard (→ server/kit)                                                                                                     |
| `shared/_kit/speaker-label.ts` (whole)                                                                                                                                                                  | `stripSelfSpeakerLabel`, `stripLeadingSpeakerName`, `cleanPerSpeakerReply`, `truncateAtForeignLabel`, `speakerTagsToPlain`, `normalizeExampleStart`, `LEADING_SPEAKER_TAG`                      | `kit/speaker-label`                                | used at BOTH persist (pipeline/engine) and render (client message-render) — the "live once" mandate                                                                                            |
| `shared/_kit/fix-markdown.ts`                                                                                                                                                                           | `fixMarkdown`, `repairStreamingTail`                                                                                                                                                            | `kit/fix-markdown`                                 | streaming-tail `<speaker>` hold is load-bearing                                                                                                                                                |
| `shared/_kit/{error-message,guards,json,slug,time,tokens}.ts`                                                                                                                                           | `errorMessage`; `isPlainObject`; `JsonValue`+`jsonValueSchema`; `slugifyHandle`; `epochToMs`/`secondsToMs`/`isoToMs`/`utcFormatToMs`; `estimateTokens`                                          | `kit/{error-message,guards,json,slug,time,tokens}` | `estimateTokens` keeps OpenRouter-normalized parity (advisory)                                                                                                                                 |
| `shared/_kit/assets.ts` (split)                                                                                                                                                                         | `isAssetHash`                                                                                                                                                                                   | `kit/assets`                                       | only the pure hash guard; route + sizing go elsewhere (§5)                                                                                                                                     |
| the `system\|user\|assistant` role axis (neo's `messageRole` + `ENTRY_INJECTION_ROLES` + `GUIDED_INJECTION_ROLES` + `PRESET_GUIDED_INJECTION_ROLES` — all the SAME 4× axis) + the ST numeric role bimap | `MESSAGE_ROLES`/`MessageRole`, `messageRoleFromSt`/`messageRoleToSt`                                                                                                                            | **`kit/message-role` (D32 — NEUTRAL home)**        | THE canonical role union (the 132-touch axis). Every injector + chat message imports it; no consumer owns it. `z.enum(MESSAGE_ROLES)` → `contracts/chat.messageRoleSchema` (tuple-in-kit, §5). |
| the at-depth `{depth, role}` injection placement shared by world-info / author's note / card depth-prompt / persona / memory / guided                                                                   | `InjectionPlacement`, `MAX_INJECTION_DEPTH`, `injectionDirectiveSchema`, `resolveInjectionPlacement(raw, defaults)`                                                                             | **`kit/injection` (D32 — NEUTRAL home)**           | the shared inject SHAPE; each consumer passes its OWN default depth+role (field-isolated) so the systems aren't tied. Depends on `kit/message-role`.                                           |
| `shared/world-info/world-info-schema.ts` (WI-specific tuples + resolvers)                                                                                                                               | `ENTRY_SCOPE_MODES`/`EntryScopeMode`, `ENTRY_POSITIONS`/`EntryPosition`, `resolveEntryScope`/`resolveEntryInjection`/`resolveEntryPosition`, `keyRegex`/`matchEntryKeys`/`buildKeywordHaystack` | `kit/world-info`                                   | WI-only now (scope/position/keyword). The role union + ST bimap moved to `kit/message-role`, the `{depth,role}` shape to `kit/injection` (D32); `resolveEntryInjection` consumes them.         |
| `shared/persona/persona-schema.ts` (the resolver + tuple)                                                                                                                                               | `PERSONA_DESCRIPTION_POSITIONS`, `PersonaDescriptionPosition`, `PersonaDescriptionPlacement`, `resolvePersonaDescriptionPlacement`                                                              | `kit/persona`                                      | per persona.md; imports `MessageRole` + `resolveInjectionPlacement` from `kit/message-role`+`kit/injection` (NOT world-info — D32)                                                             |
| `shared/prompt/guided-actions.ts` (the pure fn only)                                                                                                                                                    | `resolveGuidedInstruction` + `neutralizeMacros` + `ZWSP`                                                                                                                                        | `kit/guided`                                       | **U+200B BETWEEN the `{{` braces** — change this and macro re-injection re-opens                                                                                                               |
| `_shared/strip-undefined.ts`                                                                                                                                                                            | `stripUndefined`                                                                                                                                                                                | `kit/objects`                                      |                                                                                                                                                                                                |
| `_shared/replay-buffer.ts`                                                                                                                                                                              | `ReplayBuffer`, `createReplayBuffer`                                                                                                                                                            | `kit/replay-buffer`                                | **REFINES brief** (it filed this "feature-internal"): 3 feature consumers + pure → kit                                                                                                         |
| `_shared/stats-tally.ts` (pure half)                                                                                                                                                                    | `wordCount`, `utcDay`, `modelKey`                                                                                                                                                               | `kit/stats-tally`                                  | **REFINES brief** ("own feature"): chat consumes at runtime; one home so live deltas can't drift from reconcile. ST `\b\w+\b` parity                                                           |
| `_shared/png-card-codec.ts`                                                                                                                                                                             | `isPng`, `readCardChunk`, `writeCardChunk` (+ crc32/makeChunk/PNG_SIGNATURE)                                                                                                                    | `kit/png-card-chunk`                               | string-based so it never imports the card type; dual-chunk (chara V2 + ccv3 V3) load-bearing                                                                                                   |
| triplicated `escapeRegExp` (in `wi-keyword-match`, `speaker-label`, `select-speakers`)                                                                                                                  | `escapeRegExp`                                                                                                                                                                                  | `kit/strings` (one copy)                           | **REFINES**: 3 independent re-declarations → one general primitive; delete the other two (§7.5)                                                                                                |
| _(out-of-slice, noted)_ `server/providers/_shared/vector-math.ts` + `corpus/substrate/pair-cosine.ts`                                                                                                   | `cosineSim`/`l2Normalize`/`pairwiseCosine`/…                                                                                                                                                    | `kit/vector-math`                                  | flagged by §8.1 + search.md; belongs to the infra-tier survey                                                                                                                                  |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 2. Destination: `@orb/server/kit` (server-only pure)

| Source                                            | Symbol(s)                                                                                                                                             | Module                         | Note                                                                                         |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------- |
| `shared/prompt/post-process.ts` (whole)           | `collapseNewlines`, `trimTrailingWhitespace`, `dropIncompleteSentence`, `collapseToSingleLine`, `applyReceivePostProcess`, `applyAssemblePostProcess` | `server/kit/post-process`      | pure but 0 client consumers                                                                  |
| `shared/prompt/custom-parameters.ts` (merge half) | `deepMergeRequestBody` (+ `FORBIDDEN_KEYS`)                                                                                                           | `server/kit/custom-parameters` | **Layer-2 prototype-pollution defense — "the ACTUAL defense"; keep the forbidden-key check** |
| `_shared/regex.ts` (the vm guard)                 | `createRegexService`/`RegexService` (`node:vm` 50ms ReDoS watchdog), `getDisabledScripts`/`resetDisabledScripts`                                      | `server/kit/regex`             | `node:vm` can't be kit (browser imports kit) — this is the clean kit↔server-kit seam         |
| `_shared/serde/card-serde.ts` (mappers)           | `cardFromJson` (tolerant IN adapter), `buildCardV3` (strict OUT) + internals                                                                          | `server/kit/serde/card`        | the ONE serde core shared by import+export; schema → contracts (§4)                          |
| `_shared/serde/world-entry-serde.ts` (mappers)    | `loreEntryColumns`, `loreEntryMetadata`, `exportBookEntry`                                                                                            | `server/kit/serde/world-entry` | `constant→scopeMode:"always"` round-trip                                                     |
| _(out-of-slice, noted)_ `server/content-hash.ts`  | `contentHash`/`collapseByContentHash`                                                                                                                 | `server/kit/content-hash`      | flagged by search.md; infra-tier survey                                                      |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 3. Destination: `@orb/db/kit` (db-layer primitives — need drizzle types)

| Source                   | Symbol(s)                              | Note                                                                                                                                                                |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_shared/batch.ts`       | `batchStmt`, `batchMany`               | **REFINES tag.md's open kit-vs-db question → db/kit** (needs `Parameters<Db["batch"]>`). ~59 inline `BatchItem` casts on the chat send path should be wired to this |
| `_shared/db-errors.ts`   | `isConstraintViolation`                | unify with credentials' `isCredentialUniqueViolation` (4-depth `cause` walk) + workloads constraints                                                                |
| `_shared/fetch-owned.ts` | `fetchOwned` (`OwnedTable` constraint) | **REFINES tag.md → db/kit** (`OwnedTable` requires drizzle column types, can't be kit-pure). `ownerId` → `principal.userId` under §7.1                              |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 4. Destination: `@orb/contracts` (cross-boundary wire shapes + zod; namespaced)

The dominant bucket. **The client needs runtime zod for forms but may not import `@orb/server` — that is
exactly why these go to contracts** (which the client CAN depend on). Tuple-vs-schema rule: **a const
tuple shared by a pure kit resolver AND a zod schema lives in `kit`; the `z.enum(TUPLE)` schema lives in
`contracts` and imports the tuple downward.**

| Namespace                                  | Symbols (from where)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `contracts/preset`                         | `PromptConfig`+`DEFAULT_PROMPT_CONFIG`+`CONFIG_LIFTS` (prompt-config); `UserIntent`+`userIntentSchema`+**`generationKnobSchemas`** (intent — must stay co-located); `PresetFormValues`+mappers (preset-schema); `GuidedActionsConfig`+`DEFAULT_GUIDED_ACTIONS` (guided-actions schema half); `customParametersSchema` (custom-parameters); `PROMPT_MACROS` (prompt-macros); ST/neo serde (`st-preset`+`preset-file`)                                                                                                                                                                                                                                                                         |
| `contracts/chat`                           | all 8 assemble types (`AssembleContext`/`AssembleCharacter`/`AssemblePersona`/`AssembleWorldEntry`/`ChatInjection`/`AssembleTrace`/`AssembledPrompt`/`SectionPreview` — from prompt-assemble-types); `ChatDeltaEvent` (chat-types); **`RoomOverrides`+`roomOverridesSchema`, `GroupConfig`+`groupConfigSchema`+`GroupPolicy`, `OpeningPolicy` — MISFILED in `shared/settings`, they are chat shapes**; **the unified-roster wire shapes (D16): invite create/preview/redeem params + `InviteView`, the roster/`ParticipantView` + the membership-gated member card view (`MemberCardView` + `memberCardVisibility` on `groupConfigSchema`, host-toggleable — D22), the group-macro context** |
| `contracts/connection`                     | `ChatApi`/`ChatSource` unions+schemas (chat-routing — **18 touch / 11 re-decls, the measured pain**); `OpenRouterProviderRouting`+`parseProviderRouting` (provider-routing)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `contracts/credentials`                    | `ResolvedCredential` (brand), `CredentialHealth`, `ProviderMetadata`+`providerMetadataSchema`, `CredentialProvider`/`CRED_PROVIDERS`, `CredentialSource`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `contracts/character`                      | `createCharacterSchema`/`updateCharacterSchema` + the canonical card (`CharacterCard`/`characterCardV3Schema`/`CHARA_CARD_V3_SPEC`) — §7.3 LOCKED one-card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `contracts/persona`                        | `createPersonaSchema`/`updatePersonaSchema`/`personaMetadataSchema`(+write)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `contracts/world-info`                     | `WORLD_BOOK_ROLES`/`worldBookRoleSchema`/`WorldBookRole`, book+entry create/update schemas, `entryMetadataSchema`/`EntryMetadata`(+write), `WiBusEvent` (chat-bus), `WorldInfoScope`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `contracts/settings`                       | `AppSettings`+schema+`parseAppSettings`, `UserSettings`+schema+`parseUserSettings`, `MemoryDefaults`/`MemorySummarizerConfig`, `LogLevel`, section unions                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `contracts/versioned-config`               | **`defineVersionedConfig`** + `VersionedConfig`/`VersionedConfigDef` — the ONE primitive shared by AppSettings/UserSettings/PromptConfig (§7.2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `contracts/buddy`                          | the taxonomy vocab (`RARITIES`/`SPECIES`/`MOODS`/`STAT_NAMES`/… + weight/threshold maps + `CompanionBones`/`CompanionStats`) — db imports for enum columns                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `contracts/stats`                          | `StatsDelta`, `ApplyStatsDelta` (the chat↔stats wire)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `contracts/regex`                          | `regexScriptSchema`/`RegexScript` — the script-library shape. **kit/regex executor stays generic via a kit-local structural `RegexScriptInput`; `contracts/regex.RegexScript satisfies RegexScriptInput`** (kit may not import contracts)                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `contracts/assets`                         | `BLOB_ROUTE`, `blobUrl` (the `/blob/<hash>` route contract)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `contracts/identity` / `contracts/session` | `ResolvedIdentity`; **`UserRole`/`USER_ROLES` = `owner\|admin\|user` (D17 — the ONE global-role axis; db enum + tRPC + client derive it)**; `Principal`; `SessionView` (BFF-session ≠ SDK-session)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `contracts/notifications`                  | the **CLOSED** `NotificationEvent` discriminated union (`recipientUserId` mandatory; credentials/secrets **type-level-unrepresentable**) + the `PresenceView` (D16 — the per-user delivery surface; producer = the `notifications` domain)                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `contracts/role-clients`                   | `RoleClients` — depends on the provider result contracts (`EmbedResult`/`RerankResult`/… must move to contracts FIRST)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 5. Destination: a DOMAIN (un-inverted services + feature-internals + policy)

| Source                                      | Symbol(s)                                                        | Destination domain                                 | Access cross-feature via                                                                                                                                                                                                                                                                                                                          |
| ------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_shared/credentials.ts` (640L, 15 exports) | resolver + all CRUD + revoke + mint + maybe-revoke               | `domain/credentials` (verbs/persistence)           | composition-root **injection** into chat/connection/buddy                                                                                                                                                                                                                                                                                         |
| `_shared/users.ts` (216L)                   | `ensureUser`, `provisionIdentity` (+ ownerHandles/determineRole) | `domain/sessions`                                  | the auth seam (transport/entry) calls it                                                                                                                                                                                                                                                                                                          |
| `_shared/admin.ts`                          | `requireAdmin`                                                   | `domain/admin`                                     | injected into settings                                                                                                                                                                                                                                                                                                                            |
| `_shared/user-settings.ts`                  | `loadUserSettings`                                               | `domain/settings`                                  | injected into chat/workloads                                                                                                                                                                                                                                                                                                                      |
| `_shared/group-character-rows.ts`           | `buildGroupCharacterRows`                                        | `domain/character` (`mintSyntheticGroupCharacter`) | injected into chat                                                                                                                                                                                                                                                                                                                                |
| `_shared/roster-rows.ts`                    | `buildInitialRosterRows`                                         | `domain/chat` (`persistence/roster`)               | chat-private; import builds same shape via db                                                                                                                                                                                                                                                                                                     |
| `_shared/stats-tally.ts` (impl path)        | apply-delta                                                      | `domain/stats`                                     | injected into chat                                                                                                                                                                                                                                                                                                                                |
| `shared/_kit/assets.ts` (policy)            | `BLOB_WIDTHS`, `snapBlobWidth`                                   | `domain/assets`                                    | variant-sizing policy, not a kit primitive                                                                                                                                                                                                                                                                                                        |
| `shared/_kit/assets.ts` (wire union)        | `AssetKind` (`'card'\|'avatar'\|'export'`)                       | `@orb/contracts/assets` (+ `assetKindSchema`)      | **CORRECTED 2026-06-25**: NOT feature-internal — it's a cross-boundary wire union re-spelled inline across the db enum (`db/schema/assets.ts`), the http route (`http/assets.ts`), the client (`client/lib/assets.ts`), AND the assets domain. → contracts (§7.5 one-home). `StoredAsset` (client redeclares as `UploadedAsset`) → contracts too. |
| `shared/character/character-schema.ts`      | `resolveCharacterDepthPrompt`                                    | `@orb/server/kit/serde`                            | **CORRECTED 2026-06-25**: server-only but TWO domain consumers (export + chat/assembly) → `character/substrate` would force a cross-feature import; → `server/kit` (pure, server-only, uses zod)                                                                                                                                                  |
| `shared/settings/app-settings.ts`           | `resolveGuidedActions` projection                                | **RETIRED — D33**                                  | The neo projection read `AppSettings.guidedActions`, a field that never existed (phantom fallback). Guided actions have ONE home — the preset (`contracts/preset`); resolution is `activePreset.guidedActions ?? DEFAULT_GUIDED_ACTIONS` at the consumer, NOT a settings substrate.                                                               |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 6. Destination: server tiers (foundation / transport / entry)

| Source                           | Symbol(s)                                           | Destination                                                                                                                                                                                     |
| -------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `_shared/audit.ts` (fanIn 60)    | `logAudit` (+ failure-snapshot)                     | `foundation/observability/audit`                                                                                                                                                                |
| `_shared/rate-limit.ts`          | `createRateLimiter`/`RateLimiter`/`RateLimitConfig` | `transport/rate-limit`                                                                                                                                                                          |
| `_shared/role-clients-binder.ts` | `createVllmRoleClients`                             | `entry/` (or `infra/providers/vllm/role-clients`) composition root (per Core-Laws-and-Precedents.md §7 D7 — the `infra/vllm` sibling alternative is dropped; vLLM is nested under `infra/providers/vllm/`) |
| `_shared/role-clients-binder.ts` | `createDefaultRoleClients`                          | **DELETED** — contexts receive `roleClients` as a required `entry/`-wired dep (missing → `tsc` red)                                                                                             |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 7. Refinements this pass makes to the existing docs (lock these)

1. **`replay-buffer` → `@orb/kit`**, not "feature-internal" (brief §4). 3 feature consumers (chat/buddy/workloads), pure.
2. **`stats-tally` splits**: pure fns → `kit/stats-tally`, `StatsDelta`/`ApplyStatsDelta` → `contracts/stats`. Not "own feature stats" — chat consumes at runtime; a feature home forces an illegal chat→stats sideways import.
3. **`fetch-owned` + `batch` + `db-errors` → `@orb/db/kit`** (need drizzle types). Resolves tag.md's open kit-vs-db question.
4. **`room-overrides.ts`, `group-config.ts`, `opening-policy.ts` are MISFILED in `shared/settings` → `contracts/chat`.** They are chatMetadata sub-blobs / start-chat unions consumed by chat verbs + chat assemble types + client chat forms, NOT the settings KV. The brief grouped them under "settings (7 files)"; the settings domain owns only AppSettings/UserSettings.
5. **The kit↔contracts tuple rule** (world-info.md under-specified it): const tuples shared by a kit resolver AND a contracts schema live in **kit**; the schema imports them down. Applies to `ENTRY_SCOPE_MODES`/`ENTRY_INJECTION_ROLES`/`ENTRY_POSITIONS` (persona.md already does this correctly for `PERSONA_DESCRIPTION_POSITIONS`).
6. **`RegexScript` direction**: the kit executor can't import the contracts shape (kit←contracts). Resolution: kit-local structural `RegexScriptInput`; `contracts/regex.RegexScript satisfies RegexScriptInput`.
7. **`escapeRegExp` is triplicated**, not shared → one `kit/strings` export, delete the two copies.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 8. Boot order (the build sequence the scaffold must follow)

Within the cake `kit ← contracts ← db ← server ← client`, there is an **internal DAG** the agents surfaced:

**`@orb/kit` (build first, in this internal order):**

1. `kit/ids` (446 importers — the universal leaf), `kit/errors` (esp. `DomainNotFoundError`), `kit/guards`, `kit/strings`, `kit/objects`, `kit/json`, `kit/time`, `kit/tokens`, `kit/slug`, `kit/error-message`, `kit/assets` (the `isAssetHash` guard — per Core-Laws-and-Precedents.md §7 D11, required in the kit boot order; matches §1), `kit/fix-markdown`, `kit/speaker-label`, `kit/vector-math`, `kit/replay-buffer`, `kit/stats-tally`, `kit/png-card-chunk`, `kit/message-role` (D32 — the canonical role axis + ST bimap; depends on nothing).
2. `kit/macro` (engine) → then `kit/regex` (depends on `kit/macro`) and `kit/guided` (depends on `kit/macro`); `kit/injection` (D32 — `{depth,role}` placement; depends on `kit/message-role`).
3. `kit/world-info` (scope/position tuples + keyword match) and `kit/persona` — both depend on `kit/message-role` + `kit/injection` (D32); needed by multiple contracts namespaces.

**`@orb/contracts` (internal DAG — surprising edges flagged):**

- `contracts/versioned-config` (`defineVersionedConfig`, needs `kit/guards`) **before** `contracts/settings` AND **before** `contracts/preset` (prompt-config consumes it) — the single most boot-fragile cross-slice edge.
- `contracts/world-info` **before** `contracts/persona` (persona-schema imports `entryInjectionSchema`+`entryMetadataWriteSchema`) and **before** `contracts/character`.
- `contracts/connection` (`chatApiSchema`/`chatSourceSchema`) **before** `contracts/settings` (`UserSettings.routing.roleDefaults.chat`).
- `contracts/chat` (`group-config` `DEFAULT_GROUP_CONFIG`) + `contracts/regex` **before** `contracts/settings` (`UserSettings.groupDefaults`/`regexScripts`) — **contracts/settings depends on contracts/chat**, the reverse of intuition.
- provider result contracts (`EmbedResult`/`RerankResult`/`ImageEmbedResult`/`SummarizeResult`) **before** `contracts/role-clients`.

**Then:** `@orb/db` (row types) → `@orb/server` (foundation/observability + transport/rate-limit, then domains bottom-up, then entry wires injection) → `@orb/client`.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 9. Load-bearing invariants that MUST survive the move (pointer list)

- **Credentials AAD** `` `${userId}|${provider}` `` byte-identical (else all GCM ciphertext fails). Single `aadFor()` site.
- **`ResolvedCredential` brand** — 6 construction sites only; `max-pro-sub` unconstructable except after the owner check (`requireOwner` — owner-only box-cred mint, D17; neo's admin gate → owner).
- **`neutralizeMacros`** U+200B between the `{{` braces (macro re-injection defense).
- **`globalMacroRegistry`** single-tenant singleton → vitest single-worker for macro tests.
- **`params: userIntentSchema.catch({})`** damage-bounding; **CONFIG_LIFTS v1→v2** three transforms (post-history-pivot guard).
- **PNG dual-chunk** (chara V2 + ccv3 V3, V2 first, before IEND), CRC-32 `0xedb88320`.
- **ST role bimap** `{0:system,1:user,2:assistant}` — was written 4×, now ONE in `kit/message-role` (D32).
- **`scopedCharacterId=''` sentinel** (not NULL) for the shared memory bucket (knowledge-cluster).
- **two-layer prototype-pollution defense** (schema superRefine + `deepMergeRequestBody` runtime check).
- **`parseNeoPresetFile` strict** vs `parsePromptConfig` lenient — both behaviors preserved.
- **storedVersion (DB column) beats in-blob version probe** (versioned-config) — else lifts re-run and corrupt.
- **regex executor**: macros run on the template before `$N` splice (captured model text never re-evaluated).

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 10. Open decisions

- ~~The kit-purity ruling (§0)~~ — **RESOLVED 2026-06-25**: isomorphic npm allowed; the ~6 zod-using resolvers stay as-is. (Gate = no domain/Node import, not no-npm.)
- **`jsonValueSchema`** — kept in `kit/json` (generic primitive); promote to contracts only if it ever gates a wire input.
- **buddy `sprites.ts`** — client presentation (imports a contracts taxonomy type, so can't be kit); confirm no server-side ASCII preview is wanted.
- **`character_summaries.tags` / facets vs labels** — out of this slice (discovery vs tag); handled in the domain fan-out.
- The full per-symbol tables (with file:line + consumer lists) are in the 4 agent returns; this doc is the consolidation. Re-run the agents (or the codemod-kit `findImportersOfFile`) for any symbol needing exact references at execution time.

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## Event-bus parity audit — orbweaver vs SillyTavern (`event_types`)

> **Status: RESOLVED → ledger D50 (2026-06-28).** Acted on: `chatOpened` + `worldInfoActivated` added to
> `ChatBusEvent` (+ the `chat_events` CHECK regenerated into the squashed `0000_baseline`); `speakerCharacterId`
> added to `turnStarted`. **#4 (`character.deleted`/`asset.deleted`) REJECTED** — orbweaver evicts derived
> rows by FK `ON DELETE CASCADE`, so an eviction event would be a racy duplicate (boundaries-are-physics, not
> ST's event-driven eviction). Macros confirmed NOT event-driven (zero bus work). The prompt-mutation
> interceptor seam is recorded as a separate ordered `PromptTransform` pipeline step, NOT a bus event. The
> findings below are the evidence base for D50.
>
> **Status: PARITY AUDIT (2026-06-28).** Does orbweaver's planned event taxonomy cover every event the
> SillyTavern macro / STscript / Quick-Reply / extension layer actually hooks? Scope is the **automation
> surface** D46 Tier-1 (`on <event> where <predicate> do <action>`) and the D46 Tier-2 plugin host consume:
> the **closed, server-side, id-only** `ChatBusEvent` + `DomainEvent` unions. References:
> ledger **D46** (`core/Core-Laws-and-Precedents.md`), `proposals/scripting-automation-extensibility.md` §5.
>
> **Why this is born-compliant-before-Phase-5:** these events freeze into the `chat_events` table + the
> closed `ChatBusEvent`/`DomainEvent` unions. Widening the union _after_ Phase 5 wires triggers to it is the
> exact retrofit D46 calls out ("chat events as a typed id-only closed union" is a pre-Phase-5 deliverable).
> The point of this audit is to land the union **complete** before chat is built.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 1. orbweaver's current event surface (the baseline)

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

### `ChatBusEvent` — `packages/contracts/src/chat/index.ts` (~L368), persisted to `chat_events` with a per-chat `seq` replay cursor

Grouped:

- **Streaming:** `delta` (text|reasoning).
- **Canon mutations (carry `view?: MessageView`, the no-refetch carrier):** `messageCommitted`,
  `messageEdited`, `variantSelected`, `messagesDeleted`, `messagesReordered`, `reasoningEdited`,
  `reasoningCleared`, `reasoningStreamDone`.
- **Turn lifecycle (the explicit extensibility seam):** `turnStarted` (`intent: send|swipe|continue|generate|impersonate`, `api`, `source`, `model`, `targetMessageId`), `turnCompleted`, `turnAborted` (`reason: user|error|stale`).
- **Persona:** `personaSwitched` (per-participant active persona; `from`/`to`).
- **World-info (embedded `WiBusEvent` from `#world-info`):** `wiBookAttached`, `wiBookDetached`, `wiEntryAttached`, `wiEntryDetached`, `wiEntryScopeChanged` — all `surface: "chat"`, attachment-only (book/entry CONTENT edits are NOT here).
- **Chat existence:** `chatCreated`, `chatDeleted`.
- **Resume control (subscription-synthesized, never logged):** `historyTruncated`.
- **Catch-all (low-payload row changes — star/archive/title/variables/injections/compact):** `chatUpdated`.

Bus-payload allowlist is type-level: every member is branded ids + enum literals + scalars + `MessageView`;
no `unknown`/`Record`/index field, so secrets are **unrepresentable** (`.contract.test` pins it). No member
carries a caller id (D19 — attribution lives on the turn path). `CHAT_BUS_EVENT_TYPES satisfies
Record<ChatBusEvent["type"], true>` keeps the replay guard exhaustive.

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

### `DomainEvent` — `packages/contracts/src/events/index.ts` (in-process bus, D38)

- `character.updated` (CharacterId) — indexer re-embeds card-text.
- `asset.created` (AssetId) — indexer embeds both image lenses.

Closed, id-only; the subscriber **re-reads canon by id**, never trusting event-carried data. Emitted via an
injected `EmitDomainEvent` op (composition root), wired at `entry/compose/event-bus.ts`.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 2. Are ST MACROS event-driven? — No (substitution-time, one tiny exception)

ST macros (`public/scripts/macros.js`, `MacrosParser.registerMacro`) are **expansion-time substitution**:
`{{char}}`/`{{user}}`/`{{roll}}`/`{{getvar}}` resolve when `substituteParams` walks a string during prompt
assembly. They are NOT subscribers to `eventSource`. The macro engine has exactly **two** `eventSource.on`
calls in the whole file, and both exist only to cache one scalar for one macro: `{{lastGenerationType}}`
listens to `GENERATION_STARTED` (record the type) and `CHAT_CHANGED` (reset it). That is a value cache, not
an event-driven engine.

**Implication:** macros need NO event-bus parity. orbweaver's `kit/macro` (already ahead on determinism +
DoS bounding per D46) is the right home, and its env-by-reference resolution at assembly time is the
equivalent of ST's substitution. The event surface that matters for parity is **STscript / Quick-Reply
event-triggers + extension `eventSource.on` subscribers** — that is what §3–§5 map.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 3. The full mapping table (ST `event_types` → orbweaver disposition)

`event_types` has ~85 entries. Disposition: **COVERED** (maps to an existing member), **GAP**
(automation-relevant, no equivalent — actionable), **N/A** (client-DOM/UI, credential, or D49-rejected),
**HOOK** (a _mutating_ pre-send interceptor, NOT a fire-and-forget event — see §6).

| ST event                                                                                                                                                                                                                                                              | Category             | Disposition        | Maps to / note                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `MESSAGE_SENT`                                                                                                                                                                                                                                                        | chat lifecycle       | **COVERED**        | `messageCommitted` (role=user)                                                                                                  |
| `MESSAGE_RECEIVED`                                                                                                                                                                                                                                                    | chat lifecycle       | **COVERED**        | `messageCommitted` (role=assistant)                                                                                             |
| `USER_MESSAGE_RENDERED`                                                                                                                                                                                                                                               | render (DOM)         | **COVERED**        | `messageCommitted`; render≠commit is client-only                                                                                |
| `CHARACTER_MESSAGE_RENDERED`                                                                                                                                                                                                                                          | render (DOM)         | **COVERED**        | `messageCommitted`; heaviest extension hook (expressions/regex post-process) — server equiv is commit                           |
| `MESSAGE_EDITED`                                                                                                                                                                                                                                                      | chat lifecycle       | **COVERED**        | `messageEdited`                                                                                                                 |
| `MESSAGE_UPDATED`                                                                                                                                                                                                                                                     | chat lifecycle       | **COVERED**        | `messageEdited` (post-edit commit)                                                                                              |
| `MESSAGE_DELETED`                                                                                                                                                                                                                                                     | chat lifecycle       | **COVERED**        | `messagesDeleted`                                                                                                               |
| `MESSAGE_SWIPED`                                                                                                                                                                                                                                                      | chat lifecycle       | **COVERED**        | `variantSelected` (flip to existing) + `turnStarted{intent:swipe}`/`turnCompleted` (swipe-generate)                             |
| `MESSAGE_SWIPE_DELETED`                                                                                                                                                                                                                                               | chat lifecycle       | **COVERED**        | `variantSelected` re-emits the surviving view (a variant delete repoints the slot); `messageEdited` view carries `variantCount` |
| `MESSAGE_REASONING_EDITED`                                                                                                                                                                                                                                            | chat lifecycle       | **COVERED**        | `reasoningEdited`                                                                                                               |
| `MESSAGE_REASONING_DELETED`                                                                                                                                                                                                                                           | chat lifecycle       | **COVERED**        | `reasoningCleared`                                                                                                              |
| `STREAM_TOKEN_RECEIVED` (+`SMOOTH_…` alias)                                                                                                                                                                                                                           | generation           | **COVERED**        | `delta{kind:text}`                                                                                                              |
| `STREAM_REASONING_DONE`                                                                                                                                                                                                                                               | generation           | **COVERED**        | `reasoningStreamDone`                                                                                                           |
| `GENERATION_STARTED`                                                                                                                                                                                                                                                  | generation           | **COVERED**        | `turnStarted`                                                                                                                   |
| `GENERATION_ENDED`                                                                                                                                                                                                                                                    | generation           | **COVERED**        | `turnCompleted`                                                                                                                 |
| `GENERATION_STOPPED`                                                                                                                                                                                                                                                  | generation           | **COVERED**        | `turnAborted{reason:user}`                                                                                                      |
| `IMPERSONATE_READY`                                                                                                                                                                                                                                                   | generation           | **COVERED**        | `turnCompleted{intent:impersonate}` (impersonate result; orbweaver's `TurnIntent` includes `impersonate`)                       |
| `CHAT_CREATED` / `GROUP_CHAT_CREATED`                                                                                                                                                                                                                                 | chat existence       | **COVERED**        | `chatCreated` (solo=degenerate group, D16 — one event)                                                                          |
| `CHAT_DELETED` / `GROUP_CHAT_DELETED`                                                                                                                                                                                                                                 | chat existence       | **COVERED**        | `chatDeleted`                                                                                                                   |
| `CHAT_RENAMED`                                                                                                                                                                                                                                                        | chat existence       | **COVERED**        | `chatUpdated` (title is a low-payload row change)                                                                               |
| `PERSONA_CHANGED`                                                                                                                                                                                                                                                     | persona              | **COVERED**        | `personaSwitched` (per-chat active persona)                                                                                     |
| `WORLDINFO_*` attach/detach (implicit)                                                                                                                                                                                                                                | world-info           | **COVERED**        | `wiBookAttached/Detached`, `wiEntryAttached/Detached`, `wiEntryScopeChanged`                                                    |
| `CHARACTER_EDITED` / `CHARACTER_RENAMED` / `CHARACTER_DUPLICATED`                                                                                                                                                                                                     | character            | **COVERED**        | `DomainEvent character.updated`                                                                                                 |
| **`CHAT_CHANGED`**                                                                                                                                                                                                                                                    | chat lifecycle / nav | **GAP**            | proposal's flagship trigger ("on chat open, set POV") has no member — see §5 #1                                                 |
| **`WORLD_INFO_ACTIVATED`**                                                                                                                                                                                                                                            | generation/WI        | **GAP**            | "which lore entries fired this turn" — QR+expressions hook it; only `AssembleTrace` (debug) exists — see §5 #2                  |
| **`GROUP_MEMBER_DRAFTED`**                                                                                                                                                                                                                                            | group arbitration    | **GAP**            | speaker chosen before generation; `turnStarted` carries NO speaker id — see §5 #3                                               |
| **`CHARACTER_DELETED`**                                                                                                                                                                                                                                               | character            | **GAP**            | no `DomainEvent character.deleted` → indexer can't evict embeddings — see §5 #4                                                 |
| `GENERATION_AFTER_COMMANDS`                                                                                                                                                                                                                                           | generation           | **COVERED**(+HOOK) | fire-and-forget side = `turnStarted`; the "still mutate input before assembly" side = the §6 interceptor seam                   |
| `GENERATE_BEFORE_COMBINE_PROMPTS`                                                                                                                                                                                                                                     | prompt assembly      | **HOOK**           | mutating pre-send — §6, NOT a bus event                                                                                         |
| `GENERATE_AFTER_COMBINE_PROMPTS`                                                                                                                                                                                                                                      | prompt assembly      | **HOOK**           | mutating pre-send — §6                                                                                                          |
| `GENERATE_AFTER_DATA`                                                                                                                                                                                                                                                 | prompt assembly      | **HOOK**           | mutating wire-data — §6                                                                                                         |
| `CHAT_COMPLETION_PROMPT_READY`                                                                                                                                                                                                                                        | prompt assembly      | **HOOK**           | the big one — extensions rewrite the final prompt array — §6                                                                    |
| `CHAT_COMPLETION_SETTINGS_READY` / `TEXT_COMPLETION_SETTINGS_READY`                                                                                                                                                                                                   | prompt assembly      | **HOOK**/N-A       | mutate gen params pre-send (text-completion family is D49 by-design-out)                                                        |
| `WORLDINFO_FORCE_ACTIVATE`                                                                                                                                                                                                                                            | world-info           | N/A (action)       | a script _action_ (force an entry), not a trigger → a D46 Tier-1 action, not an event                                           |
| `SETTINGS_UPDATED`                                                                                                                                                                                                                                                    | settings             | GAP (LOW)          | no server settings-changed event; low automation demand — see §5 #5                                                             |
| `GROUP_UPDATED`                                                                                                                                                                                                                                                       | group/roster         | GAP (LOW)/COVERED  | roster/config change ≈ `chatUpdated`; a discrete `rosterChanged` (member joined/left) is reserved-additive — see §5 #5          |
| `WORLDINFO_UPDATED`                                                                                                                                                                                                                                                   | world-info           | GAP (LOW)          | WI _book content_ edit (vs attach); `DomainEvent worldinfo.updated` if WI ever gets embedded — §5 #5                            |
| `PRESET_CHANGED/DELETED/RENAMED(_BEFORE)`                                                                                                                                                                                                                             | preset               | N/A (LOW)          | preset CRUD; `DomainEvent preset.updated` only if a subscriber appears — reserved-additive                                      |
| `PERSONA_CREATED/UPDATED/RENAMED/DELETED`                                                                                                                                                                                                                             | persona              | N/A                | persona CRUD; no indexer/automation subscriber — re-read on demand                                                              |
| `CONNECTION_PROFILE_LOADED/CREATED/DELETED/UPDATED`                                                                                                                                                                                                                   | connection/settings  | N/A                | client connection-profile UI; server connection domain re-reads                                                                 |
| `TOOL_CALLS_PERFORMED`                                                                                                                                                                                                                                                | tool use             | GAP (LOW)          | D48 owns the loop; tool calls persist on the variant — an "on tool call" trigger is reserved-additive, not pre-Phase-5          |
| `TOOL_CALLS_RENDERED`                                                                                                                                                                                                                                                 | render               | N/A                | DOM render of tool cards                                                                                                        |
| `SD_PROMPT_PROCESSING` / `IMAGE_SWIPED`                                                                                                                                                                                                                               | imagery              | N/A                | D49 `domain/imagery` (mutate-the-SD-prompt hook lives there, not the chat bus)                                                  |
| `FORCE_SET_BACKGROUND`                                                                                                                                                                                                                                                | theming              | N/A                | D49 — background is a `ThemeOverride` token, not an event                                                                       |
| `MESSAGE_FILE_EMBEDDED` / `FILE_ATTACHMENT_DELETED` / `MEDIA_ATTACHMENT_DELETED`                                                                                                                                                                                      | databank             | N/A (deferred)     | D49 databank graft; its own events land with that leaf                                                                          |
| `TTS_JOB_STARTED/AUDIO_READY/JOB_COMPLETE`                                                                                                                                                                                                                            | tts                  | N/A                | D49 by-design-out (no audio transport)                                                                                          |
| `EXTRAS_CONNECTED` / `ONLINE_STATUS_CHANGED` / `MAIN_API_CHANGED` / `CHATCOMPLETION_SOURCE_CHANGED` / `CHATCOMPLETION_MODEL_CHANGED`                                                                                                                                  | connection/UI        | N/A                | client connection state; no server bus meaning                                                                                  |
| `SECRET_WRITTEN/DELETED/ROTATED/EDITED`                                                                                                                                                                                                                               | credentials          | N/A (by design)    | the credential firewall — these are precisely what orbweaver's bus-payload allowlist BANS from a bus                            |
| `APP_INITIALIZED`/`APP_READY`/`EXTENSIONS_FIRST_LOAD`/`EXTENSION_SETTINGS_LOADED`/`SETTINGS_LOADED(_BEFORE/_AFTER)`/`CHAT_LOADED`/`MORE_MESSAGES_LOADED`                                                                                                              | app/UI               | N/A                | client lifecycle/DOM; no server-side meaning                                                                                    |
| `MOVABLE_PANELS_RESET`/`CHARACTER_EDITOR_OPENED`/`CHARACTER_PAGE_LOADED`/`CHARACTER_GROUP_OVERLAY_STATE_CHANGE_*`/`CHARACTER_FIRST_MESSAGE_SELECTED`/`CHARACTER_MANAGEMENT_DROPDOWN`/`OPEN_CHARACTER_LIBRARY`/`WORLDINFO_SETTINGS_UPDATED`/`WORLDINFO_ENTRIES_LOADED` | UI/DOM               | N/A                | pure client-DOM panel/editor events                                                                                             |
| `OAI_PRESET_*`/`ITEMIZED_PROMPTS_*`                                                                                                                                                                                                                                   | UI                   | N/A                | preset-export/token-itemizer UI                                                                                                 |
| `WORLDINFO_SCAN_DONE`                                                                                                                                                                                                                                                 | WI                   | N/A                | covered by `AssembleTrace` (debug surface), not an automation trigger                                                           |
| `GROUP_WRAPPER_STARTED/FINISHED`                                                                                                                                                                                                                                      | group internal       | N/A                | ST's internal group-turn-loop bracketing; orbweaver's loop is server-internal                                                   |
| `CHARACTER_RENAMED_IN_PAST_CHAT`                                                                                                                                                                                                                                      | data migration       | N/A                | a one-shot data-fix, not a trigger                                                                                              |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 4. ST MACROS — restated finding

Confirmed in §2: ST macros are **substitution-time**, not event subscribers (one scalar-cache exception).
**No macro parity work is required on the event bus.** Macro parity is the `kit/macro` engine + DX layer
(D46), entirely separate from this audit.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 5. The GAP list — actionable born-compliant additions (ranked by real automation dependence)

Each is id-only, re-read-canon, and named per the closed-union discipline. Ordered by how much real ST
automation depends on it.

1. **`chatOpened` — HIGH — add to `ChatBusEvent`.** Payload: `{ type: "chatOpened"; chatId: ChatId }`.
   The proposal's headline Tier-1 example ("on chat open, set POV") and ST's most-subscribed automation
   trigger (`CHAT_CHANGED`, 7+ extension subscribers incl. Quick-Reply's `onChatChanged`) have **no
   equivalent**. `chatCreated` fires once at birth; this is the recurring "this chat became the active
   context for a participant" signal. Treat it like `historyTruncated` — **subscription-synthesized** when a
   participant's stream attaches to a chat (server-side, not a client nav echo), so it is honestly a
   server event, not a DOM relay. Without it, the single most common ST automation pattern cannot be
   written. **This is the one true must-land gap.**

2. **`worldInfoActivated` — MEDIUM-HIGH — add to `ChatBusEvent`.** Payload:
   `{ type: "worldInfoActivated"; chatId: ChatId; entryIds: WorldEntryId[] }`. ST's `WORLD_INFO_ACTIVATED`
   is the "these lore entries fired this turn" signal Quick-Reply and the expressions extension hook to
   react to lore. orbweaver computes exactly this in `AssembleTrace.matchedKeys`/`wiTrace` but only as a
   debug payload — there is no bus trigger. id-only is clean (the entry ids; the subscriber re-reads
   contents). Enables "when lore entry X activates, do Y" — a genuine power-user pattern.

3. **Speaker identity on `turnStarted` (or a `speakerDrafted` event) — MEDIUM — amend `ChatBusEvent`.**
   ST's `GROUP_MEMBER_DRAFTED` (Quick-Reply's `onGroupMemberDraft`) fires when arbitration picks the next
   speaker, _before_ generation. orbweaver's `turnStarted` carries `intent/api/source/model/targetMessageId`
   but **no speaker character id** — so "when it's X's turn, inject Y" is unwritable. Cheapest fix: add
   `speakerCharacterId: CharacterId | null` to `turnStarted` (null for user/narrator turns). Avoids a new
   member; folds the drafted-speaker signal into the turn it belongs to. (A separate `speakerDrafted` is
   only warranted if automation must run _between_ draft and assembly — that overlaps the §6 hook seam.)

4. **`character.deleted` (+ `asset.deleted`) — MEDIUM — add to `DomainEvent`.** Payloads:
   `{ type: "character.deleted"; characterId }`, `{ type: "asset.deleted"; assetId }`. The indexer has
   `character.updated`/`asset.created` but **no deletion counterpart** — embeddings for a deleted card/asset
   are never evicted (an indexer-correctness gap more than an automation one, but it freezes into the same
   closed union, so land it now). ST tracks both (`CHARACTER_DELETED`, `MEDIA_ATTACHMENT_DELETED`).

5. **LOW / reserved-additive (note, don't necessarily land pre-Phase-5):**
   - `settings.updated` / `preset.updated` (`DomainEvent`) — ST `SETTINGS_UPDATED`/`PRESET_CHANGED`; no
     orbweaver subscriber today, re-read on demand. Add when a real subscriber appears.
   - `rosterChanged` (`ChatBusEvent`) — discrete member joined/left (ST `GROUP_UPDATED`). `chatUpdated`
     covers the coarse case today; promote to a dedicated member if member-presence automation lands.
   - `worldinfo.updated` (`DomainEvent`) — WI _book content_ edit; only matters if WI entries become an
     embedding lens (they aren't currently).
   - `toolCallPerformed` (`ChatBusEvent`) — ST `TOOL_CALLS_PERFORMED`; D48 owns the loop and persists on
     the variant, so an "on tool call" trigger is reserved-additive, not pre-Phase-5.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 6. The pre-send interceptor / prompt-mutation seam — NOT an event (called out separately)

A cluster of ST "events" are **mutating pre-send hooks**, fundamentally different from a fire-and-forget
bus event — they hand the extension the chat/prompt and let it **rewrite or abort** before send:

- **Extension interceptors** (`generate_interceptor` manifest field → `runGenerationInterceptors`,
  `extensions.js:2024`, invoked at `script.js:4537`): each gets `(chat, contextSize, abort, type)` and may
  **mutate `chat` in place or set `abort`**. The Vectors and Stable-Diffusion extensions ship one.
- **`setExtensionPrompt(key, value, position, depth, …)`** (`script.js:8899`): registers prompt text the
  assembler splices at a position/depth.
- **Regex** (`getRegexedString`, `regex_placement.*`): rewrites user input / AI output / reasoning around
  send and render.
- **`GENERATE_BEFORE/AFTER_COMBINE_PROMPTS`, `GENERATE_AFTER_DATA`, `CHAT_COMPLETION_PROMPT_READY`,
  `CHAT_COMPLETION_SETTINGS_READY`**: emitted with a mutable payload the listener edits in place.

**These must NOT be modeled as `ChatBusEvent` members.** orbweaver's bus is id-only and re-read-canon — a
member literally cannot carry the mutable prompt buffer (the allowlist makes it unrepresentable), and a
fire-and-forget subscriber cannot block/rewrite the turn. The correct homes already exist in the
architecture and D46:

- **`kit/injection`** (`InjectionPlacement {depth, role}`) + `ChatInjection`/`chat_injections` — the
  declarative "splice text at a position/depth" surface = ST's `setExtensionPrompt`.
- **The assembly pipeline** (`AssembleContext` → BUILD/SHAPE in `domain/chat`) — the deterministic ordered
  place where overrides/sections/WI resolve = ST's `*_COMBINE_PROMPTS`/`PROMPT_READY`.
- **D46 Tier-1 actions** ("run a macro template over the draft", "insert a world-info entry") and **Tier-2**
  (a sandboxed transform under `can()`) — the _governed_ mutation path, capability-checked + budgeted,
  unlike ST's any-extension-mutates-anything model.

**Recommendation:** keep prompt mutation entirely out of the event union; document that the interceptor seam
= `kit/injection` + the assembly pipeline + D46 Tier-1/2 actions. If a synchronous "transform the draft
before send" plugin hook is wanted, it is a **registered ordered transform on the turn pipeline** (a
`PromptTransform` step injected at the composition root), NOT a bus subscription — a distinct mechanism that
should be named as such so a cold agent never tries to shove mutation through `ChatBusEvent`.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 7. Verdict

**The taxonomy is ~90% complete and structurally sound — the chat/turn/message lifecycle, streaming, swipes,
reasoning, persona, WI-attachment, and chat existence all map cleanly, and orbweaver is actually _ahead_ of
ST in places (`delta`, `historyTruncated`, `messagesReordered`, the `chatUpdated` catch-all, the exhaustive
replay guard).** But there are **four real, automation-relevant gaps to land before Phase 5 freezes the
closed union**: (1) **`chatOpened`** — the single highest-value miss, since the proposal's flagship "on chat
open" trigger and ST's most-subscribed automation event have no equivalent; (2) **`worldInfoActivated`** —
the lore-fired trigger, computed but not emitted; (3) a **speaker id on `turnStarted`** — without it group
"whose turn" automation is unwritable; and (4) **`character.deleted`/`asset.deleted`** on the `DomainEvent`
bus for indexer correctness. Everything else is COVERED, LOW/reserved-additive, or correctly N/A (client-DOM,
credential, or D49-rejected). Separately and importantly: ST's prompt-mutation "events" (interceptors /
`setExtensionPrompt` / regex / `*_PROMPT_READY`) are **not** events — do not port them into the bus; they
are the `kit/injection` + assembly-pipeline + D46-action seam. Land the four members, add the speaker field,
and the union is parity-complete and born-compliant for Phase 5.

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## Orbweaver — SillyTavern feature-gap register

> **Status: CLOSED, CANONICAL inventory (ledger D49, 2026-06-28).** This is the **complete** catalog of
> SillyTavern (ST) features orbweaver would ever consider — Nate: _"anything we identified is the sum total
> of what we would want."_ Every row carries a DISPOSITION: `committed` (a ledger D-entry / a `proposed/`
> domain) · `deferred-with-a-reserved-home` (a `FLAG[PD-x]` row + a `proposed/` doc) · `by-design-out`
> (rejected by a decision/the constitution). **A cold agent does NOT re-audit ST** — re-opening "should we
> add X from ST?" without a row here is out of bounds; if a genuinely new ST feature surfaces, ADD a row
> with its disposition rather than re-running the audit. **Committed/adjudicated sets:** the
> scripting/automation/variables surface (**D46** / `proposals/scripting-automation-extensibility.md`); the
> seven cheap features in §7 (**D47**); image _display_/theming + vision _input_ (**D44/D45**); tool/function
> calling + structured output (**D48**); and this round's five picks — imagery · gallery/media-surfaces ·
> background · expressions · **Data Bank (the former OPEN call, now DECIDED build-as-additive-graft)** —
> adjudicated in **D49** with homes in `domains/proposed/{image-studio,media-surfaces,expression-stage,databank,tool-use}/`.
>
> **Provenance:** compiled 2026-06-28 from a source-level audit (5 parallel agents reading ST's real
> `public/scripts/**` + orbweaver's `packages/**` + docs). Difficulty ratings are grounded in orbweaver's
> actual seams, not guesses.
>
> **Cold-read orientation:** orbweaver is a maximal-rigor remake of _neo-tavern_, itself a remake of _ST_.
> **The lineage matters:** neo already cut ST down to a focused chat/character/memory engine, so most of
> these gaps were created at the **ST→neo** step and orbweaver simply inherited the narrowed scope — they
> are not new orbweaver deletions. Constitution: the package cake `kit ← contracts ← db ← server ← client`,
> sealed provider backends, two ownership categories (D18/D23), no extension/scripting runtime. See
> `Core-0-Architecture-and-Structure.md` + `core/Core-Laws-and-Precedents.md`.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## Legend

**Status** — `ABSENT` (not in orbweaver) · `PARTIAL` (capability exists, surface/wiring missing) ·
`RESERVED` (a born-compliant column/seam exists, feature deferred) · `COVERED` (orbweaver does an
equivalent, listed for completeness) · `BY-DESIGN-OUT` (deliberately rejected by a decision/constitution).

**Add-back difficulty** —

- `TRIVIAL` — a thin surface over an existing seam.
- `MODERATE` — normal feature work; fits existing patterns (a domain verb, a request-shaper, a client surface).
- `PAINFUL` — small code wrapped around new persistence, a dropped subsystem, or a gate/security conflict.
- `ARCHITECTURAL` — needs a subsystem orbweaver doesn't have (a protocol path, an inference role, an audio
  transport, a sandbox/scripting runtime) — or conflicts with the constitution.
- `N/A` — recommend never (no product fit / superseded by an orbweaver decision).

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 1. Inference backends & sampling

The wall behind most of this: orbweaver speaks **`ChatApi = agent-sdk | chat-completions | responses`** —
all OpenAI-shaped messages/agent-session protocols. It has **no raw text-completion path** and no
instruct-style prompt-assembly. Anything text-completion is not "add a source" (the D39 template only fits
OpenAI/Anthropic-wire backends) — it needs a 4th protocol axis + an assembly subsystem the design rejects.

| Feature                                                                           | What it is (ST)                                                     | Status        | Difficulty                              | Note / home                                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| AI Horde                                                                          | crowdsourced volunteer-GPU, async job-poll, text-completion         | ABSENT        | ARCHITECTURAL                           | new `ChatApi` (async-poll) + text-completion assembly; `deriveRunner` has no non-SSE arm                           |
| NovelAI                                                                           | proprietary text-completion wire, NAI samplers, NerdStash tokenizer | ABSENT        | ARCHITECTURAL                           | non-OpenAI wire + tokenizer-zoo (a decided wall)                                                                   |
| KoboldAI (classic)                                                                | raw `/generate`, `sampler_order`, text-completion                   | ABSENT        | ARCHITECTURAL                           | text-completion wall. (Modern KoboldCpp in OpenAI mode is covered by `custom_openai`)                              |
| textgen family (ooba/aphrodite/tabby/llama.cpp/ollama/togetherai/…)               | ~15 backends + ~60 samplers                                         | PARTIAL       | MODERATE (compat) / ARCHITECTURAL (raw) | OpenAI-compat members **already covered** by `custom_openai`/`vllm`; only raw-text-completion members hit the wall |
| Direct model providers (native Anthropic/OpenAI/Google keys, not via OpenRouter)  | direct chat-completion sources                                      | ABSENT        | MODERATE                                | the **clean D39 case**; `CRED_PROVIDERS` already reserves `anthropic\|openai\|google_vertex` slots                 |
| instruct-mode + context templates                                                 | wraps turns into one completion string                              | ABSENT        | ARCHITECTURAL                           | no text-completion runner to feed; structurally rejected                                                           |
| sysprompt library                                                                 | named, macro-substituted system prompts                             | ABSENT        | MODERATE                                | preset/settings CRUD; `systemPrompt {static,dynamic}` + `kit/macro` already exist                                  |
| CFG scale                                                                         | negative-prompt + guidance_scale                                    | ABSENT        | ARCHITECTURAL                           | only text-completion/NAI honor it; OpenAI wire has no `guidance_scale`                                             |
| logprobs display                                                                  | per-token probability viz                                           | ABSENT        | MODERATE                                | chat-completions/responses carry `top_logprobs`; **not** agent-sdk; display-only                                   |
| sampler select / ordering                                                         | reorder `sampler_order`/priority                                    | ABSENT        | ARCHITECTURAL (PAINFUL via passthrough) | a raw-textgen concept; survives only as an untyped `customParameters` blob                                         |
| logit bias                                                                        | per-token bias                                                      | PARTIAL       | MODERATE                                | `UserIntent.logitBias` contract + firewall gate exist; needs UI + a real tokenizer for bias-by-word                |
| tokenizer zoo                                                                     | per-model tokenizers (tiktoken/LLaMA/NerdStash/…)                   | BY-DESIGN-OUT | ARCHITECTURAL                           | `kit/tokens` deliberately rejects the zoo (decided); truth = provider `usage`. Only token-id features need it      |
| grammar / JSON-schema constrained output                                          | `json_schema`/`response_format`                                     | ABSENT        | MODERATE–PAINFUL                        | no structured-output seam in `UserIntent`/runners; OR + compat servers support it                                  |
| exotic samplers (DRY, XTC, mirostat, dynatemp, top_a, TFS, typical_p, smoothing…) | textgen sampler set                                                 | PARTIAL       | MODERATE (per-knob)                     | ride `customParameters` today (no UI); first-class = a contract cascade per knob                                   |

**Gotcha:** `custom_openai` + `customParameters` already silently cover much of the textgen world; don't
rebuild ollama/tabby/llama.cpp-server as named sources (that's a `no-inline-union-redecl` doubling).

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 2. Presentation & multimedia (the "visual novel" layer neo dropped)

Mostly client (Phase 6, unbuilt). Several resurrect the VN scene compositor orbweaver removed, or need an
inference role that doesn't exist.

| Feature                                             | What it is (ST)                                               | Status               | Difficulty       | Note / home                                                                                                                                                                                                                                                                          |
| --------------------------------------------------- | ------------------------------------------------------------- | -------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Welcome screen                                      | landing: recent/pinned chats                                  | ABSENT               | TRIVIAL→MODERATE | already the reference example in the client spec (`UI-Architecture-and-Layout.md` `{kind:landing}`)                                                                                                                                                                                  |
| Gallery                                             | per-character image grid                                      | ABSENT               | MODERATE         | per-user CAS backend exists; a Phase-6 `@orb/ui` surface                                                                                                                                                                                                                             |
| Image-gen in chat (txt2img portrait/"selfie")       | SD ext generate-from-chat                                     | ABSENT               | MODERATE         | the `generateImage` role exists (hosted); needs a Phase-5 chat caller                                                                                                                                                                                                                |
| Expressions / sprites                               | emotion classifier → sprite swap (+ live2d/VRM)               | ABSENT               | ARCHITECTURAL    | needs a classify/vision role + the dropped VN compositor + a per-turn hook                                                                                                                                                                                                           |
| Backgrounds (app background image)                  | set an app/chat-chrome background image                       | DEFERRED-CHEAP (D49) | TRIVIAL          | **was wrongly rated PAINFUL** — Nate clarified it's app-chrome theming, NOT the VN scene-compositor. A D44 `ThemeOverride.background` token (`AssetRef\|ExternalUrl` + `fit`), per-user global + per-chat lock, via `<ThemeScope>` (never raw `url()`). `proposed/expression-stage/` |
| Audio / BGM / blip sounds                           | scene/char music + typing blips                               | ABSENT               | PAINFUL          | player is trivial; "which track for this scene" needs new persistence + VN coupling                                                                                                                                                                                                  |
| TTS (text-to-speech)                                | ~30 providers + narrate pipeline                              | ABSENT               | ARCHITECTURAL    | a new inference role **and** a streaming-audio transport (SSE is text/JSON) + Phase-5 hook                                                                                                                                                                                           |
| STT (speech-recognition)                            | voice input                                                   | ABSENT               | ARCHITECTURAL    | new audio-in transport + role                                                                                                                                                                                                                                                        |
| Dynamic custom CSS + rich HTML cards + inline media | per-char/chat CSS, stat-block HTML, inline images/audio/video | **ADDRESSED**        | —                | **resolved in `UI-Theming-and-Content.md` §12 (D44)** — token-override Tier A (safe, zero injection) + sandboxed-iframe Tier B for raw HTML/CSS; media via `MessageMedia` + `forbidExternalMedia`. The earlier PAINFUL/security-conflict framing is **superseded**               |
| UI themes / moving-UI                               | drag-reposition panels + themes                               | BY-DESIGN-OUT        | N/A / MODERATE   | container-driven layout (`UI-Architecture-and-Layout.md`) replaces moving-UI; theming maps onto DTCG tokens if wanted                                                                                                                                                                |
| Server thumbnails / animated-image detect           | thumbnail gen + isAnimated                                    | ABSENT               | MODERATE         | needed at scale by gallery/backgrounds; check `infra/image` coverage                                                                                                                                                                                                                 |

**Gotcha:** everything per-message (expressions, TTS-narrate, SD-in-chat, BGM auto-switch) hooks the
Phase-5 chat turn lifecycle — none can land before chat exists. Sprites/backgrounds/BGM together are
effectively rebuilding the presentation subsystem the remake removed.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 3. Scripting & extensibility

**Addressed in `proposals/scripting-automation-extensibility.md`** — not re-litigated here. Summary of the
ST surface and where it lands:

| Feature                                            | What it is (ST)                   | Status                     | Where addressed                                                                    |
| -------------------------------------------------- | --------------------------------- | -------------------------- | ---------------------------------------------------------------------------------- |
| Macros (`{{…}}`)                                   | substitution engine               | COVERED (+DX gap)          | `kit/macro` exists; DX layer committed (proposal §3.4)                             |
| Variables (local)                                  | per-chat var bag                  | COVERED                    | proposal §3 (delta-fold)                                                           |
| Variables (global)                                 | cross-chat vars                   | committed                  | proposal §3.3 (per-user `fetchOwned`)                                              |
| Regex scripts                                      | find/replace engine               | COVERED                    | `kit/regex` exists                                                                 |
| Quick Reply                                        | event→script buttons              | committed                  | proposal Tier 1 (declarative automation)                                           |
| STscript (imperative: `/while`, closures, pipes)   | the slash-command language        | committed                  | proposal Tier 2 (QuickJS sandbox, dual-mode)                                       |
| Slash-command set (~289 cmds)                      | command dispatch                  | committed                  | proposal Tier 1 actions + Tier 2 host API                                          |
| Third-party extensions (`getContext()` god-object) | dynamic-import plugins            | committed (re-architected) | proposal Tier 2 (capability-manifest membrane) — **the ST model is BY-DESIGN-OUT** |
| `setExtensionPrompt`/`/inject`                     | runtime prompt injection at depth | PARTIAL                    | `kit/injection` exists; a Tier-1 action seam                                       |
| The client event bus                               | `eventSource`/`event_types`       | ABSENT                     | the substrate Tier-1 triggers need (proposal §5)                                   |

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 4. Data ingestion & RAG-auxiliary

orbweaver rebuilt the vector substrate (embeddings/search/memory) but it is **canon-derived** — every
vector row is a pure function of chat/character/asset canon. An uploaded _document_ is not derivable from
canon (it **is** canon), which is why the Data Bank class needs a parallel doc-store, not a graft.

| Feature                           | What it is (ST)                                   | Status              | Difficulty       | Note / home                                                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------- | ------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| token-counter panel               | count tokens of pasted text                       | ABSENT              | TRIVIAL          | a count verb over the providers tokenizer + a panel                                                                                                                                                                              |
| Translate                         | per-message + auto translation                    | ABSENT              | MODERATE         | a `summarize`-style request-shaper over the `chat` role; no new backends                                                                                                                                                         |
| Caption (standalone, ad-hoc)      | "describe this image" → text                      | PARTIAL             | MODERATE         | the vision call runs inside the embeddings indexer; needs a user-facing ad-hoc verb                                                                                                                                              |
| Scrapers                          | web/file/youtube/wiki → Data Bank                 | ABSENT              | MODERATE         | simple fetchers, but **homeless without a Data Bank target**                                                                                                                                                                     |
| Web Search RAG                    | live search → inject results                      | ABSENT              | MODERATE–PAINFUL | per-turn live ingestion; no orb seam                                                                                                                                                                                             |
| Server doc text-extraction        | pdf/docx/epub/html → text                         | ABSENT              | MODERATE         | a real sub-feature any Data Bank needs (vendored lib in a loader)                                                                                                                                                                |
| Attachments / Data Bank           | per-chat/char/global file banks + doc RAG         | DECIDED-BUILD (D49) | ARCHITECTURAL    | the former OPEN call, now DECIDED (additive graft, P6/7): a single-owned `documents` producer + derived `document_chunks` + per-type FK scope junctions + chunker + db-free extraction loader. `proposed/databank/`, FLAG[PD-57] |
| Vectors as file-RAG               | chunk+embed+retrieve uploaded files               | ABSENT              | PAINFUL          | embed/search plumbing reuses; the producer/canon shape doesn't fit (needs the doc-store above)                                                                                                                                   |
| assets ext (community downloader) | download chars/extensions/audio from a repo index | ABSENT              | N/A              | no extension system, no marketplace, no ambient-audio concept; the "download a character from URL" sliver = import-from-URL                                                                                                      |

**Already covered (listed so they're not re-added):** chat-memory vectorization (→ memory/embeddings/
search, improved), image-captioning _capability_ (inline in the indexer), the RAG retrieval machinery
(embed/space/exact-scan/rerank/threshold), bulk profile import (`import` domain).

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 5. Generative media & tools

| Feature / sub-feature                                               | ST reality                       | Status              | Difficulty                    | Note / home                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | -------------------------------- | ------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosted image-gen (text→image)                                       | DALLE/Stability/Flux via API     | RESERVED→done       | TRIVIAL                       | the `generateImage` role is fully wired (hosted-only, D39)                                                                                                                                                                        |
| Image-gen in chat flow                                              | generate→store→render as message | ABSENT              | MODERATE                      | role exists; needs a Phase-5 chat verb + asset store + render                                                                                                                                                                     |
| Local SD backends (A1111/ComfyUI/Horde/sdcpp/drawthings/…)          | 20+ local sources                | ABSENT              | ARCHITECTURAL                 | each is a new credential SOURCE re-opening the firewall axis; D39 made image-gen hosted-only on purpose                                                                                                                           |
| Portrait/prompt-template modes (CHARACTER/FACE/SCENARIO/BACKGROUND) | LLM-extract → generate           | ABSENT              | MODERATE                      | a chat-domain two-step (extract→generate) atop the working role                                                                                                                                                                   |
| Inpainting / img2img                                                | mask/init-image                  | ABSENT              | MODERATE                      | `ImageGenerateRequest` is text→image only; contract widening + backend support                                                                                                                                                    |
| `/imagine` slash surface                                            | 4 commands                       | ABSENT              | MODERATE                      | Phase-6 client command surface                                                                                                                                                                                                    |
| Tool/function calling — agent-sdk path                              | recursive multi-tool loop        | COMMITTED (D47)     | MODERATE                      | `createAgentToolServer` seam + reserved `toolCalls` col; the SDK owns the loop. One registry w/ the OpenAI path (D48)                                                                                                             |
| Tool/function calling — chat-completions/responses path             | OpenAI-style tools + recurse     | COMMITTED (D48)     | MODERATE                      | the "PAINFUL/fights stateless-turn" framing is RESOLVED — the `tool` role lands on the WIRE axis + the **chat DOMAIN owns the recurse loop** (not infra). Gates landed; wire shape ships w/ the loop. `proposed/tool-use/`        |
| Reasoning data + streaming + resolve                                | native reasoning handling        | COVERED             | —                             | `message_variants.reasoning`/effort + `STREAM_DELTA_KINDS` + `resolve-chat.resolveReasoning` (D41)                                                                                                                                |
| Reasoning `<think>` auto-parse (non-native models)                  | parse inline tags                | ABSENT              | MODERATE                      | a parse step in the chat turn                                                                                                                                                                                                     |
| Reasoning UI render / effort picker                                 | collapsible blocks + effort UI   | ABSENT (deferred)   | MODERATE                      | data exists; Phase-6 client (Streamdown checkpoint)                                                                                                                                                                               |
| Vision / image INPUT (image→model)                                  | `image_url` content parts        | **COMMITTED (D45)** | born-compliant before Phase 5 | `ModelCapability.vision` axis (the gate) + `ChatHistoryMessage.content` `string`→content-parts; sealed translators map image parts. Shaped in the contracts pass before Phase 5 — see D45 / `UI-Theming-and-Content.md` §12.4 |
| Structured-output via tools (`tool_choice:{type:tool}`)             | forced JSON                      | COMMITTED (D48)     | MODERATE                      | a SEPARATE `response_format` axis (not via `tool_choice`); `ModelCapability.output.structured` gate landed. `proposed/tool-use/`                                                                                                  |

**Reserved-progress (born-compliant, partially in place):** `generateImage` role (done, hosted-only) ·
`message_variants.toolCalls` column (reserved, D37 — exec loop not built) · reasoning fields (done; UI +
`<think>` auto-parse left).

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 6. Deliberately OUT by design (not gaps to "fix")

These are rejected by a decision or the constitution — record them so a cold agent doesn't "restore" them:

- **ST's third-party extension model** (`getContext()` god-object + dynamic-import of unvetted code) —
  negates resolver-enforced boundaries. The _capability_ is re-architected in the scripting proposal
  (Tier 2 membrane); the ST _mechanism_ is permanently out.
- **Raw text-completion backends + instruct-mode + CFG + sampler-ordering** — orbweaver is OpenAI-wire /
  agent-session only; the text-completion protocol path is not a feature, it's a second architecture.
- **The tokenizer zoo** — `kit/tokens` rejects per-model tokenizers; provider `usage` is the source of truth.
- **Global/shared (cross-user) state** — anything ST stores app-wide is either per-user (single-owned) or
  doesn't exist; there is no global tier (D21).
- **Community marketplace / asset downloader** — no app-store at self-hosted single-operator scale.
- **Per-char/chat arbitrary CSS** — conflicts with the token/containment gates + the "no leaks" threat model.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 7. The shape of it — cheap wins vs big lifts

**Cheap / fits existing seams (MODERATE or less):** direct model providers (clean D39), sysprompt library,
logprobs, translate, standalone caption, gallery, image-gen-in-chat, portrait modes, welcome screen,
token-counter, tool-loop on agent-sdk, reasoning `<think>` parse. Defer freely; add when wanted.

**Big lifts / need a subsystem (PAINFUL/ARCHITECTURAL):** any text-completion backend (Horde/NAI/Kobold),
expressions/sprites, TTS/STT, the Data Bank doc-store, local SD backends, the chat-completions tool loop,
backgrounds/BGM (VN layer). (Vision _input_ is NOT in this list — it's committed/born-compliant per D45.)

**The two with a _now_ window** (cheap before Phase 5, painful after — flagged because the chat substrate
is built whole):

1. **Image DISPLAY in chat (send/receive/show + external-URL links)** — the actual want; **COVERED** by the
   render model in `UI-Theming-and-Content.md` §12.3–12.4 (`MessageMedia` + a `media` block + `forbidExternalMedia`). The
   message-content block union + `MessageMedia` are the only before-Phase-5 born-compliant bits, and they're
   cheap/additive (they don't touch the send wire). **Vision INPUT to the model** (the model _sees_ an
   attached image) is **COMMITTED — D45**: a separate **send-side** contract (`ModelCapability.vision` +
   `ChatHistoryMessage.content` `string`→content-parts), born-compliant in the contracts pass **before
   Phase 5** (client.md §12.4 / D45). Distinct from display, but no longer optional.
2. **Tool-calling on the OpenAI path** — decide agent-sdk-only (cheap, seam exists) vs must-work-on-
   chat-completions (needs the `tool` role in `ChatHistoryMessage` + loop ownership) before the turn
   pipeline is built.

---

<!-- Source: Core-Legacy-Migration-and-Gaps.md -->

## 8. Cross-references

- Scripting/automation/variables/macro/STscript: `proposals/scripting-automation-extensibility.md`.
- Ownership categories + the no-global-tier + image/asset decisions: ledger D18 / D20 / D21 / D23.
- Sealed backends + adding a source (the D39 template) + roles firewall: `core/Tier-3b-Providers.md`, D39.
- Reserved columns/roles: D37 (`toolCalls`), D39 (`generateImage`), D41 (reasoning/warnings).
- Constitution + the cake + gates: `Core-0-Architecture-and-Structure.md`.
