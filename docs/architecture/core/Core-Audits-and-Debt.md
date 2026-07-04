# Audits-and-Debt (live: Promotion / Relocation Debt Registry)

> **How to read this file.** This is now the LIVE debt registry only: the one open decision, the active `PD-XX` flags to burn down (plus the block recovered from a broken "Cleared" table on 2026-07-01). The resolved archaeology that used to wrap it was split out 2026-07-02 into siblings — [`Core-Doc-Review-Punchlist-2026-06-28.md`](../history/Core-Doc-Review-Punchlist-2026-06-28.md) (the boundary/build-order scan + the 06-28 doc-review punch-list), [`Core-Doc-Inconsistency-Audit-2026-06-26.md`](../history/Core-Doc-Inconsistency-Audit-2026-06-26.md), and [`Core-Debt-Cleared-Ledger.md`](../history/Core-Debt-Cleared-Ledger.md) (the `## Cleared` ledger of done flags). Do not manufacture findings here.

---

## The one OPEN DECISION (not a doc-fix — needs Nate)

**Graduate the scripting proposal + the 7 greenlit ST features to ledger D-entries?** The proposal (and the
ST features Nate greenlit) use committed language but have no ledger entry; the proposal's header says it
isn't law until ledgered. Resolve by either (a) writing the D-entries (makes the cake homes real), or
(b) softening the proposal vocabulary to "proposed." Until decided, the `proposals/` MED finding above and
the `sillytavern-feature-gap` "committed" statuses sit in limbo.

<!-- Source: Core-Audits-and-Debt.md -->

## Confirmed CLEAN (do not manufacture findings here)

The spine docs (identity/settings/serde/testing), `infra.md`, `transport.md`, `entry.md`, `domain/buddy`,
`domain/discovery`, `domain/assets`, `domain/sessions`, `domain/notifications`, `domains/memory.md`,
`Core-Laws-and-Precedents.md`, `Core-Audits-and-Debt.md`, `Core-Planning-and-Checklists.md`, `Core-Audits-and-Debt.md`, and `UI-Architecture-and-Layout.md` (internally).
The ownership model (D18→D20/D23), D28 de-pin/flat-card, D16 notifications, D17 roles, D31 CredentialSource,
D33 guided-actions, D24 per-type-FK are all correct and consistent across docs.

<!-- Source: Core-Audits-and-Debt.md -->

## Promotion / Relocation Debt Registry

**The ONE place that lists every type/symbol/file deliberately homed in a TEMPORARY location with a
commitment to move (promote/relocate/replace) it later.** Born 2026-06-27 because these deferrals were
scattered across code `FLAG` comments + per-`D`-entry ledger notes + agent reports — collectively
invisible, individually forgettable. This file makes the set greppable in one place.

<!-- Source: Core-Audits-and-Debt.md -->

## The Flagging System

The codebase uses two distinct types of `FLAG` comments. It is critical to distinguish between them:

<!-- Source: Core-Audits-and-Debt.md -->

### 1. Promotion Debt (`FLAG[PD-XX]`)

Denotes **temporary debt**, missing features, stubs, and items deliberately homed in a temporary location with a commitment to move/build them later.

- Every temporary deferral lives here as a `PD-<n>` row: **item · current home · target home · TRIGGER · status**.
- Every in-code debt flag MUST cite its id: `// FLAG[PD-7]: …`. A grep of `PD-` reconciles code ↔ this registry. A flag with no row, or a row with no flag, is a drift.
- When a trigger slice is built, its agent **clears every `PD-` row whose trigger is that slice** (or flips it `done` with the resolving commit).

<!-- Source: Core-Audits-and-Debt.md -->

### 2. Architectural Markers (`FLAG[name]`)

Denotes **permanent architectural boundaries**, design invariants, and structural decisions.

- These flags (e.g., `FLAG[scope]`, `FLAG[bus-not-on-ctx]`, `FLAG[neo-quirk]`) do **NOT** have a `PD-XX` ID.
- They exist to explicitly document *why* a design is the way it is, preventing future developers or agents from mistakenly "fixing" or refactoring them.
- **DO NOT** remove or "resolve" these markers. They are load-bearing documentation.

Status: `ready` = trigger has landed, do it now · `blocked:<slice>` = waiting on that slice · `done`.

<!-- Source: Core-Audits-and-Debt.md -->

