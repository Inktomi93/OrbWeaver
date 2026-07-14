---
kind: reference
status: active
updated: 2026-07-13
---

# Audits-and-Debt (live: Promotion / Relocation Debt Registry)

> **How to read this file.** This is now the LIVE debt registry only: the active `PD-XX` flags to burn down (plus the block recovered from a broken "Cleared" table on 2026-07-01). The resolved archaeology that used to wrap it was split out 2026-07-02 into siblings — [`Core-Doc-Review-Punchlist-2026-06-28.md`](../history/Core-Doc-Review-Punchlist-2026-06-28.md) (the boundary/build-order scan + the 06-28 doc-review punch-list), [`Core-Doc-Inconsistency-Audit-2026-06-26.md`](../history/Core-Doc-Inconsistency-Audit-2026-06-26.md), and [`Core-Debt-Cleared-Ledger.md`](../history/Core-Debt-Cleared-Ledger.md) (the `## Cleared` ledger of done flags). Do not manufacture findings here.

---

## Confirmed CLEAN (do not manufacture findings here)

The spine docs (identity/settings/serde/testing), `infra.md`, `transport.md`, `entry.md`, `domain/buddy`,
`domain/discovery`, `domain/assets`, `domain/sessions`, `domain/notifications`, `domains/memory.md`,
`Core-Laws-and-Precedents.md`, `Core-Audits-and-Debt.md`, `Core-Planning-and-Checklists.md`, `Core-Audits-and-Debt.md`, and `UI-Architecture-and-Layout.md` (internally).
The ownership model (D18→D20/D23), D28 de-pin/flat-card, D16 notifications, D17 roles, D31 CredentialSource,
D33 guided-actions, D24 per-type-FK are all correct and consistent across docs.

## Promotion / Relocation Debt Registry

**The ONE place that lists every type/symbol/file deliberately homed in a TEMPORARY location with a
commitment to move (promote/relocate/replace) it later.** Born 2026-06-27 because these deferrals were
scattered across code `FLAG` comments + per-`D`-entry ledger notes + agent reports — collectively
invisible, individually forgettable. This file makes the set greppable in one place.

## The Flagging System

The codebase uses two distinct types of `FLAG` comments. It is critical to distinguish between them:

### 1. Promotion Debt (`FLAG[PD-XX]`)

Denotes **temporary debt**, missing features, stubs, and items deliberately homed in a temporary location with a commitment to move/build them later.

- Every temporary deferral lives here as a `PD-<n>` row: **item · current home · target home · TRIGGER · status**.
- Every in-code debt flag MUST cite its id: `// FLAG[PD-7]: …`. A grep of `PD-` reconciles code ↔ this registry. A flag with no row, or a row with no flag, is a drift.
- When a trigger slice is built, its agent **clears every `PD-` row whose trigger is that slice** (or flips it `done` with the resolving commit).

### 2. Architectural Markers (`FLAG[name]`)

Denotes **permanent architectural boundaries**, design invariants, and structural decisions.

- These flags (e.g., `FLAG[scope]`, `FLAG[bus-not-on-ctx]`, `FLAG[neo-quirk]`) do **NOT** have a `PD-XX` ID.
- They exist to explicitly document *why* a design is the way it is, preventing future developers or agents from mistakenly "fixing" or refactoring them.
- **DO NOT** remove or "resolve" these markers. They are load-bearing documentation.

Status: `ready` = trigger has landed, do it now · `blocked:<slice>` = waiting on that slice · `done`.

## Registry

