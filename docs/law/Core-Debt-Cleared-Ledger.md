---
kind: law
status: active
updated: 2026-09-23
---

# Orbweaver — Cleared Debt Ledger (closed PD flags)

The closed half of the `PD-XX` debt registry; the open half is `Core-Audits-and-Debt.md`. The `pd-citation-integrity` gate reads both files as one registry, so a cited PD id resolves while its row is here. Each row keeps the flag's subject and outcome; git history holds the resolution narrative.

## Cleared

| id | item | outcome |
| - | - | - |
| PD-13 | custom-byo `CustomOpenAiResponseMap` + `includeBody`/`excludeBody` config type | done |
| PD-12 | credentials `CustomModelProfile` (BYO model profile) | closed, already covered |
| PD-25 | credentials DRAFT (pre-save) endpoint inspect | closed, already covered |
| PD-130 | WS3 message-metadata `appearance.showGenerationTimer` had no consumer | done |
| PD-80 | OpenRouter account activity (per-key usage logs) | closed, not built |
| PD-84 | orphan-blob edge rebuild | done |
| PD-70 | server-derived presence + cast-gating consumer | done |
| PD-55 | gallery v2 — curated per-character media | done |
| PD-53 | embeddings BULK embed-pass workload — the `content_hash` catch-up sweep | done |
| PD-66 | targeted invites | done |
| PD-41 | workloads P5 backfill stubs — the memory/group-character runner bodies | done |
| PD-42 | export chat transcript — `exportChat` + `ExportChatFormat` + `ExportedText` + JSONL/TXT builders | done |
| PD-21 | stats canon OWNER-ATTRIBUTION for the group-chat edge | done |
| PD-24 | notifications `record` TX-ATOMICITY | done |
| PD-23 | notifications `emit` → transport bus FAN-OUT | done |
| PD-30 | world-info chat-scope attach/detach/list + `WiBusEvent` emit | done |
| PD-63 | guided steer routing | done |
| PD-65 | `reapTemporaryChats` implementation (`chats.temporary` schema seam) | done |
| PD-62 | chat lock primitive → `infra/` | done |
| PD-67 | decline invite by ID → `persistence/invites.ts` | done |
| PD-83 | password verify injection → domain identity resolution | done |
| PD-91 | IP allowlist middleware → `infra/network` | done |
| PD-90 | admin `embed` router | done |
| PD-92 | db-structure gate producer-schema mirror | done |
| PD-8 | `inspect-chat` `InspectedParticipant.{kind,role}: string` → canonical unions | done |
| PD-61 | invite verb dependencies → `ChatContext` | done |
| PD-74 | sharp image extraction → extracted module | done |
| PD-73 | host principal home → domain-level extraction | done |
| PD-88 | `chat_events` writer → `persistence/events.ts` | done |
| PD-86 | `messageHidden` bus event → `@orb/contracts/chat` | done |
| PD-87 | `participant_not_found` error → `CHAT_OP_CODES` | done |
| PD-5 | sessions `oidc-store` (`persistence/oidc-store.ts`) | done |
| PD-38 | search unified `search(UnifiedSearchParams)` dispatch + `SearchScope` | done |
| PD-40 | discovery rest-of-corpus surface | done |
| PD-39 | discovery `digest_theme_assignments.msgMidAt` backfill (themeDrift) | done |
| PD-22 | stats→discovery per-message economics read seam | done |
| PD-71 | search corpus owner ID (`entry/compose/chat.ts` stub) | done |
| PD-43 | character provenance-create + `findByImportHash` | done |
| PD-31 | character `getRosterCardView` (membership-gated, level-clamped `MemberCardView` — character.md §"member card view", D22) | done |
| PD-46 | transport `chat` router (`send`/`swipe`/`start`/`streamMessages`) + the chat service on the `Context` | done |
| PD-19 | tag `RequireParticipant` chat-tag membership gate (D30) — the port TYPE is declared in `domain/tag/contract/service.ts`; the RUNTIME guard is unwired (chat is built last, D16) | done |
| PD-60 | host-handoff verbs (`nominateHostHandoff`/`acceptHostHandoff`) — no nomination storage, so `accept` couldn't securely verify the nominee (a self-promotion hole) | done |
| PD-59 | one home for the `host\ | done |
| PD-1 | `ResourceRef` / `Can` guard types → `@orb/contracts/identity` | done |
| PD-32 | character default-card `seeder/` subsystem (`createDefaultCharacterSeeder` + `DEFAULT_CHARACTER_CARDS`) + the welcome-assistant stamp | done |
| PD-48 | embeddings on-write indexer subscription (the high-value path) | done |
| PD-0 | `infra/crypto/token-hash.ts` dead duplicate (sessions relocated it, D38) | removed |
| PD-49 | character `attachCardTag` inert (no tag by-name op) | done |
| PD-4 | `infra/auth` `validateCookie` port (dead post-D40) | removed |
| PD-33 | character `cardContentHash` → `@orb/server/kit/serde/card` | done |
| PD-44 | export `buildCardV3`/`exportBookEntry` OUT-emitter → `@orb/server/kit/serde/card` | done |
| PD-47 | transport `stats.leaderboard.sort` + `stats.latency` | done |
| PD-3 | admin vLLM engine-status view + `VllmSupervisorPort` | done |
| PD-10 | `DEFAULT_CHAT_MODEL_ID`/`DEFAULT_OR_CHAT_MODEL_ID` + `ChatModelId` brand | done |
| PD-6 | admin `SessionAdminView` ↔ sessions `SessionView` | done |
| PD-27 | assets `asset.created` at-least-once delivery | done |
| PD-11 | openrouter `rerank` typed not-supported throw | done |
| PD-15 | `IMPORT_DEFAULT_SOURCE` env + AppSettings — DROPPED (Nate 2026-06-28, neo-jank) | done |
| PD-9 | role-default binder honors `routing.roleDefaults.<role>` per role (D39 local-light arm incl.) | done |
| PD-50 | binder → async + collapse + light up the workloads worker | done |
| PD-20 | persona `setActivePersona` verb | done |
| PD-28 | assets roster-avatar membership exception — a chat participant may fetch the avatar of another participant in the same chat | done |
| PD-51 | healthz `credentialsKeyOk` self-canary probe (could not detect key rotation vs existing ciphertext) | done |
| PD-54 | tool/function-calling OpenAI-wire shape + the domain-owned recurse loop (D48) | done |
| PD-103 | credentials dead boot-helper verbs (`mintVllmCredential`/`mintLocalLightCredential`/`buildKeylessCatalogCredential`) | done |
| PD-106 | the `AUTH_MODE != 'single-user'` 404 gate — declared everywhere, enforced nowhere | done |
| PD-111 | D22 member-card clamp implemented TWICE and divergently (character `getRosterCardView` vs chat `clampMemberCard`) | done |
| PD-116 | build the 7 fired-trigger deferred gates (`vector-scope-derived`/`turn-identity`/`membership-enforcer`/`owner-role-split`/`bus-coverage`/`member-card-clamped`/`solo-byte-identical`) | done |
| PD-52 | `deriveClientIp` took the leftmost XFF hop unconditionally (spoofable by any client behind any proxy) | done |
| PD-97 | `readLatency` scope dispatch had no `assertNever` default (an unhandled `LatencyScope` kind silently fell through to owner-scope); `contract/params.ts` comments falsely claimed the guard existed | done |
| PD-98 | sessions owner-handles predicate duplicated — `entry/lifecycle.ts` re-implemented the comma-split/trim/default logic `role-policy.ts` `ownerHandles()` owns | done |
| PD-99 | `persona.setActivePersona` verb built + composed but client-unreachable (no tRPC procedure) | done |
| PD-113 | terminal-failed workloads emitted NO audit (pino + the failed row were the only trail — D1 audit-surface condition unmet) | done |
| PD-114 | Stryker configs pinned the phantom `domain/chat/routing.ts` + stale "skeleton — cannot run" `_comment`s | done |
| PD-115 | `vitest.config.ts` `passWithNoTests: true` justified by a stale "lanes have no files yet" comment — a typo'd include glob passed silently | done |
| PD-95 | D56 `simpleSend` naming collision — the name Guided Generations uses for "Commit Without Turn" (persist a user message, NO AI response) was held by a production verb that DOES generate (an arbitration-skipping solo path, byte-identical to a solo `send`, zero prod consumers) | done |
| PD-96 | `owner_stats.characters` never live-counted — `StatsDelta.newCharacter` existed and `applyStatsDelta` honored it, but no production builder ever SET it (`chatCreatedDelta` omitted it); the drift suite passed only by hand-spreading `newCharacter: true` onto the builder output | done |
| PD-100 | `messages.personaId` attribution never fell back to the participant's `activePersonaId` — `send`/`impersonate` stamped caller-supplied `personaId ?? null`, so a client omitting the param produced a null-persona user line while an active persona was set | done |
| PD-110 | `runOnEdit` regex-on-edit was claimed-but-unwired — `contract/service.ts` + `contract/params.ts` TSDoc asserted the re-apply while `createEditMessage` ran only the self-label purify then wrote verbatim; the `runOnEdit` schema field was declared but never read | done |
| PD-118 | the `observability` per-request middleware (`foundation/observability/middleware.ts` — X-Request-Id + request-root span + request-ring record) was BUILT + exported and doc-claimed "Mounted by `entry/app`" (its own header + `Tier-2-Foundation.md §16`), but `entry/app.ts`'s `.use("*")` chain never imported it — the `/api/_debug/traces` ring stayed empty and no response carried `X-Request-Id` | done |
| PD-58 | client observability — the browser has NO pino (Node-only); needs the client side built. Port neo's format-parity helpers (`client/lib/log-clock.ts` HH:MM:SS.mmm console tag + `[channel]` tags + the tRPC `loggerLink` + `long-task-tracer`) so browser console reads like server pino, PLUS an error boundary + a client→server error-report sink so client errors land in the same `/api/_debug` ring/log (the real "unify pino + console"). The server pino/pino-pretty side is DONE (string levels · isoTime · err serializer · the dev pino-pretty config). | done |
| PD-29 | assets `sniffMime` → `@orb/kit/assets` | done |
| PD-34 | embeddings memory lenses — the `chat-block` SourceKind + `segment`/`digest` lenses + `newChatDigestId`/`newChatSegmentId` (the `satisfies Record<SourceLens,VectorTable>` belt + the store `assertNever` go red until added) | done |
| PD-36 | search cross-modal `images` verb (text→image) + the cross-modal CSLS-skip exception | done |
| PD-37 | search lexical BM25 `fields`/`suggest` engine (`minisearch` not in the workspace) | done |
| PD-45 | buddy `observer/` reaction engine + `bus.ts` — reacts to chat/workload event sources that don't exist pre-chat (buddy builds first to expose the agent seam, D38); the pure mood machine it drives IS built | done |
| PD-64 | buddy observer / reaction engine | done |
| PD-72 | memory log sink | done |
| PD-75 | `UserSettings.workloads.themes.k` | done |
| PD-89 | `WiBusEvent` entry-level variants (`wiEntryAttached`/`wiEntryDetached`/`wiEntryScopeChanged`) | done |
| PD-101 | `@orb/server/kit/custom-parameters.ts` is a placeholder scaffold, but `@orb/contracts/preset` claims the Layer-2 prototype-pollution defense `deepMergeRequestBody` ("the ACTUAL defense") lives there. Runners use a shallow overlay (custom-byo `runners/chat.ts:228` FLAG\[PD-13]; openrouter `mergeCustomParameters`). Esoteric #8's two-layer invariant currently has only Layer 1 (schema superRefine). Arguably safe today (boundary validation + object-spread makes `__proto__` an own key) — a defense-in-depth / doc-truth gap. | done |
| PD-102 | search read-only-context is faked-as-claimed: `SearchContext.db` is the full `Db`, but the code header asserts "the bundle carries no write path." Behaviorally read-only (no write is issued) but nothing prevents one — the compile-time read-only enforcement the invariant promised does not exist. | done |
| PD-105 | notifications `invite` variant is never emitted: the union variant, schema slot, and tests all exist, but `chat/verbs/invites.ts` `createInvite` resolves a targeted `invitedUserId` (PD-66) then stops at persist — no `emitNotification({type:'invite'})`. The founding "invite DELIVERY surface" use case is ⅓ unwired; a targeted invitee gets no inbox row. | done |
| PD-107 | assets PD-28 roster-avatar exception is implemented BROADER than D21: `loadCoParticipantOwner` (`entry/compose/services.ts:295`) gates only on (hash→any owner) + (both users co-members of any shared chat) and serves ANY asset kind of a co-participant (gallery/attachment/generated/export) — a known-bytes existence oracle between co-participants. D21 (amended 2026-07-02) demands avatar + sprite-set of a roster character ONLY, via a reference-check. The widening was never adjudicated. **UPDATE (2026-07-03, #25):** the chat MESSAGE-IMAGE path was reworked OFF this lookup — `resolveImageRefToUrl` (`entry/compose/resolve-image-ref.ts`) now gates by a chat-scoped REFERENCE-CHECK (is the asset's owner a PRESENT participant of the referencing chat? — `chatId` threaded through `ResolveImageUrlOp`; owner+mime read by-id, no `getMetadata`/`loadCoParticipantOwner`), so it is NO LONGER a consumer of the broad lookup. PD-107 now scopes to its ONE remaining consumer: the blob-serve `getMetadata` co-participant fallback (PD-28 avatars) — which D21 says should likewise become a `character.avatarAssetId`/`character_sprites` reference-check; the message-image path is the model to mirror. | done |
| PD-108 | import re-import of an EDITED (or second same-name) card dead-ends on `characters_owner_handle_unique`: the built dedup is file-byte `importHash` only; the doc's `(ownerId, handle)` + `cardContentHash` match and the D28 edit-in-place re-import are unbuilt AND unflagged (`cardContentHash` is only used for character contentHash stamping, never for import matching). Surfaces as a raw unique-constraint string in `failures[]`. | done |
| PD-109 | export download surface is unbuilt: `createExportService` is composed (`entry/compose/services.ts:567`) and both verbs (`createExportCharacter`/`createExportChat`) + the serde core are built and tested, but the HTTP registrar `entry/http/export.ts` was never built — so both verbs have ZERO runtime consumers (PD-103/PD-99-style dead surface). | done |
| PD-112 | `CustomOpenAiCredential` has no `contextWindow` field — the council's D4 "BYO 2M-context model budgeted to 128k" footgun is unbuilt (zero `contextWindow` under `packages/contracts/src/credentials/`); it survived only as a Checklists row. | done |
| PD-119 | the `@orb/ui/message-list` seal was doc-claimed (UI-Gates §11.3, UI-Theming §12.2, `proposed/ui-package-design.md`) to own "a no-recycle path for stateful/Tier-B rows", but the built seal is pure windowed `@tanstack/react-virtual` — rows mount/unmount on scroll and a stable `getItemKey` does NOT keep an off-screen row mounted, so a Tier-B `sandbox-frame` iframe reloads when scrolled out+back and an edit-in-place textarea loses local state (neo's virtualizer footgun #3). A PD-106-class doc-truth gap (doc-claimed-built, actually-unbuilt capability). The three docs were TRUTHED 2026-07-04c + `FLAG[PD-119]` added at the `MessageListProps` site; this PD tracks BUILDING the capability. | done |
| PD-120 | `persona.setActivePersona`'s chat-table write is a RAW inline `chatParticipants` UPDATE in the composition root (`entry/compose/services.ts` `setChatActivePersona`) — the one domain-owned table written outside any domain (2026-07-05 persona review). Consequences: chat can attach no invariants to the write; the 0-rows-affected case (target not a participant) silently no-ops; and the flip has no bus emit — which is exactly PD-117's `personaSwitched` declared-never-emitted member (a room's other members/devices only learn on refetch). | done |
| PD-121 | `EFFORT_LEVELS` / `EffortLevel` / `effortLevelSchema` declared TWICE in `@orb/contracts` with DIVERGENT members — preset's includes `'none'`, connection's deliberately EXCLUDES it (its comment explains why). Same three names, same package, different unions → an import-the-wrong-one landmine `no-inline-union-redecl` CANNOT catch (the member sets differ, so it does not read as a respelling). (symbol-census 2026-07-05) | done |
| PD-122 | `normalizeVector` duplicated (local-light model-cache + vllm engine) — LOAD-BEARING: the knowledge-cluster local↔hosted embedding swap depends on IDENTICAL L2-norm on both paths (the cosine≈1.0 probe guards exactly this divergence); two hand-rolled copies is the risk the probe fears. (symbol-census 2026-07-05) | done |
| PD-123 | `sniffMime` duplicated with DIVERGENT semantics — assets' is strict/typed (no match → fail), vllm's is loose (defaults to png). Extends PD-29 + D61/B5a (the `@orb/kit/image-sniff` promotion, not yet landed): the vllm site is a THIRD consumer that note never counted. (symbol-census 2026-07-05) | done |
| PD-124 | `useInvalidation` copy-pasted per feature (chat + settings, near-identical headers admitting it) — it touches tRPC + QueryClient, so the homing rule puts it in `client/data`; it IS the planned central invalidation seam (§11.3/§13.1 `invalidation.ts`, domain-event → `queryFilter`). The D62 feature lanes (character/preset/world-info) will each copy it again — hoist NOW before it is five copies. (symbol-census 2026-07-05) | done |
| PD-125 | persona mirrored character's persistence wholesale — its OWN `CharacterNotFoundError` class + its own `detailOf`. Legal under the cake (domains can't import each other), but two distinct error CLASSES with the same name for one concept → an `instanceof` / name error-identity check can silently match the wrong one. (symbol-census 2026-07-05) | done |
| PD-126 | two same-name confusions that bite the files most likely to import BOTH: `NumberField` (`@orb/ui` primitive) vs `NumberField` (client bound-field wrapper); `CharacterCard` (`@orb/contracts` wire type = the ST card format) vs `CharacterCard` (the React component). (symbol-census 2026-07-05) | done |
| PD-127 | the tolerant card IN-adapter (`cardFromJson`) preserves residual **`data.extensions.*`** keys only (`residualExtensions`) — unknown **top-level `data.*`** keys are silently dropped on import AND never re-emitted on export (`buildCardV3` writes only the typed columns' data-root keys). Same lossiness class §7.3 killed for `raw`, but scoped to `data.extensions` and missing the `data.*` root. ST-V3 puts several fields at `data.*` top-level: `group_only_greetings` (group-chat-only greetings — orbweaver HAS group chats), `nickname` (overrides `{{char}}`), `source` (provenance URL array; we store single `importedFrom`), `creation_date`/`modification_date`, `creator_notes_multilingual`. Upstream marinara's importer explicitly lists `group_only_greetings`+`nickname`, so real corpus cards carry them. NOT `data.assets[]` — expression sprites are the deferred `domain/expressions` initiative (D49 item 4), not this gap. (character review 2026-07-05) | done |
| PD-128 | the persona-path `personaSwitched` emit (PD-120) runs through a SECOND `createChatBus` instance built at persona's compose site (`entry/compose/services.ts` — persona composes before chat, a genuine cycle: chat needs `persona.get` for turn assembly). This VIOLATES the `bus.ts` FLAG\[bus-not-on-ctx] "`service.ts` builds ONE bus" doctrine. Safe TODAY only because `createChatBus`'s in-memory replay ring (`readRing`) has ZERO consumers — the SSE resume (`transport/trpc/routers/chat.ts`) ramps from the DURABLE `chat_events` log (`replayChatEvents`) + the transport live bus (`publishChatEvent`), both of which the split bus feeds correctly. LATENT TRAP: bus.ts's own comment says the transport "reads the ring … later" (an intended future hot-path optimization); if that is ever wired, a `personaSwitched` (or any future persona-path emit) landing only in the split instance's ring creates a per-chat `seq`-gap hole for ring-window resumers. (wave-2 review 2026-07-05) | done |
| PD-129 | client PERSONA seeding gap | done |
| PD-7 | agent-sdk reseed-from-canon | done |
| PD-26 | assets maintenance verbs (`backfillAvatars`/`collectGarbage`/`reapIfOrphan`/`fsck`/`rebuildFromTree`) + the avatar-ref registry | done |