## Registry

| id | item | current home | → target home | trigger | status | |
| - | - | - | - | - | - | - |
| PD-2 | `AdminUserView` | `domain/admin/contract/views.ts` (admin owns its read-model — correct home today) | `@orb/contracts/identity` | DECIDED: stays in admin/contract; relocate ONLY if the Phase-6 admin client imports the view type directly (a concrete P6-build check, not "iff ever") | blocked:client(P6) | |
| PD-7 | agent-sdk reseed-from-canon | `infra/providers/backends/agent-sdk/session/` (seam exists; unfed) | wire the durable `sessionStore` / canon feed | chat/canon (P5) | blocked:sdk-session | |
| PD-12 | credentials `CustomModelProfile` (BYO model profile) | deferred (domain/credentials) | `@orb/contracts/credentials` (NOT importing `ModelCapability` — D31 cycle) | BYO custom-endpoint form | blocked:connection/credentials | |
| PD-13 | custom-byo `CustomOpenAiResponseMap` + `includeBody`/`excludeBody` | engine built; config type deferred | `@orb/contracts` + the credential metadata | custom-endpoint form | blocked:connection/client | |
| PD-16 | providers diagnostic `signal?` threading | carried on the request shapes, unthreaded | thread through once reachable | SDK ports gain request options | blocked:upstream-sdk | |
| PD-17 | chat `agent` participant kind / agent-as-first-class-principal (`provisionAgentPrincipal`, `users.kind`) | **AP0 SCHEMA + AP1 SPINE + AP2 ATTRIBUTION BORN.** AP0 (2026-07-02, schema leaf): `users.kind`/`ownerUserId` + 3 shape CHECKs, `agent_principals` satellite, `chat_participants` kind-shape CHECK swap, `PARTICIPANT_KINDS`+`agent`, `parseParticipant` agent arm, `USER_KINDS`/`AGENT_SOURCE_KINDS`/`isReservedAgentHandle` one-homes, sessions belts. **AP1 (2026-07-02, identity spine): `provisionAgentPrincipal` mint (idempotent + race-arbiter + audit), `canAgent` + `AGENT_ACTIONS` + `AgentActor` (the AP0-deferred vocab, landed WITH `canAgent`), admin ripples (listUsers `kind` axis + `ownerHandle` join, `setRole`/`resetPassword` `cannot_modify_agent` refusals + atomic backstop, `setEnabled`-accepts-agents containment, `createUser` humans-only), the `createInvite` `__agent__` refusal.** \*\*AP2 (2026-07-02, roster attribution + stats): the speaker-identity generalization — `SpeakerRef` ({character} | {agent}) + `speakerKey` threaded through arbitration/select-speakers/smart-arbitrate/auto-mode/round/turn (an agent is arbiter-selectable + ban-last-comparable); `AI_DRIVEN_KINDS`+`isAiDriven` (consumed by `loadRoom`'s candidate gate); the self-attribution persist arm (`buildSpeakerPrep`: agent → `characterId` NULL + `authorUserId`=agent, host-funded, byte-identical for characters); the stats twin-path VERIFIED (live `assistantTurnDelta({characterId:null})` + reconcile `foldMessage` null-cid skip both host-attribute — no code change) + the digest content-hash agent arm (`blockHash` already folds `authorUserId`).\*\* **AP3-1 (2026-07-02, seat wave — seating half): `chat.seatAgent`** (the ONE agent-seat chokepoint — requireHost → owner-present-human check → injected `provisionAgentPrincipal` mint → `resolveAgentEnabled` containment refusal → `upsertAgentSeat` re-join upsert → chatUpdated); the two injected `ChatContext` ops (`provisionAgentPrincipal` wired to sessions, `resolveAgentEnabled` inline users.enabled at the entry root); `owner_not_present`/`agent_disabled` codes; seatAgent in the verb-auth matrix. **PER-SPEAKER CARD RENDERING (2026-07-02, Phase-5 two-axis completion — was floor): `SpeakerRef`+`speakerKey` promoted to `@orb/contracts/chat`; `AssembleContext.castMembers`; `shapeContextForSpeaker` (assembly/speaker-card.ts) picks the speaker's card + coSpeakers; the pipeline wires it — each speaker now renders their OWN card (completes an untracked in-plan Phase-5 deliverable AND is the slot an agent's soul fills).** **AP3-2 partial (2026-07-02): `buddy.resolveSpeakerIdentity(ownerUserId)`→`AgentSpeakerIdentity` (soul→prompt, NO tools — `buildSoulPrompt`); the `AgentSpeakerIdentity`/`USER_BACKED_KINDS`/`isUserBacked` contract layer landed.** Behavior otherwise on the v1 borrowed-owner posture. | per `proposed/agent-principal-design/` (D60). **AP3-2 REMAINING (buildable — the chat-side chain a seated buddy voices through):** `AGENT_SPEAKER_SOURCES` registry + `ChatContext.resolveAgentSpeaker` op + compose dispatch (agent→owner+sourceKind at root); the RESOLVE substitution (agent → soul `AssembleCharacter` into cast/castMembers); `loadRoom` agent inclusion; the present-predicate `enabled` arm (consuming `USER_BACKED_KINDS`); the `canAgent('speak')` engine gate; `AgentCardView`. **AP3-3 (buildable next):** the per-agent CONNECTION — `resolveRole('agent')` (buddy's own brain, host-funded; exists in the connection domain) vs the interim round chat-connection. **BLOCKED / not-completable now (PD flags):** (a) **agent TOOLS in rooms** — blocked on the **D48 tool-use system** (unbuilt: no `domain/tool-use`; engine says "NO D48 tool-recurse (NEXT chunk)") THEN a deferred design decision (buddy's room-hands, doc 04 §5 criterion; `'tool-propose'` ceiling specced); (b) **AP4a agent-GM + rpg party seat (HEADLINE)** — blocked on **rpg** being built (R1/R3/R4) + D48; (c) **client** (seat UI / agent badge / admin tab, doc 06 §7) — Phase 6; (d) observer self-event drop (PD-45). **DONE that was deferred:** the agent-export `agent_author` provenance still needs `resolveAgentSpeaker` (its per-speaker export prereq is BUILT — PD-42). **FLAG\[PD-17] markers in code:** `ownerChatIds` (character-less agent-only room reconcile edge, un-constructable v1) + `speakerLabel` (agent soul-name in the summarizer transcript). | AP3-2/3 (chat-side) → AP4a rpg-gated | blocked:AP3-2-remaining |
| PD-18 | `reconcile-world-state` WorkloadKind + the P5 workload/presence/buddy seams (D38) | reserved tuple member / type stubs | activate in chat/workloads | v2 / P5 | blocked:v2 | |
| PD-22 | stats→discovery per-message economics read seam — NOT built. DECIDED (Nate 2026-06-28): build it **D26-aware** (read economics from `message_variants`, NEVER neo's `messages`-columns premise). The stats domain itself (`applyStatsDelta`/`reconcileStats`) is ALREADY D26-aware (built post-D26) — there is no existing jank to rewrite; this is the consumer-side READ. Build it WITH the discovery corpus-economics consumer (PD-40), not as a consumer-less seam now. | `domain/stats/persistence/` (D26-aware) + the discovery consumer | the discovery corpus-economics surface lands (PD-40) | blocked:discovery-corpus(PD-40) |
| PD-25 | credentials DRAFT (pre-save) endpoint inspect — `providers.inspect` takes a `ResolvedCredential` (non-null `credentialId`), so an unsaved custom\_openai draft can't be inspected without a raw-args inspect op or a contract change | `domain/credentials/verbs/inspect-endpoint.ts` (saved-credential-only) | a draft-inspect path (raw args) on the providers front door, or a contract widening | custom-endpoint form (connection/client) | blocked:connection/client |
| PD-26 | assets maintenance verbs (`backfillAvatars`/`collectGarbage`/`reapIfOrphan`/`fsck`/`rebuildFromTree`) + the avatar-ref registry | not built (deliberate v1-defer) | `domain/assets` + injection into character.remove / the workloads runner | DECIDED (Nate 2026-06-28): a NAMED v2 maintenance/ops pass, not "someday" — the orphan-blob leak is slow + benign (avatars are small, hard-deletes rare), so there is no v1 driver; build when blob-store growth is a real concern OR an ops/maintenance admin surface lands. The workloads runner-env already holds the inert seams. | deferred:v2-maintenance |
| PD-29 | assets `sniffMime` → `@orb/kit/assets` | `domain/assets/substrate/mime.ts` | `@orb/kit` | iff the client ever pre-sniffs | blocked:client(P6) |
| PD-34 | embeddings memory lenses — the `chat-block` SourceKind + `segment`/`digest` lenses + `newChatDigestId`/`newChatSegmentId` (the `satisfies Record<SourceLens,VectorTable>` belt + the store `assertNever` go red until added) | `domain/embeddings` (W2 = card/image only) | `domain/embeddings` store arms + indexer | chat/memory built whole (P5, D16) | blocked:audit |
| PD-35 | search memory-retrieval verbs — `discover` (note: `digests`/`segments`/`corpus` are BUILT) + the `MemoryQueryOptions` consumers + mix modes + membership-derived chat scope (D18) | `domain/search` (W2 = card knn/findCharacters only); the `@orb/contracts/search` seam exists | `domain/search` verbs | chat/memory (P5) | blocked:audit |
| PD-36 | search cross-modal `images` verb (text→image) + the cross-modal CSLS-skip exception | `domain/search` | `domain/search` | imageEmbed space + a later wave | blocked:later |
| PD-37 | search lexical BM25 `fields`/`suggest` engine (`minisearch` not in the workspace) | `domain/search` | `domain/search` + the minisearch dep | a later lexical-search wave | blocked:later |
| PD-38 | search unified `search(UnifiedSearchParams)` dispatch + `SearchScope` (premature with a partial verb set) | `domain/search` | `domain/search` | after the memory + lexical verbs land | blocked:search-verbs |
| PD-39 | discovery `digest_theme_assignments.msgMidAt` backfill (themeDrift) — assignments write without it (column nullable) | `domain/discovery/themes` | `domain/discovery` | the themeDrift wave | blocked:later |
| PD-40 | discovery rest-of-corpus surface (distill/browse/archetype/projection/similarity/catalog/insights/tag-suggest/cooccurrence + the chat near-dup arm `duplicate_chat_pairs`/`relation`) | not built (W3 = character dup + themes/hub only) | `domain/discovery` | later corpus waves + chat (P5) | blocked:later |
| PD-45 | buddy `observer/` reaction engine + `bus.ts` — reacts to chat/workload event sources that don't exist pre-chat (buddy builds first to expose the agent seam, D38); the pure mood machine it drives IS built | not built (deferred) | `domain/buddy/observer` | chat event sources (P5) | blocked:buddy |
| PD-56 | expressions/sprites (D49) — emotion-classify → sprite swap | not built (deferred); `proposed/expressions-design/` | a `classify` provider role (v1 = `chat`-role shaper; v2 = `local-light classify`, D39) + a `character_sprites` model (`(characterId FK, label, assetId FK)`, owner DERIVED D23) + an `EXPRESSION_LABELS` tuple + a per-turn chat hook + a client render slot | chat lands (P5) for the per-turn hook | deferred:P7 |
| PD-57 | databank (Data Bank / document-RAG, D49) — DECIDED build-as-additive-graft | not built (deferred Phase 6/7); `proposed/databank-design/` | a `documents` single-owned producer + `global/character/chat_documents` junctions + a derived `document_chunks` vector table + `@orb/kit/chunk` + a db-free `infra/extraction` loader + `embeddings.store` 5th arm + a `search.documents` lens + a chat `{{databank}}` slot | post-chat (P6/7) additive graft; nothing born-compliant-now | deferred:P6/7 |
| PD-58 | client observability — the browser has NO pino (Node-only); needs the client side built. Port neo's format-parity helpers (`client/lib/log-clock.ts` HH:MM:SS.mmm console tag + `[channel]` tags + the tRPC `loggerLink` + `long-task-tracer`) so browser console reads like server pino, PLUS an error boundary + a client→server error-report sink so client errors land in the same `/api/_debug` ring/log (the real "unify pino + console"). The server pino/pino-pretty side is DONE (string levels · isoTime · err serializer · `scripts/dev/pino-pretty.json`). | not built (Phase-6 client) | `@orb/client` log helper + tRPC loggerLink + error boundary + a `clientError` report verb feeding the foundation log/ring | client build (P6) | blocked:client(P6) |

<!-- Source: Core-Audits-and-Debt.md -->

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

- **PD-41** — Workloads memory/group-char runners are **confirmed inert stubs** (`group-character-backfill.ts` = "INERT P5 stub. FLAG\[PD-41]"); chat+memory now exist → wire the runner bodies.
- **PD-54** — Tool-calling: the capability GATES landed, but the domain-owned recurse loop is \~absent in `engine/` → genuine feature (wire seams + `domain/tool-use` registry + the loop).
- **PD-34 / PD-35** — Embeddings memory lenses + search memory-retrieval verbs — `domain/chat/memory` is built, but the embeddings/search **consumer arms** need a focused audit of what's stub vs done before promoting.

**→ STAYS BLOCKED (verified genuinely not built — do NOT promote):**

- **PD-45 / PD-64** — buddy `observer/` reaction engine not built (buddy's own build; needs the chat/workload event sources, which now exist — so it becomes buddy's call, not chat's).
- **PD-7** — agent-sdk reseed-from-canon needs a durable `sessionStore` canon feed (seam exists, unfed).
- **PD-17** — agent-as-first-class-principal — bigger identity-spine work (P5+), not a wiring flip.
- **PD-71 / PD-72** — search-corpus owner-id + memory-log sink — context-resolution / observability seams, still stubbed in `entry/compose/chat.ts`.

<!-- Source: Core-Audits-and-Debt.md -->

## Registry — ACTIVE flags recovered from the broken "Cleared" table

> ⚠ The `PD-XX` rows BELOW carry LIVE `ready`/`blocked:*` statuses but were misfiled under `## Cleared`
> above (a 6-column Registry block pasted beneath the 3-column Cleared header, so active burn-down work was
> hidden as "done"). They are **ACTIVE debt**. `ready` = burnable now (trigger landed); `blocked:<slice>` =
> waiting on that slice. Fold these into the main Registry in a later pass. (Recovered 2026-07-01.)

| id | item | current home | → target home | trigger | status |
| - | - | - | - | - | - |
| PD-64 | buddy observer / reaction engine | unwired in `domain/buddy` | wired to chat/workload buses | chat lands (P5) | blocked:buddy |
| PD-71 | search corpus owner ID | `entry/compose/chat.ts` | properly resolved from context | context resolution enhancement | blocked:context |
| PD-72 | memory log sink | thin structured log in `entry/compose/chat.ts` | `foundation/observability` | dedicated MemoryLog sink | blocked:observability |
| PD-75 | `UserSettings.workloads.themes.k` | `domain/workloads/runners/compute-themes.ts` | `contracts/user-settings` | user-settings tier slots in | blocked:user-settings |
| PD-77 | import loader subsystem | `entry/import/run-profile-import.ts` | extracted importer | `collectBundlesFromDir` / `importChats` / `importPersonas` lands (one bulk-loader family) | blocked:later |
| PD-78 | import stats rollup | `entry/import/run-profile-import.ts` | `domain/stats/` | `reconcileStats` / `enqueueBackfill` wired | blocked:later |
| PD-80 | OpenRouter account activity | `infra/providers/backends/openrouter/account.ts` | management key logic | management key in scope | blocked:later |
| PD-84 | orphan-blob edge rebuild | `domain/assets/verbs/store.ts` | DR rebuild subsystem | DR tools built | blocked:later |
| PD-89 | `WiBusEvent` entry-level variants (`wiEntryAttached`/`wiEntryDetached`/`wiEntryScopeChanged`) | `@orb/contracts/world-info` (declared, never emitted — only `wiBookAttached`/`wiBookDetached` fire, per `domain/world-info` §Movement table) | emit from `domain/world-info/verbs/entries/*` | a per-entry keyword/scope edit that must invalidate a chat's WI pool | blocked:later |
| PD-94 | assets `store` `maxBytes` bound — neo's `storeBlob` size cap for NON-HTTP callers (the zip-extract path sniffs magic bytes AFTER the read; without the bound a zip-bomb entry buffers unbounded). Dropped in the port + previously UNTRACKED (the assets audit mis-cited it as PD-67 — that id is the invite decline). | dropped from `domain/assets` `store` params | `domain/assets` `store` params + the bulk zip loader enforcing it | blocked:PD-77 (the zip loader must land WITH the size bound or the zip-bomb belt has a hole) | blocked:PD-77 |
| PD-93 | `imagery` base **BUILT** (`domain/imagery/verbs/generate-picture.ts`, D49#1, hosted `generateImage`); the richer **image-studio** (img2img / prompt-modes) cluster remains deferred | `domain/imagery` (base) + `proposed/imagery-design/` (extensions) | the img2img/image-studio cluster | only if img2img is requested | deferred:product-call (base done) |
| PD-95 | D56 `simpleSend` naming-collision remedy — the name Guided Generations used for "Commit Without Turn" (persist a user message, NO AI response) is held by a production verb that DOES generate (the arbitration-skipping solo path: `contract/service.ts:157`, `verbs/turn.ts:521`, auth matrix `substrate/auth/matrix.ts:70`). Per D56: move it off the production `ChatService` into test `_support.ts` (or rename, e.g. `soloSend`, if load-bearing in prod — D56 calls it a "lazy test-helper" but the built verb is member-permissioned and in the verb census (`domain/chat/contract/service.ts`), so verify test-only before moving). The real Commit Without Turn ships later as `commitMessage`/`injectMessage`, never `simpleSend`; the verb census in `domain/chat/contract/service.ts` needs the matching edit when this lands. **DECIDED (Nate 2026-07-03): DELETE outright** — verified zero prod consumers (no tRPC route/entry/client; tests only) and byte-identical to a solo `send` (the gate-7 D16 suite proves solo needs no special path); the two test call-sites retarget to the real `send`. | `domain/chat/{contract/service.ts,verbs/turn.ts,substrate/auth/matrix.ts}` | delete verb+params+matrix row; tests → `send`; the future `commitMessage` verb keeps the freed name | chat verb surface next touched (behind the AP3 chat work) | ready |
| PD-96 | `owner_stats.characters` never live-counted — the `StatsDelta.newCharacter` field exists (`@orb/contracts/stats`) and `applyStatsDelta` honors it (bumps `owner_stats.characters` by 1), but NO production builder ever SETS it: `chatCreatedDelta` (the first-chat site) omits it, so live `owner_stats.characters` stays 0 until a `reconcile-stats` runs. Strictly worse than the documented "a character with no chats is live-uncounted" caveat — ALL characters are live-uncounted. The drift-gate suite passes only because it hand-spreads `newCharacter: true` onto the builder output, masking the gap. **DECIDED (Nate 2026-07-03): wire the first-chat check** — `chatCreatedDelta`/`start-chat` does the cheap "first chat for this character?" existence read and sets `newCharacter`; the drift test drops its masking hand-spread. | `domain/chat/substrate/stats-delta.ts` (`chatCreatedDelta` omits `newCharacter`) | wired first-chat detection + test un-mask | chat-surface burn batch (behind the AP3 chat work) | ready |
| PD-100 | `messages.personaId` attribution never falls back to the participant's `activePersonaId`: `chat/verbs/turn.ts` stamps caller-supplied `personaId ?? null` (also simpleSend/impersonate) with no default from `chat_participants.activePersonaId`. Assembly reads the participant row; attribution doesn't — client omitting the param → user line gets null persona while an active persona is set. **DECIDED (Nate 2026-07-03): fall back to `activePersonaId`** — setup forces a persona so one always exists and should be active; omitted param → the participant's active persona, explicit param still wins. Belt-and-suspenders rider: verify (and if missing, add) the last-persona delete guard + an always-one-active invariant check. | `domain/chat/verbs/turn.ts:487` (+ persona delete guard verify) | attribution fallback + last-persona guard | chat-surface burn batch (behind the AP3 chat work) | ready |
| PD-101 | `@orb/server/kit/custom-parameters.ts` is a placeholder scaffold, but `@orb/contracts/preset` claims the Layer-2 prototype-pollution defense `deepMergeRequestBody` ("the ACTUAL defense") lives there. Runners use a shallow overlay (custom-byo `runners/chat.ts:228` FLAG\[PD-13]; openrouter `mergeCustomParameters`). Esoteric #8's two-layer invariant currently has only Layer 1 (schema superRefine). Arguably safe today (boundary validation + object-spread makes `__proto__` an own key) — a defense-in-depth / doc-truth gap. | `server/kit/custom-parameters.ts` (placeholder) | build `deepMergeRequestBody` + wire the 3 runner overlay sites | custom-byo hardening | ready |
| PD-102 | search read-only-context is faked-as-claimed: `SearchContext.db` is the full `Db`, but the code header asserts "the bundle carries no write path." Behaviorally read-only (no write is issued) but nothing prevents one — the compile-time read-only enforcement the invariant promised does not exist. | `domain/search` `SearchContext` (full `Db`) | a read-only db view/type for `SearchContext`, OR drop the false "no write path" claim | search surface next touched | ready |
| PD-104 | embeddings model-change is a dead end: changing a source's `(model, dim)` strands the old-vector-space rows (upsert keys include `model`, so new rows accrete beside stale ones), `clearTable` (the dump half) has ZERO runtime consumers (test-only, PD-103-style dead surface), and nothing triggers the force re-embed sweeps. | `domain/embeddings` (no model-change path) | wire connection embed-model change → `workloads.start('embed-corpus'/'embed-assets', force)` + `embeddings.clearTable` | embed-model setting surface | ready |
| PD-105 | notifications `invite` variant is never emitted: the union variant, schema slot, and tests all exist, but `chat/verbs/invites.ts` `createInvite` resolves a targeted `invitedUserId` (PD-66) then stops at persist — no `emitNotification({type:'invite'})`. The founding "invite DELIVERY surface" use case is ⅓ unwired; a targeted invitee gets no inbox row. | `chat/verbs/invites.ts` `createInvite` (targeted branch, after persist) | emit the invite notification (resolve token-vs-inviteId redeem path first — accept is token-authenticated) | invite delivery surface | ready |
| PD-107 | assets PD-28 roster-avatar exception is implemented BROADER than D21: `loadCoParticipantOwner` (`entry/compose/services.ts:295`) gates only on (hash→any owner) + (both users co-members of any shared chat) and serves ANY asset kind of a co-participant (gallery/attachment/generated/export) — a known-bytes existence oracle between co-participants. D21 (amended 2026-07-02) demands avatar + sprite-set of a roster character ONLY, via a reference-check. The widening was never adjudicated. **UPDATE (2026-07-03, #25):** the chat MESSAGE-IMAGE path was reworked OFF this lookup — `resolveImageRefToUrl` (`entry/compose/resolve-image-ref.ts`) now gates by a chat-scoped REFERENCE-CHECK (is the asset's owner a PRESENT participant of the referencing chat? — `chatId` threaded through `ResolveImageUrlOp`; owner+mime read by-id, no `getMetadata`/`loadCoParticipantOwner`), so it is NO LONGER a consumer of the broad lookup. PD-107 now scopes to its ONE remaining consumer: the blob-serve `getMetadata` co-participant fallback (PD-28 avatars) — which D21 says should likewise become a `character.avatarAssetId`/`character_sprites` reference-check; the message-image path is the model to mirror. | `entry/compose/services.ts:295` `loadCoParticipantOwner` (still broad — blob-serve/avatar path only) | constrain to roster characters' `avatarAssetId` (+ `character_sprites` when it lands), not a bare hash→owner lookup | assets/roster security pass | ready |
| PD-108 | import re-import of an EDITED (or second same-name) card dead-ends on `characters_owner_handle_unique`: the built dedup is file-byte `importHash` only; the doc's `(ownerId, handle)` + `cardContentHash` match and the D28 edit-in-place re-import are unbuilt AND unflagged (`cardContentHash` is only used for character contentHash stamping, never for import matching). Surfaces as a raw unique-constraint string in `failures[]`. | `domain/import/verbs/import-character.ts` (+ the injected character read) | add content-hash / `(ownerId,handle)` match → D28 edit-in-place re-import | import re-import surface | ready |
| PD-109 | export download surface is unbuilt: `createExportService` is composed (`entry/compose/services.ts:567`) and both verbs (`createExportCharacter`/`createExportChat`) + the serde core are built and tested, but the HTTP registrar `entry/http/export.ts` was never built — so both verbs have ZERO runtime consumers (PD-103/PD-99-style dead surface). | `domain/export` (verbs unreachable; no `entry/http/export.ts`) | build the download registrar per `proposed/export-deferred-surfaces.md` | export HTTP surface | ready |
| PD-110 | `runOnEdit` regex-on-edit is claimed-but-unwired: `chat/contract/service.ts:186` + `contract/params.ts:234` TSDoc assert "a `runOnEdit` regex re-applies" on `editMessage`, but `verbs/edit.ts` `createEditMessage` runs only `purifyEditedContent` (self-label strip) then writes verbatim — `executeRegexScripts` has 4 call sites (pipeline AI\_OUTPUT/REASONING, context WORLD\_INFO/USER\_INPUT), ZERO on the edit path; the `runOnEdit` schema field (`contracts/regex:41`) is declared but never read. A lying comment — the pain-ledger "runOnEdit unwired — intent, not dead" is now falsely asserted DONE. **DECIDED (Nate 2026-07-03): WIRE it** — `editMessage` re-runs the RECEIVE-tier scripts filtered to `runOnEdit===true` before persist (model on `executeRegexScripts`' 4 existing call sites). | `chat/{contract/service.ts,contract/params.ts,verbs/edit.ts}` | the runOnEdit re-apply before persist | chat-surface burn batch (behind the AP3 chat work) | ready |
| PD-112 | `CustomOpenAiCredential` has no `contextWindow` field — the council's D4 "BYO 2M-context model budgeted to 128k" footgun is unbuilt (zero `contextWindow` under `packages/contracts/src/credentials/`); it survived only as a Checklists row. | `contracts/credentials` (`CustomOpenAiCredential`) | add `contextWindow` to the BYO credential + budget from it | custom-BYO form / credentials surface | ready |
| PD-117 | the `bus-coverage` gate's founding census (2026-07-03): 5 `ChatBusEvent` members beyond the tracked PD-89 trio are declared-never-emitted — `chatOpened` (stream-attach synthesis unbuilt; FLAG in `verbs/start-chat.ts`), `historyTruncated` (retained-window synthesis unbuilt — AND `Tier-4-Transport.md` describes it as live, a PD-106-class doc-truth gap), `reasoningStreamDone` (D41 tail), `worldInfoActivated` (D50 pt-2 — `wiTrace` exists, the emit does not), `personaSwitched` (pairs with `setActivePersona` — wire-exposed since PD-99 cleared; the emit is still unwired). Each sits in the gate's self-cleaning `DEFERRED` map (`scripts/check/gates/bus-coverage.ts`) — wiring an emit turns its entry stale-RED. | `domain/chat` emit sites (unwired) | wire each emit (deleting its `DEFERRED` entry), or strike the member from the union + reducer | per-member: stream/persona/WI surfaces next touched | ready |

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
- `Spine-Config-and-Serialization.md`: "stranded env-only, 3 of 7 fields" — now 11 fields.
- `Tier-1-DB.md:259`: teaches the superseded `''`-sentinel (embeddings invariant 5) — now real CharacterId.
- `Spine-Identity-and-Auth.md`: present-tense pre-build ("resolved twice per request", old viaFallback/viaCookie names, "role gates NOTHING") — all built; flip to built-state + absorb the two de-numbered sessions invariants (token-hash-not-stored, per-request revoked/expired/enabled recheck).
- `Tier-4-Transport.md ~246`: "404 in single-user on every invite/notifications/join" — unenforced (see PD-106).
- `preset` contracts (\~L175): names a non-existent `GUIDED_ACTION_IMPLS` identifier.
- stale PD-5 OIDC comments in `entry/http/auth-routes.ts` (claim OIDC unbuilt; it's built + tested).

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

- FLAG\[PD-100..107] at-seam comments (registry rows exist; add the in-code `FLAG` when each seam is next touched; 97/98/99 cleared 2026-07-03).
- `Core-Shared-Dissolution.md` — migration doc: kit-purity law stays core, the symbol map → history/.
- ~~**AGENTS-1/2/3 trim + merge**~~ — DONE 2026-07-03: trimmed to doctrine+index, then MERGED into ONE `core/AGENTS.md` (§1-8, domains.md folded in). Pain Ledger → `history/Pain-Ledger.md`; AST-scan → `history/Grounded-Intelligence-AST-Scan.md`; string-union dispatch → `Spine-TypeScript-and-Patterns.md`. Documentation-Law moved into `core/`.
- Corpus-wide `pnpm format:docs` sweep → flip `check:docs` to blocking → add frontmatter to surviving docs.
- ~~`tsdoc/syntax` cleanup → flip warn→error~~ — DONE 2026-07-03: 255 violations across 45 files cleaned, `tsdoc/syntax` is now `error` on server/kit/db/contracts.

<!-- Source: Core-Audits-and-Debt.md -->