| id | item | current home | → target home | trigger | status | |
| - | - | - | - | - | - | - |
| PD-2 | `AdminUserView` | `domain/admin/contract/views.ts` (admin owns its read-model — correct home today) | `@orb/contracts/identity` | DECIDED: stays in admin/contract; relocate ONLY if the Phase-6 admin client imports the view type directly (a concrete P6-build check, not "iff ever") | blocked:client(P6) | |
| PD-12 | credentials `CustomModelProfile` (BYO model profile) | deferred (domain/credentials) | `@orb/contracts/credentials` (NOT importing `ModelCapability` — D31 cycle) | BYO custom-endpoint form | blocked:connection/credentials | |
| PD-13 | custom-byo `CustomOpenAiResponseMap` + `includeBody`/`excludeBody` | engine built; config type deferred | `@orb/contracts` + the credential metadata | custom-endpoint form | blocked:connection/client | |
| PD-16 | providers diagnostic `signal?` threading | carried on the request shapes, unthreaded | thread through once reachable | SDK ports gain request options | blocked:upstream-sdk | |
| PD-17 | chat `agent` participant kind / agent-as-first-class-principal (`provisionAgentPrincipal`, `users.kind`) | **AP0 SCHEMA + AP1 SPINE + AP2 ATTRIBUTION BORN.** AP0 (2026-07-02, schema leaf): `users.kind`/`ownerUserId` + 3 shape CHECKs, `agent_principals` satellite, `chat_participants` kind-shape CHECK swap, `PARTICIPANT_KINDS`+`agent`, `parseParticipant` agent arm, `USER_KINDS`/`AGENT_SOURCE_KINDS`/`isReservedAgentHandle` one-homes, sessions belts. **AP1 (2026-07-02, identity spine): `provisionAgentPrincipal` mint (idempotent + race-arbiter + audit), `canAgent` + `AGENT_ACTIONS` + `AgentActor` (the AP0-deferred vocab, landed WITH `canAgent`), admin ripples (listUsers `kind` axis + `ownerHandle` join, `setRole`/`resetPassword` `cannot_modify_agent` refusals + atomic backstop, `setEnabled`-accepts-agents containment, `createUser` humans-only), the `createInvite` `__agent__` refusal, the notifications `isAgentRecipient` refusal (notifications/verbs/record.ts:25).** \*\*AP2 (2026-07-02, roster attribution + stats): the speaker-identity generalization — `SpeakerRef` ({character} | {agent}) + `speakerKey` threaded through arbitration/select-speakers/smart-arbitrate/auto-mode/round/turn (an agent is arbiter-selectable + ban-last-comparable); `AI_DRIVEN_KINDS`+`isAiDriven` (consumed by `loadRoom`'s candidate gate); the self-attribution persist arm (`buildSpeakerPrep`: agent → `characterId` NULL + `authorUserId`=agent, host-funded, byte-identical for characters); the stats twin-path VERIFIED (live `assistantTurnDelta({characterId:null})` + reconcile `foldMessage` null-cid skip both host-attribute — no code change) + the digest content-hash agent arm (`blockHash` already folds `authorUserId`).\*\* **AP3-1 (2026-07-02, seat wave — seating half): `chat.seatAgent`** (the ONE agent-seat chokepoint — requireHost → owner-present-human check → injected `provisionAgentPrincipal` mint → `resolveAgentEnabled` containment refusal → `upsertAgentSeat` re-join upsert → chatUpdated); the two injected `ChatContext` ops (`provisionAgentPrincipal` wired to sessions, `resolveAgentEnabled` inline users.enabled at the entry root); `owner_not_present`/`agent_disabled` codes; seatAgent in the verb-auth matrix. **PER-SPEAKER CARD RENDERING (2026-07-02, Phase-5 two-axis completion — was floor): `SpeakerRef`+`speakerKey` promoted to `@orb/contracts/chat`; `AssembleContext.castMembers`; `shapeContextForSpeaker` (assembly/speaker-card.ts) picks the speaker's card + coSpeakers; the pipeline wires it — each speaker now renders their OWN card (completes an untracked in-plan Phase-5 deliverable AND is the slot an agent's soul fills).** **AP3-2 partial (2026-07-02): `buddy.resolveSpeakerIdentity(ownerUserId)`→`AgentSpeakerIdentity` (soul→prompt, NO tools — `buildSoulPrompt`); the `AgentSpeakerIdentity`/`USER_BACKED_KINDS`/`isUserBacked` contract layer landed.** **observer self-event drop belt (PD-45) BUILT, runtime-inert pending AP3-2's real actingUserId feed** (the router drops an event whose acting principal is the reacting owner's own agent — `domain/buddy/observer/signal-router.ts:49-50` — guarded + tested, but the chat adapter feeds `actingUserId:null` until AP3-2 lands). Behavior otherwise on the v1 borrowed-owner posture. | per `proposed/agent-principal-design/` (D60). **AP3-2 REMAINING (buildable — the chat-side chain a seated buddy voices through):** `AGENT_SPEAKER_SOURCES` registry + `ChatContext.resolveAgentSpeaker` op + compose dispatch (agent→owner+sourceKind at root); the RESOLVE substitution (agent → soul `AssembleCharacter` into cast/castMembers); `loadRoom` agent inclusion; the present-predicate `enabled` arm (consuming `USER_BACKED_KINDS`); the `canAgent('speak')` engine gate; `AgentCardView`. **AP3-3 (buildable next):** the per-agent CONNECTION — `resolveRole('agent')` (buddy's own brain, host-funded; exists in the connection domain) vs the interim round chat-connection. **BLOCKED / not-completable now (PD flags):** (a) **agent TOOLS in rooms** — the D48 tool-use mechanism is BUILT (`domain/tool-use` registry + `runRecurseLoop`, PD-54 cleared); the residual block is the deferred buddy room-hands design decision (doc 04 §5 criterion; `'tool-propose'` ceiling is spec-only); (b) **AP4a agent-GM + rpg party seat (HEADLINE)** — blocked on **rpg** being built (R1/R3/R4) + D48; (c) **client** (seat UI / agent badge / admin tab, doc 06 §7) — Phase 6. **DONE that was deferred:** the agent-export `agent_author` provenance still needs `resolveAgentSpeaker` (its per-speaker export prereq is BUILT — PD-42). **FLAG\[PD-17] markers in code:** `ownerChatIds` (character-less agent-only room reconcile edge, un-constructable v1) + `speakerLabel` (agent soul-name in the summarizer transcript). | AP3-2/3 (chat-side) → AP4a rpg-gated | blocked:AP3-2-remaining |
| PD-18 | `reconcile-world-state` WorkloadKind + the P5 workload/presence/buddy seams (D38) | reserved tuple member / type stubs | activate in chat/workloads | v2 / P5 | blocked:v2 | |
| PD-25 | credentials DRAFT (pre-save) endpoint inspect — `providers.inspect` takes a `ResolvedCredential` (non-null `credentialId`), so an unsaved custom\_openai draft can't be inspected without a raw-args inspect op or a contract change | `domain/credentials/verbs/inspect-endpoint.ts` (saved-credential-only) | a draft-inspect path (raw args) on the providers front door, or a contract widening | custom-endpoint form (connection/client) | blocked:connection/client | |
| PD-35 | search memory-retrieval verbs — `discover` (note: `digests`/`segments`/`corpus` are BUILT) + the `MemoryQueryOptions` consumers + mix modes + membership-derived chat scope (D18) | `domain/search` (`discover` is a SEARCH verb — D55, neo `search/verbs/core.ts:249`; NOT discovery-domain) | `domain/search` verbs | chat/memory (P5) | **BUILT** (2026-07-10: `discover` + the similarity trio `similarCharacters`/`similarArt` shipped — `verbs/{discover,similar-characters,similar-art}.ts`, `persistence/display.ts` `resolveSegmentDisplay` (segment→character credit, co-star aware), `DISCOVER_*` constants, `search.{discover,similarCharacters,similarArt}` tRPC. The prior "DISCOVERY-domain / blocked:PD-40" blurb was doc defect F1 — corrected per `reports/stickler/discovery-search-untangle.md` (`discover` needs nothing from discovery; its enrich reads only tables search already reads down). `digests`/`segments`/`corpus` remain BUILT + consumed by `chat/memory/recall/recall.ts`.) | |
| PD-56 | expressions/sprites (D49) — emotion-classify → sprite swap | not built (deferred); `../proposed/expressions-design/`. schema/contracts/GC-registry/bus-member born on 0000\_baseline; classify shaper, turn hook, CRUD leaf, real runner, client stage unbuilt. | a `classify` provider role (v1 = `chat`-role shaper; v2 = `local-light classify`, D39) + a `character_sprites` model (`(characterId FK, label, assetId FK)`, owner DERIVED D23) + an `EXPRESSION_LABELS` tuple + a per-turn chat hook + a client render slot | chat lands (P5) for the per-turn hook | deferred:P7 | |
| PD-57 | databank (Data Bank / document-RAG, D49) — DECIDED build-as-additive-graft | not built (deferred Phase 6/7); `../proposed/databank-design/`. DB2-tables rider landed (documents + 3 junctions, document\_chunks, reserved {{databank}} macro slot, stub runners); remainder fully absent. | a `documents` single-owned producer + `global/character/chat_documents` junctions + a derived `document_chunks` vector table + `@orb/kit/chunk` + a db-free `infra/extraction` loader + `embeddings.store` 5th arm + a `search.documents` lens + a chat `{{databank}}` slot | post-chat (P6/7) additive graft; nothing born-compliant-now | deferred:P6/7 | |

## Bucket B — chat-landed re-verification (2026-07-01)

> **2026-07-03:** the promote-candidates PD-8/21/23/24/30/42 and PD-41 below are ALL since CLEARED
> (verified rows in [`Core-Debt-Cleared-Ledger.md`](../history/Core-Debt-Cleared-Ledger.md)) — this
> section is provenance for the re-verification pass, not live promote-work.

**Context:** a large share of the Registry was `blocked:chat(P5)`. `domain/chat` is now BUILT (roster,
arbitration engine, assembly, memory, bus, invites, auth seam). So every `blocked:chat(P5)` row was
re-checked against the actual code to see whether its trigger has landed. Verdicts below are
code-verified; **flip these statuses in the Registry as each is picked up.**

**→ PROMOTE to `ready` (trigger verified present; small-to-medium wiring, not a feature):**

- **PD-8** — `PARTICIPANT_KINDS` + `PARTICIPANT_ROLES` unions exist in `@orb/contracts/{chat,identity}`; `inspect-chat.ts` just imports them instead of `string`. Trivial.
- **PD-21** — `domain/stats` rebuild-from-canon is fully built; only the group-chat multi-owner **attribution edge** is open — confirm against chat's D18 membership (now exists). Small.
- **PD-23** — `notifications.record` (durable half) is built; chat (the producer) now exists → wire the after-commit per-user bus fan-out from the chat producer.
- **PD-24** — Same producer seam: run `record`'s INSERT inside the chat producer's membership-transition tx (chat is the tx owner, now built).
- **PD-30** — world-info chat-scope: `chatBooks`/`WiBusEvent` declared, and the two hard deps now exist — the `can({kind:'chat',roster})` arm (PD-1 DONE) + `domain/chat/bus.ts`. Wire attach/detach/list + emit.
- **PD-42** — Chat canon (`messages`/`message_variants`) exists; `domain/export` still only does character cards → build `exportChat` + JSONL/TXT.

**→ SEAM READY but FEATURE-SIZED (trigger landed; real build, not a quick burn):**

- **PD-41** — ~~confirmed inert stubs~~ **DONE (re-verified 2026-07-06): the runner bodies are BUILT** — `memory-backfill.ts` calls `ctx.env.memory.backfill`, `group-character-backfill.ts` calls `ctx.env.character.backfillGroupCharacters` (commit `0f1c201`). The "inert stub" note was stale.
- **PD-54** — ~~Tool-calling recurse loop \~absent~~ **RESOLVED (D48/PD-54 closed 2026-07-04): `domain/tool-use` registry + `runRecurseLoop` (`domain/chat/engine/engine.ts`+`pipeline.ts`) are BUILT.**
- **PD-34 / PD-35** — Embeddings memory lenses + search memory-retrieval verbs — `domain/chat/memory` is built, but the embeddings/search **consumer arms** need a focused audit of what's stub vs done before promoting.

**→ STAYS BLOCKED (verified genuinely not built — do NOT promote):**

- ~~**PD-45 / PD-64** — buddy `observer/` reaction engine not built~~ — **BUILT 2026-07-10** (the chat/workload event sources now exist; it was buddy's call, and the observer subsystem + bus + belt landed — see the PD-45 row above).
- **PD-17** — agent-as-first-class-principal — bigger identity-spine work (P5+), not a wiring flip.
- **PD-72** — memory-log sink — an observability seam, still stubbed in `entry/compose/chat.ts`. (Its former pair PD-71, the search-corpus owner-id, was BUILT 2026-07-13 — cleared ledger.)

## Registry — ACTIVE flags recovered from the broken "Cleared" table

> ⚠ The `PD-XX` rows BELOW carry LIVE `ready`/`blocked:*` statuses but were misfiled under `## Cleared`
> above (a 6-column Registry block pasted beneath the 3-column Cleared header, so active burn-down work was
> hidden as "done"). They are **ACTIVE debt**. `ready` = burnable now (trigger landed); `blocked:<slice>` =
> waiting on that slice. Fold these into the main Registry in a later pass. (Recovered 2026-07-01.)

| id | item | current home | → target home | trigger | status | |
| - | - | - | - | - | - | - |
| PD-77 | import loader subsystem | `entry/import/run-profile-dir-import.ts` | extracted importer | `collectBundlesFromDir` / `importChats` / `importPersonas` lands (one bulk-loader family) | **DONE 2026-07-13**: the ST profile-DIRECTORY importer `entry/import/run-profile-dir-import.ts` (`runProfileDirImport` + `createNodeFsImportPort`) composes `collectBundlesFromDir` → `importPersonas` (first, populates `personaByUserName`) → per-bundle `importCharacter` + `importChats`, wired as the `import.importAll` workload op in `entry/compose/runner-env.ts` (the last deferred runner-env seam — `notBuilt` deleted). Source dir configurable via `ST_PROFILE_DIR` (default repo-root `.st-data`), threaded like `IMPORT_STAGING_DIR`. `collect.ts` un-knip-ignored, the 4 `@public` loader-contract tags removed (real callers exist). | |
| PD-78 | import stats rollup | `entry/import/run-profile-dir-import.ts` | `domain/stats/` | `reconcileStats` / `enqueueBackfill` wired | **DONE 2026-07-13**: satisfied for the ST bulk path by the `import-st` runner's existing post-import settle (`ctx.env.stats.reconcileStats` when `changed>0`) + `importChats`'s `enqueueBackfill` (fires on a `real_conversation` write), both now reachable because `importAll` drives them (PD-77). | |
| PD-80 | OpenRouter account activity | `infra/providers/backends/openrouter/account.ts` | management key logic | management key in scope | blocked:later | |
| PD-84 | orphan-blob edge rebuild | `domain/assets/verbs/store.ts` | DR rebuild subsystem | DR tools built | blocked:later | |
| PD-94 | assets `store` `maxBytes` bound — neo's `storeBlob` size cap for NON-HTTP callers (the zip-extract path sniffs magic bytes AFTER the read; without the bound a zip-bomb entry buffers unbounded). Dropped in the port + previously UNTRACKED (the assets audit mis-cited it as PD-67 — that id is the invite decline). | dropped from `domain/assets` `store` params | `domain/assets` `store` params + the bulk zip loader enforcing it | blocked:PD-77 (the zip loader must land WITH the size bound or the zip-bomb belt has a hole) | **DONE 2026-07-13**: the store seam already carried the param + enforcement (`domain/assets/verbs/store.ts` rejects `bytes.byteLength > maxBytes` before the CAS write; `StoreParams.maxBytes`; pinned by `store.int.test.ts`). PD-77's ST profile importer now PASSES the bound: every card/avatar blob stores through a `PROFILE_IMPORT_MAX_ASSET_BYTES` (64 MiB) cap (`entry/import/run-profile-dir-import.ts`; `ImportAssetPort.store` widened with `maxBytes?`), pinned by `run-profile-dir-import.test.ts`. | |
| PD-93 | `imagery` base **BUILT** (`domain/imagery/verbs/generate-picture.ts`, D49#1, hosted `generateImage`); the richer **image-studio** (img2img / prompt-modes) cluster remains deferred; note: the I0 type-widening (negativePrompt/size/edit + ModelCapability.input.imageEdit) landed but is INERT — no runner honors it, no capability row sets imageEdit | `domain/imagery` (base) + `../proposed/imagery-design/` (extensions) | the img2img/image-studio cluster | only if img2img is requested | deferred:product-call (base done) | |
| PD-104 | embeddings model-change is a dead end: changing a source's `(model, dim)` strands the old-vector-space rows (upsert keys include `model`, so new rows accrete beside stale ones), `clearTable` (the dump half) has ZERO runtime consumers (test-only, PD-103-style dead surface), and nothing triggers the force re-embed sweeps. | `domain/embeddings` (no model-change path) | wire connection embed-model change → `workloads.start('embed-corpus'/'embed-assets', force)` + `embeddings.clearTable` | embed-model setting surface | ready | |
| PD-117 | the `bus-coverage` gate's founding census (2026-07-03): 5 `ChatBusEvent` members beyond the tracked PD-89 trio are declared-never-emitted — `chatOpened` (stream-attach synthesis unbuilt; FLAG in `verbs/start-chat.ts`), `historyTruncated` (retained-window synthesis unbuilt — `Tier-4-Transport.md` correctly describes it as COMMITTED, not yet built), `reasoningStreamDone` (D41 tail), `worldInfoActivated` (D50 pt-2 — `wiTrace` exists, the emit does not), `personaSwitched` (pairs with `setActivePersona` — wire-exposed since PD-99 cleared; the emit is still unwired). Each sits in the gate's self-cleaning `DEFERRED` map (`scripts/check/gates/bus-coverage.ts`) — wiring an emit turns its entry stale-RED. | `domain/chat` emit sites (unwired) | wire each emit (deleting its `DEFERRED` entry), or strike the member from the union + reducer | per-member: stream/persona/WI surfaces next touched | **PARTIAL 2026-07-05** (wave 2: `personaSwitched` \[via PD-120] + `reasoningStreamDone` \[emitted in `engine.ts` after stream-reduce] wired, both DEFERRED-map entries deleted. `worldInfoActivated` wired 2026-07-06 (`AssembleWorldEntry.id` narrowed to required `WorldEntryId`, fired-entry ids threaded `wiTrace → TurnPipelineResult → engine.ts` emit, DEFERRED entry deleted). **3 of 5 done.** STILL DEFERRED: `chatOpened` (stream-attach synthesis unbuilt) + `historyTruncated` (retained-window synthesis unbuilt — genuine feature work, not a wiring flip)) | |
| PD-130 | WS3 message-metadata chips: `appearance.showGenerationTimer` has NO consumer — the `message_variants.gen_started_at`/`gen_finished_at` columns exist (D26; `domain/stats` reads them via `genDurationMs`) but are NEVER WRITTEN for a real generation, only nulled at genesis-message seeding (`verbs/start-chat.ts`). Populating them for real needs per-backend turn-engine plumbing across every provider (`infra/providers/backends/{openai-compat,openrouter,agent-sdk}` — the same shape `ttftMs` already has) plus threading through `canon-write.ts`'s `CanonVariantInput`/`VariantEconomics` and `queries.ts`'s `messageViewSelection`, none of which exist today. WS3 shipped the other 4 metadata chips (timestamp/id/model/tokens, all real data) and left this toggle OUT of the appearance pane entirely (schema-only, same posture WS2 left it) rather than a dead control — flagged per the WS3 spec's own carve-out ("flag it rather than destabilize the engine"). | `@orb/db/schema/chat.ts` (`gen_started_at`/`gen_finished_at`, write-side unwired) · `domain/chat/engine/*` + `infra/providers/backends/*` (no start/finish stamping) · `packages/client/src/features/chat/components/message-metadata-row.tsx` (the flag site) | stamp `genStartedAt` when the engine dispatches a generation call and `genFinishedAt` at commit (mirrors `ttftMs`'s existing per-backend wiring), thread both through `CanonVariantInput`→`messageViewSelection`, add a `durationMs` (or raw pair) to `MessageView`, wire the pane control | the next turn-engine economics touch, or a dedicated small lane | ready | |
| PD-132 | chat assembly SHAPE-trace debug surface (buildShapeTrace, chat/assembly/trace.ts) — built, content-free projection for a host/admin assembly-inspector panel | chat/assembly/trace.ts (knip-ignored citing this row) | wired into an admin/devtools inspector surface | the assembly-inspector/devtools panel lands | blocked:client(P6) | |
| PD-131 | WS3 background-image `asset` source (own-upload) is schema-complete (`ThemeOverride.backgroundImage` accepts `{kind:"asset", assetId}`, D49 §3) — the client upload flow itself is BUILT (`data/upload-asset.ts` + `forms/bound-fields/avatar-upload-field.tsx`, consumed by persona), but the theme-background arm is still unwired: `resolve-theme-background.ts`'s `asset` arm always resolves to `null` (never fabricated); the theme-editor background picker (WS3) offers only seeded + external URL. | `packages/client/src/features/app-shell/lib/resolve-theme-background.ts` (`asset` arm) · `packages/client/src/features/settings/components/theme-editor.tsx` (picker offers no upload option) | wire the theme-editor background picker to the existing upload-asset flow (same resolver `avatar-upload-field.tsx` already uses) | the next theme-editor touch | ready | |

> **Symbol-census findings (2026-07-05, `f133379`+).** A repo-wide export/collision census (`scratch/symbol-census.ts` — 3,458 exports / 1,047 files → 40 collisions; jscpd clone rate **1.11%** vs the 5% gate; verb-family analysis found essentially nothing) surfaced six genuine code-symbol debts, **PD-121–126**, all now cleared — see [`Core-Debt-Cleared-Ledger.md`](../history/Core-Debt-Cleared-Ledger.md). The bulk of apparent duplication is cake-forced mirrors (packages that can't import each other restate shapes + pair them with tests) + the per-domain verb-factory convention (`createList`/`createGet`/… ×10) + the documented `assembly`↔`substrate` DI seam — confirmed CLEAN, deliberately NOT filed. Re-run as a periodic drift check: `pnpm exec tsx scratch/symbol-census.ts` (alongside `pnpm cpd`).

## Post-gut documentation follow-ups (2026-07-03)

Durable home for the non-PD debt the domain-vs-code gut rollout surfaced (previously scattered across agent reports + session notes). These are doc/law relocation + freshness work, not code-symbol PD rows. Do as one consolidated pass.

### ~~Promotes~~ — LANDED 2026-07-03

embeddings/search "ONE engine" → `Knowledge-Cluster.md`; AAD belt → `Spine-Identity-and-Auth.md`; the other 6 → `Core-0-Architecture-and-Structure.md` §8 (cross-cutting invariants). Originals kept below for provenance.

- **AAD `${userId}|${provider}` byte-identical belt** (credentials) → ledger/Core-0 (carried in `persistence/aad.ts` + `infra/crypto/secrets.ts` + schema header + aad.int pin).
- **`ResolvedCredential` brand — one construction home** (`substrate/mint.ts`) → ledger.
- **embeddings ONE-write-path** (only `embeddings/persistence` writes vector tables; `writeHubScoreRows` sole `hub_score` setter) → Core-0/ledger.
- **notifications durable-first ordering** (INSERT-then-publish; cross-cutting — inbox + chat bus both) → Core-0.
- **secret type-level-unrepresentability in wire event unions** (closed discriminated union of strict objects, ids+literals only) → Core-0.
- **agent-principal recipient refusal — `notifications.record` is the ONE write chokepoint** every producer inherits → ledger.
- **search = the ONE retrieval engine** (memory+discovery call it, never reimplement cosine; memory holds zero cosine/vector-write) → Core-0.
- **settings `defineVersionedConfig` one-primitive rule** + **settings-table tenancy rule** (settings owns the KV mechanism; tenants own blob meaning) → Core-0/Spine-Config.
- **admin users-read chokepoint** (only admin+sessions+entry read `users`; every admin read gates first) + **audit-ordering** (check→write→audit; a refused write leaves no phantom row) → Core-0.

### Doc-freshness — shared docs carry superseded facts (fix or delete)

- `Core-Laws-and-Precedents.md` §Settings: "promote IMPORT\_DEFAULT\_SOURCE to AppSettings" — DROPPED (PD-15 cleared); VLLM\_\*\_CONCURRENCY landed born-in-DB (no env floor).
- `Spine-Identity-and-Auth.md`: present-tense pre-build ("resolved twice per request", old viaFallback/viaCookie names, "role gates NOTHING") — all built; flip to built-state + absorb the two de-numbered sessions invariants (token-hash-not-stored, per-request revoked/expired/enabled recheck).
- `preset` contracts (\~L175): names a non-existent `GUIDED_ACTION_IMPLS` identifier.
- ~~stale PD-5 OIDC comments in `entry/http/auth-routes.ts` (claim OIDC unbuilt; it's built + tested).~~ FIXED
  2026-07-10 (task #62): the `auth-routes.ts` `OidcMintStore`/`OidcRoutesDeps` DEFER comments + the oidc-store
  "interim GC / no scheduled sweep" header now describe reality — the scheduled reap landed as
  `transport/jobs/oidc-gc-scheduler` (hourly `deleteExpired` sweep of expired/abandoned PKCE transactions).

### Enable-now — gates whose triggers have landed

- ~~**7 deferred gates whose triggers have now FIRED** — build each + promote to active gates~~ — DONE 2026-07-03 (PD-116, commit c3cd691): all 7 (`vector-scope-derived`/`turn-identity`/`membership-enforcer`/`solo-byte-identical`/`bus-coverage`/`member-card-clamped`/`owner-role-split`) are ACTIVE in `Core-Enforcement-Active-Gates.md` (`solo-byte-identical` as the property suite).
- Minor code-adjacent drift from the core-standardization pass: ~~`tools/grit/README.md` plugin list vs `biome.json`~~ RECONCILED 2026-07-03 (all 32 biome-activated plugins documented — the 4 missing rows `no-layout-context-props`/`no-untrusted-html-in-main-dom`/`no-external-media-without-gate`/`theme-override-only-via-scope` added; the old "19 vs 23" counts were themselves stale); STILL OPEN: `tests/support/fixtures.ts` header is forward-looking-aging (db still not a fixture); the council-review record (now compressed in `Core-Planning-and-Checklists.md`) wants a `history/Council-Review-2026-06-25.md` home.

### Consolidate — concept docs — DONE 2026-07-03 (except the mechanical de-dangle below)

- ✓ `core/Knowledge-Cluster.md` created (the producer→store→consumer boundary + 6 cross-domain invariants, all `sg`-verified). `memory.md` git rm'd — recall/build semantics are code-carried (`chat/memory/` headers + `constants.ts`), decision record = ledger D55; it also carried a full internal self-duplicate (the drift disease).
- ✓ `participants-agents-identity.md` git rm'd. Persona three-axis residue → `Spine-Identity-and-Auth.md`; agent-principal future owned by `proposed/agent-principal-design/`; everything else already homed (Tier-3b, D28, schema).
- **REMAINING — mechanical de-dangle (track for the sub; facts already inline, some cites reference dead §numbers → drop those):**
  - \~40 code cites of `memory.md` / `knowledge-cluster` / `participants-agents-identity.md` → repoint to `core/Knowledge-Cluster.md` (cluster) or `Spine-Identity`/`Tier-3b` (identity). Full file list: the concept-consolidation agent report (2026-07-03).
  - AGENTS de-dangle/trim: SUBSUMED — AGENTS-1/2/3 merged into `AGENTS.md` (2026-07-03), so the memory/participants authoritative pointers + the §"Memory ↔ search"/untangle prose became `Knowledge-Cluster.md` pointers in `AGENTS.md` §6. Remaining external de-dangle: the Tier-3b code-comment pointers (movement table / `db.md` / §D2), per the Tier report.
  - **Refresh** `Spine-Identity-and-Auth.md` (`Status: planning` → built): Principal mint built (`entry/auth/seam.ts`, the ONE construction site); `chat_participants.role='host'` now GATES (roster authority, host-handoff, membership-derived "my chats" — no `chats.ownerId`); D60 4-kind shape CHECK live (`human|character|agent|observer`, `chat_participants_kind_shape`).

### Structural / mechanical

- FLAG\[PD-101..107] at-seam comments (registry rows exist; add the in-code `FLAG` when each seam is next touched; 97/98/99 cleared 2026-07-03; 100 cleared 2026-07-04).
- `Core-Shared-Dissolution.md` — migration doc: kit-purity law stays core, the symbol map → history/.
- ~~**AGENTS-1/2/3 trim + merge**~~ — DONE 2026-07-03: trimmed to doctrine+index, then MERGED into ONE `core/AGENTS.md` (§1-8, domains.md folded in). Pain Ledger → `history/Pain-Ledger.md`; AST-scan → `history/Grounded-Intelligence-AST-Scan.md`; string-union dispatch → `Spine-TypeScript-and-Patterns.md`. Documentation-Law moved into `core/`.
- Corpus-wide `pnpm format:docs` sweep → flip `check:docs` to blocking → add frontmatter to surviving docs.
- ~~`tsdoc/syntax` cleanup → flip warn→error~~ — DONE 2026-07-03: 255 violations across 45 files cleaned, `tsdoc/syntax` is now `error` on server/kit/db/contracts.
