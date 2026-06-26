# Orbweaver — `chat`: the integration apex (target spec)

> **Status: planning (the single home for chat).** Chat is the 16k-line integration point — the
> turn lifecycle, canon, assembly, the memory subsystem, speaker arbitration. **Part I** (below) is the
> **template-shaped target + movement table** (what moves where, for scaffolding); **Part II** is the
> **authoritative resolution-order design** (the five contexts, the RESOLVE→GATHER→BUILD→SHAPE stage
> list, the 8 load-bearing rules, the corrected §8 cache breakpoint) — merged in 2026-06-25 from the
> former top-level `chat.md` (one home per topic).
> Grounded in a 6-way whole-file sub-reader pass over the steady clone (`engine` 4.5k · `verbs` 3.8k ·
> `assembly` 2.4k · `memory` 1.6k · `persistence` 1.6k · `contract`+top 1k). Upstream:
> `spine/identity-auth-permission.md` (§7.1), `spine/serialization-core.md` (§7.3), `spine/types-and-schemas.md` (§7.4),
> `spine/string-union-dispatch.md` (§7.5), `knowledge-cluster.md` (memory), `tiers/providers.md` (the agent-sdk
> backend), `domains/connection.md` (routing), `reports/shared-dissolution.md` (kit/contracts homes).
> **Build path: greenfield, gated by a cross-repo differential oracle against running neo-tavern**
> (diff SEND/ASSEMBLE/RECEIVE outputs + cache-token counts) — chat + memory are the highest-risk port.

---

## What this domain owns

- **The turn lifecycle** — one per-turn driver (`engine`) for 8 turn kinds (send/swipe/continue/generate/
  opening/auto/force/simple-send): `lock → preflight → plan → [per-speaker | narrator | single]
  executeTurn → persist → background`.
- **Canon** — the `messages`/variants, `chats` row, `chat_participants` roster, `chat_events`, the
  resumable SSE stream log. Append-only; the substrate everything derives from.
- **The five contexts** (DISPLAY/SEND/ASSEMBLE/RECEIVE/COMPOSER) and the **assembly** of the per-turn
  prompt (RESOLVE→GATHER→BUILD), orchestrating the pure `kit` engines in the canonical order.
- **The `memory` subsystem** — digest *generation* (the ST-summarizer replacement) + the `{{memory}}`
  recall *policy*; it **delegates** the vector embed (→ `embeddings`) and scan (→ `search`) but keeps the
  6 chat-scoped query semantics (below).
- **Speaker arbitration** (7a sync select + 7b async arbitrate + the side-LLM smart-arbitrate),
  **auto-mode** AI→AI chaining, **guided steering** (one typed steer), the **stats-delta builders**
  (build the delta; the apply is injected), the **chat bus** (events + replay ring), **active-turns**.

This domain does **NOT** own (all injected or relocated — see Movement table + Injection model):
the **agent-sdk session/seed/reseed/frames** (→ `infra/providers/agent-sdk/session`, backend-internal);
**routing** api/source/model resolution (→ `connection.resolveChat`); **`resolveCurrentVersion`**
(→ `character`); **`setActivePersona`** (→ `persona`); the **vector embed/scan** (memory delegates to
`embeddings`/`search`); **stats apply-delta** (→ `stats`); **credential resolve/revoke**
(→ `credentials`); the **macro/regex/speaker/guided engines** (→ `kit`); `resolveCharacterDepthPrompt`
(→ `server/kit/serde`); the **AssembleContext family** + `RoomOverrides`/`GroupConfig`/`OpeningPolicy` +
`ChatDeltaEvent` (→ `@orb/contracts/chat`); `providerRouting` (→ `@orb/contracts/connection`).

---

## The defining changes (the headlines)

1. **The order is the artifact** — RESOLVE→GATHER→BUILD→SHAPE become named, ordered stages (today split
   invisibly across `assembly/context.ts` + `assembly/assemble.ts` + `engine/pipeline.ts` with no
   function naming the order). Part II (below) is the spec; this Part I lands the file structure for it.
2. **The domain calls a role, never a backend.** The four per-runner dispatch arms (`dispatchAgentSdk`/
   `dispatchOpenrouter`/`dispatchVllm`/`dispatchCustomOpenai`, `pipeline.ts:1061-1419`) collapse to **one
   `runChatTurn(req)`** call. `runner`/`family` are sealed in `infra/providers`.
3. **The agent-sdk session is extracted to providers.** `DbSessionStore`, `buildSeedFrames`, reseed, the
   frame serialization, the compaction-frame round-trip — all move to `infra/providers/agent-sdk/session`
   (the backend's canon-derived cache). The chat domain becomes **stateless** (no `sessionDirty`/
   `sessionId`/seed/reseed concept). **This is the single biggest extraction.**
4. **§8 cache breakpoint preserved + upgraded** — `computeHistoryBreakpoint` stays in SHAPE (it needs
   in_chat-depth + squash + nudge state the runner lacks), upgraded to ST's **rolling PAIR** (`depth` &
   `depth+2`); the runner only *places* the `cache_control` tags. Carry `pipeline-breakpoint.test.ts` +
   a cache-token differential. (Dropping it = silent ~5300-token/turn regression.)
5. **Immutable turn ctx.** RESOLVE+GATHER produce an immutable ctx; per-speaker is `shape(ctx, speaker)`,
   not the ~17 in-place `assembleCtx` mutation sites today. (Must preserve "speaker k+1 sees speaker k's
   committed row" — `engine.ts:680-689`.)
6. **One injection list + one budget pass** — WI + persona-desc + author's-note + after-history + guided
   all flow through one `Injection[]`, budgeted once (today: a WI budget walk + a separate
   `fitHistoryToWindow` + **unbudgeted** `chat_injections`).
7. **De-pin** — chats never pin a character version; `chats.characterVersionId` is dropped; member
   identity resolves via injected `character.resolveCurrentVersion`. (`loadCanonHistory` is already
   de-pin-ready — it keys on `messages.characterId` + `currentVersionId`.)
8. **Participant-membership authority** — `requireParticipant`/`requireHost(Principal)` replace the
   `loadOwnedChat` owner-equality predicate (~45 sites across 31 files); `authorUserId` is stamped with
   the real principal on the live persist path (a NEW build — today only the backfill stamps it).
9. **Name-stamp dissolution** — per-participant egocentric isolation (the view-builder) replaces the
   5-mechanism quartet-plus (`applyNamesBehavior` + SDK `prefixNames` + `authorName`-smuggle +
   `cleanPerSpeakerReply` foreign-truncate + the per-speaker `\nName:` stop fence). The trusted `Name:`
   label is applied where no USER_INPUT/AI_OUTPUT regex can reach.
10. **Memory delegates the mechanism, keeps the policy** — embed → `embeddings.store` (kills the 2
    copy-pasted `hub_score=null` reset sites — the bug), scan → `search.digests`/`search.corpus`; memory
    keeps digest generation + the `{{memory}}` recall policy + the **6 chat-scoped semantics**.

---

## The 8-slot layout

```
domain/chat/
├── index.ts            FRONT DOOR — ChatService, createChatService, ChatServiceDeps, the bus surface, errors
├── service.ts          COMPOSITION ROOT — builds ctx + one turnEngine, wires ~28 verb factories. Zero logic.
├── context.ts          DI BUNDLE — explicit `export interface ChatContext` (NOT ReturnType<>); lists every
│                        injected cross-feature op (the Injection model below)
├── contract/
│   ├── service.ts      ChatService interface — the 54-verb public surface (read this to know everything)
│   ├── params.ts       every verb's *Params (the inline param-literals on the interface move here)
│   ├── results.ts      every verb's *Result (+ VariantProvenance, the engine TurnRequest/TurnOutcome/… types)
│   ├── views.ts        client read-models (ChatSummary, MessageView, AssemblyPreview, WorldInfoPoolChat…)
│   ├── errors.ts       ChatNotFoundError, ChatOperationError
│   └── metadata.ts     chatMetadataSchema + parseChatMetadata + getGroupConfig/getRoomOverrides
│                       (the `chats.metadata` blob; the providerRouting sub-parse LEAVES → contracts/connection)
├── verbs/              ONE logical verb per file (grouped where the template allows):
│   ├── start-chat.ts        lazy chat+roster creation, greeting/verbatim seeding, first-turn delegate (de-pin rework)
│   ├── send.ts              send + simple-send
│   ├── regen.ts             swipe · continue(+undo/revert) · generate · impersonate · force-character · opening
│   ├── edit.ts              editMessage · setMessageHidden · editReasoning · clearReasoning · delete · duplicate · move · reattribute
│   ├── fork.ts              forkChat (de-pin: copies identity, not a cv pin)
│   ├── roster.ts            addCharacterToChat · participant-control · group-config · room-overrides · config-read (host-gated)
│   ├── chat-lifecycle.ts    title/star/archive/variables · delete · reapTemporary · abort · injections
│   ├── read.ts              listChats/getChat/listMessages/previewAssembly/peekPrompt/replayStream/… (read surface)
│   └── compaction.ts        runCompaction (injected into engine) + compact (manual lever)
├── persistence/        QUERIES ONLY (no logic, no I/O):
│   ├── queries.ts          loadOwnedChat (the one JSON-parse boundary), canon reads, loadCanonHistory,
│   │                       event/stream-log reads. (the SDK-frame readers LEAVE → providers)
│   ├── roster.ts           loadRoster + buildInitialRosterRows (un-exiled from _shared)
│   ├── participant.ts      parseParticipant (the kind XOR exhaustiveness) + assertForcedCharacterMember
│   └── lock.ts             per-chat turn lock (DB-backed; candidate → infra — open)
├── engine/             NAMED SUBSYSTEM — the per-turn loop + SHAPE:
│   ├── engine.ts           the lifecycle shell (the persist batch-writers split toward persistence/)
│   ├── pipeline.ts         SHAPE substrate (splice→squash→name-stamp→fit) + the §8 rolling-pair breakpoint;
│   │                       the per-backend dispatch arms COLLAPSE to one runChatTurn(req)
│   ├── select-speakers.ts  7a sync arbitration · smart-arbitrate.ts 7b side-LLM
│   ├── auto-mode.ts        AI→AI chaining (in-memory Map; ASSUMES single-replica)
│   ├── stats-delta.ts      the delta BUILDERS (import @orb/kit/stats-tally + @orb/contracts/stats)
│   └── result.ts / turn-identity.ts   pure result builders · resolveRunAsUserId
├── assembly/           NAMED SUBSYSTEM — RESOLVE→GATHER→BUILD (the order, made legible):
│   ├── context.ts          RESOLVE (cast/personas/names) + GATHER (WI pool, memory recall, vars) + BUILD(WI→injection)
│   ├── assemble.ts         BUILD section walk (chat_history pivot, static/dynamic, {{original}} markers)
│   ├── macros.ts           wiring over @orb/kit/macro (engine is kit)
│   ├── injections.ts       the ONE injection model (shared frame() + splice)
│   ├── world-info/pool.ts  the 4-scope WI union — STAYS chat, reads @orb/db schema directly (db-layer consumer)
│   └── (SHAPE shapers)     history-budget.ts · names.ts · role-squash.ts · speaker-stamp.ts · trace.ts
├── memory/             NAMED SUBSYSTEM — substrate-mediated (only chat/context reaches in):
│   ├── build/              digests.ts · segments.ts (+ substrate: prompts/transcript/parse)  → calls embeddings.store
│   ├── recall/             recall.ts · bridge.ts · query.ts · format.ts  → calls injected search
│   ├── persistence/        memory's OWN db reads (meta/digests/speakers) — NOT vector writes
│   ├── types.ts            MemoryConfig/Resolved/MsgRow/DigestRow…
│   └── constants.ts        DEFAULTS + resolveCfg  (adopt the new tuning: blockSize 16 · verbatimWindow 30 · fanOut 8)
├── bus.ts              chat bus emitter + replay ring (event TYPES → @orb/contracts/chat)
├── active-turns.ts     in-memory controller Set per chat (lock-free generate vs locked send)
└── connected-persona.ts  one-connection-only auto-activate (reads character_personas — formalize the reach)
```

**Memory is a `chat/` subsystem, not its own domain** (per `structure.md §4` + the build path) —
`knowledge-cluster.md §3/§8` says "its own domain"; that wording is the stale one and is amended in the
reconciliation pass. Memory is reached ONLY through `chat/context.ts` (the
`domain-substrate-only-subsystem-access` seam).

---

## Public surface — the `ChatService` (54 verbs)

`contract/service.ts` is the read-this-to-know-everything interface. Groups: **reads/lifecycle**
(startChat, listChats, listForks, getChatLineage, getChat, previewAssembly, getActivePresetConfig,
previewSection, peekPrompt, listMessages, listParticipants, replayStreamEvents, streamEventBounds);
**turn-running** (send, swipe, impersonate, generate, simpleSend, continueTurn, undoContinue,
revertContinue, forceCharacterTurn, compact, abort); **canon edits** (selectVariant, editMessage,
setMessageHidden, deleteMessages, editReasoning, clearReasoning, moveMessage, duplicateMessage,
forkChat); **injections** (setChatInjection, listChatInjections, deleteChatInjection); **variables**
(getVariables, getStoredVariables, setVariables, clearVariables); **chat-row** (delete,
reapTemporaryChats, updateTitle, star, archive, ~~setChatPersona~~→persona, reattributeMessages);
**group/roster** (setGroupConfig, addCharacterToChat, setRoomOverrides, getGroupConfigForChat,
getRoomOverridesForChat, setParticipantDisabled, setParticipantTalkativeness). `generateOpening` is
internal (injected into `startChat`, not on the interface).

The `@public` memory/persistence helpers wired by workload runners + bootstrap (`loadChatMeta`,
`generateDigests`, `generateSegments`, `renderTranscript`, `ensureGroupCharacter`,
`reclaimChatLocksOnBoot`) are exposed via the front door for the composition root, not the tRPC surface.

---

## Movement table (the headlines; the 6 sub-reader returns hold the per-file detail)

| Unit (steady) | Outcome | Target | Rationale | Enforcement tier |
|---|---|---|---|---|
| `engine/pipeline.ts` `dispatchAgentSdk` + `shapeCanonForDelivery`/`appendSdkSeed`/`resolveSdkChat` + the mode-flip reseed (`:490-523`) | **→ infra/providers** | `infra/providers/agent-sdk/session` + the sealed backend | the backend's canon-derived cache leaks UP today; domain becomes stateless | compile: `ChatRequest` for agent-sdk carries no `sessionStore`/`resume`; domain has no session type |
| `persistence/{store.ts,frames.ts,session.ts}` (whole) + `queries.ts:{extractCompactSummary,frameContentToText,COMPACTION_MARKER_PHRASE}` | **→ infra/providers** | `infra/providers/agent-sdk/session/{store,seed,reseed}.ts` | `DbSessionStore`/`buildSeedFrames`/reseed/compaction-frame are SDK substrate; provider orchestrators call BACK into chat `loadCanonHistory` (provider→chat-query is downward-legal) | resolve + boundary-lint |
| `engine/pipeline.ts` `dispatchOpenrouter`/`dispatchVllm`/`dispatchCustomOpenai` + the runner `if/else` (`executeTurn:932-982`) | **collapse → one `runChatTurn(req)`** | `chat/engine` builds `req`, calls the `chat` role | "the domain calls a role, never a backend" | lint: dep-cruiser — no `domain/**` import of `infra/providers/backends/**` |
| `engine/pipeline.ts` `computeHistoryBreakpoint` + `shapeCompletionHistory` | **STAYS chat (SHAPE)**, upgraded to rolling PAIR | `chat/engine` | assembly-coupled (in_chat depth + squash + nudge); runner only places the tags | test: `pipeline-breakpoint.test.ts` + cache-token differential |
| `routing.ts` (whole: `resolveTurnRouting`/`TurnRouting`/`RoutableChat`/`RouteOverlay`/`pickOrModel`/`healToChatDefault`) | **→ connection** | `connection.resolveChat` → `ResolvedConnection{backend,model,credential,capability}` | routing keyed on `runner` is the infra-vocab leak | resolve: `domain-no-cross-feature`; compile: `runner`/`family` grep RED in `domain/chat/**` |
| `persistence/resolve-current-version.ts` (whole) | **→ character** | `character.resolveCurrentVersion` (injected) | character resolves its own live version; today a chat workaround | resolve: cross-domain via injection |
| `verbs/set-persona.ts` (`setChatPersona`, writes `chats.personaId`) | **→ persona** | `persona.setActivePersona` (per-participant `chat_participants.activePersonaId`) | `chats.personaId` is dropped; chat calls via injection; no reseed | host-or-self authority |
| `persistence/group-character.ts` `ensureGroupCharacter` + `_shared/group-character-rows` | **→ character + a chat verb** | `character.mintSyntheticGroupCharacter` (injected); chat verb orchestrates | identity creation is character's; it's logic+writes (not a query) | resolve + structure §4 |
| `memory/db.ts` `embedAndUpsert` (embed+upsert half) + `generate.ts` segment embed | **→ embeddings.store** | `embeddings.store(kind='chat-block', lens='digest'|'segment', fkRefs)` | the one write path; kills the conflation | resolve (injection) |
| `memory/db.ts:391`/`db.ts:432`/`generate.ts:387` `hub_score=null` resets | **deleted** | — | the neo-tavern bug; `store` never touches `hub_score` | compile: `StoreParams` has no `hubScore` |
| `memory/retrieve.ts` in-RAM `cosineSim` scan + `deps.rerank` | **→ search.digests/corpus** | the one engine (chat-scope param + the 6 semantics) | two cosine paths over one table collapse | compile: memory holds no cosine |
| memory schema (`chat_digests`/`chat_segments`/`chat_digest_speakers`) | **→ db/schema/embeddings** | `@orb/db/schema/embeddings.ts` (producer-owned) | fixes the naming lie | compile: old path gone |
| `engine/stats-delta.ts` builders | **stay chat**; `applyStatsDelta` injected | `chat/engine` (import kit/stats-tally + contracts/stats) | builders are chat's; the apply op is `stats` | resolve (injection) |
| `engine.ts` `maybeRevokeOnAuthFailed` (from `_shared`) | **→ credentials** (injected) | `credentials.maybeRevokeOnAuthFailed` | un-invert the drawer | resolve |
| the macro/regex/speaker/guided engines (consumed across assembly+engine) | **→ kit** | `@orb/kit/{macro,regex,speaker-label,guided}` (+ `@orb/server/kit/regex` vm-guard) | pure engines, two call sites (assemble + render) | resolve + kit-purity |
| `resolveCharacterDepthPrompt` (assembly consumer) | **→ server/kit/serde** | `@orb/server/kit/serde` | 2 server consumers (chat + export) — see §7.3 correction | resolve |
| AssembleContext family + `ChatDeltaEvent` + `RoomOverrides`/`GroupConfig`/`GroupConfigInput`/`OpeningPolicy` | **→ contracts/chat** | `@orb/contracts/chat` | cross-boundary; db schema + client both consume | resolve + `no-inline-types` |
| `OpenRouterProviderRouting`/`parseProviderRouting` (metadata sub-parse) | **→ contracts/connection** | `@orb/contracts/connection` | provider-routing is connection vocab | resolve |
| `context.ts` `ChatContext = ReturnType<typeof createChatContext>` | **→ explicit interface** | `export interface ChatContext` in `context.ts` | the no-inline-types / invisible-type anti-pattern | lint: `no-inline-types` |
| engine inline types (`TurnRequest`/`TurnOutcome`/`TurnEngine`/`TurnPrep`/`TurnIntent`/`VariantProvenance`) | → chat `contract/` | `chat/contract/{params,results}.ts` | exported feature types belong in contract/ | lint: `types-in-contract` |
| `batch`/`db-errors` inline casts on the persist path | **→ @orb/db/kit** | `@orb/db/kit` (`batchMany`/`isConstraintViolation`) | wire the ~59 inline `BatchItem` casts to the helper | kit-purity |
| `escapeRegExp` (select-speakers dup) | **→ @orb/kit/strings** | one copy | triplicated | lint: `no-inline-union-redecl`-adjacent |
| `chats.characterVersionId` reads (`backfill-roster.ts`, read.getChat, assembly primary) | **de-pin rewrite** | live-identity resolution | the cv-pin is dropped | compile: column gone |

---

## Cross-feature composition (the injection model)

`chat/context.ts` (the explicit `ChatContext`) bundles every cross-feature op the verbs/subsystems reach
through — wired at the composition root, never sideways-imported:

| Injected op | Provided by | Used for |
|---|---|---|
| `connection.resolveChat` | connection | per-turn `{backend,model,credential,capability}` from the chat row + UserSettings |
| the `chat` role (`runChatTurn`) | infra/providers | the ONE turn dispatch (replaces the 4 arms) |
| `credentials.resolve` / `credentials.maybeRevokeOnAuthFailed` | credentials | turn-time credential + post-turn auth_failed side-effect |
| `character.resolveCurrentVersion` / `mintSyntheticGroupCharacter` / `findSyntheticGroupCharacter` | character | live identity per roster member; the group-memory bucket |
| `persona.setActivePersona` | persona | per-participant active persona (host-or-self) |
| `embeddings.store` | embeddings | memory's digest/segment vector write (into the memory subsystem) |
| `search.digests` / `search.corpus` | search | memory's chat-scoped recall (the 6 semantics as params) |
| `stats.applyDelta` | stats | persist the turn-economics delta the builders produced |
| `RoleClients.summarize` | connection/providers | the memory summarizer + smart-arbitrate side-LLM |

Memory is injected the `embeddings.store` + `search.digests`/`corpus` ops at the same seam
(`chat/context.ts`) — the substrate-mediated access that keeps memory a sealed subsystem.

---

## Spine thread intersections

### §7.1 identity / auth / permission
Chat is the **blast site** for the permission rework. `requireParticipant`/`requireHost(Principal)`
replace the `loadOwnedChat` owner-equality predicate (~45 sites / 31 files); host-only verbs
(roster-mutation, participant-control, group-config, room-overrides, force-character, delete-chat) use
`requireHost`; `setActivePersona` is host-or-self. **`authorUserId` stamping on the live persist path is
a NEW build** (today only `backfill-roster.ts:67` stamps it, hardcoded to owner). The agent-as-principal
work (§8.6) lands here too — the `chat_participants.kind` XOR (`participant.ts:73`
`const _exhaustive: never`) splits, the `buddy_turns` firewall inverts, `authorUserId` carries the real
principal — but the mechanics are owned by the identity spine; chat implements its predicates + stamping.

### §7.3 serialization / serde core
Chat is a **consumer**, not an owner, of the serde core: it imports `resolveCharacterDepthPrompt` from
`@orb/server/kit/serde`. The card/WI mappers + canonical card are import/export's. (The canonical card
is already fully typed — see character.md §7.3.)

### §7.4 types & schemas
`ChatContext` becomes an explicit interface (not `ReturnType<>`); the engine's exported types
(`TurnRequest`/`TurnOutcome`/`VariantProvenance`/…) move to `chat/contract/`; the **AssembleContext
family** → `@orb/contracts/chat` (the boot prerequisite — you cannot compile chat until `AssembleContext`
has a home there; db schema's `promptSnapshot` also consumes it).

### §7.5 string-union dispatch
`messageRole` (the `user|assistant|system` axis re-spelled across simple-send/injections/seed) → one
importable union in `@orb/contracts/chat`. `guidedAction` (6 actions) → a mapped-Record dispatch (the
`GUIDED_ACTIONS` tuple + Record substrate already exists; the verbs converge on it). The backend dispatch
becomes an `assertNever` over the sealed backend union (in providers, not chat).

### knowledge-cluster (memory)
Memory delegates embed→`embeddings`, scan→`search`, keeps the **6 chat-scoped semantics** (below); build
never blocks the reply (post-turn fire-and-forget + import backfill, same functions); scoped recall is
**egocentric-only**.

#### The 6 memory semantics (preserved as search params or memory pre-call assembly — the rewrite risk)
1. **5 recall modes** (off/mixA/mixB/mixC/tiered) — memory owns the mode switch; mixA/tiered are pure
   assembly (no search call), mixB/mixC call `search.digests({rerank: mode==='mixC'})`.
2. **tiered bridge** (uncovered-digests-only) — memory computes coverage + passes the bridge block-keys
   as a **candidate-restriction param**; *search must accept this* (owner-wide scan doesn't model it).
3. **verbatimWindow / protected tail** (`cutoff = maxSeq − verbatimWindow`) — BUILD-side cutoff stays in
   memory; recall never surfaces the tip because digests only exist for aged-out blocks.
4. **egocentric scoped-query** — bucket → a `scopedCharacterId` **scope param** (with the `''` shared
   sentinel); the name-prefixed query **text** is memory's pre-call assembly.
5. **in-chat single-chat focus** — `scope=this chat` param; *search must expose chat-scope as
   first-class* (today `search.digests` is owner-scoped — the risk to manage).
6. **keywordMatch / recencyBias / minScore** — params on `search.digests`; the mechanism moves to search,
   memory passes the knob values.

---

## Esoteric / load-bearing (must survive — cite the sub-reader returns for file:line)

- **§8 breakpoint handoff** — `cacheBreakpointFromEnd` survives `fitCompletionHistory` front-drop + the
  runner empty-filter; upgrade neo's single pin to ST's pair; gate with the breakpoint test + cache diff.
- **squash-same-role** — Anthropic/Gemini hard-error on adjacent same-role; squash defends a mid-life
  backend flip; boundary squash is also breakpoint abort #2.
- **in_chat depth semantics** — depth-0 = after the user turn (rides the agent-sdk `prompt:` param via
  `promptTailInjections`); depth≥2 = breakpoint abort #1; clamp-once / sorted-desc / assistant@0→depth-1.
- **SDK-frame serialization (moves to providers but must survive)** — user-first seed + the
  `GREETING_USER_STUB` "invisible user" trick; deterministic ids/timestamps so reseed is byte-identical
  (measured 1850 vs 0 cache-write); the dual-session reap (`keepPrimary`); re-run the seed-probe on SDK
  upgrade.
- **dual-persona per-source macro routing** — card sections resolve `{{user}}` against the **anchor**;
  user-authored against the speaker's **active** persona. `pool.ts` source-tagging (persona-book
  `source:'chat'` vs character `source:'character'`) is the mechanism; survives the `chats.personaId`
  drop only if the join rewires through `chat_participants`.
- **macros before regex (#1 silent breaker) + render once** — the `\{{x}}` escape-survives-one-pass
  interaction; one shared `frame()` so system-block render + in_chat splice can't drift; the WI
  double-render is killed (resolve `wiFormat` macros in the same pass).
- **trusted speaker label after all regex** — `sanitizeSpeakerLookalike` (zero-width-space wedge) on raw
  body; the `Name:` prefix applied post-squash so no USER_INPUT/AI_OUTPUT regex can forge a speaker.
- **keyword-match two-phase** — RESOLVE produces names first so GATHER matches over `recent + names +
  pending user text` in resolved form (kills the one-turn lag).
- **self-heal hash-diff** — stable-speaker-id IN the digest hash (rename-robust, re-attribution-aware,
  guarded on distinctness so solo hashes stay byte-identical); `scopedCharacterId=''` sentinel (SQLite
  UNIQUE NULL≠NULL); the speaker re-query after upsert (filtered by the bucket — drop it and scoped
  speakers bleed into shared); the in-flight Sets (ASSUMES single-replica — guard the summarizer spend).
- **session-as-canon-cache** — reseed-when-stale (`sessionDirty` set atomically with a canon edit); the
  compaction marker round-trip (`COMPACTION_MARKER_PHRASE`) — all move to providers together.
- **auto-chain/abort interplay** — schedule-time generation captured; TOCTOU re-check inside the lock;
  the `cancelledDuringTurn` re-arm guard (abort is lockless); abort is owner-only (rollback-theft
  defense).
- **the chat bus** — the 21-member `ChatBusEvent` exhaustiveness guard; await-before-deliver durability;
  the per-chat replay ring (late-subscriber ramp-up); embeds `WiBusEvent` so WI emits without importing
  back into chat.
- **active-turns Set-not-slot** — a lock-free `generate` runs concurrent with a locked `send`; abort
  signals all in-flight; in-memory (ASSUMES single-replica).
- **metadata strict/lazy-parse fault isolation** — top-level `.loose()` preserves unknown future fields;
  sub-blobs (`group`/`roomOverrides`/`providerRouting`) lazy-parse so a malformed one falls back to
  default without nuking siblings.
- **the guaranteed-user-tail invariant** — `GREETING_USER_STUB` prepended when the lead is assistant
  ("an assistant-first seed doesn't resume").
- **setSpeaker mutate-then-reassemble correctness** — speaker k+1's turn must see speaker k's just-
  committed row; the immutable-ctx rewrite must preserve this (today via in-memory `sessionId` mutation +
  canon re-load).

---

## Invariants (gate candidates)

1. **One canonical order** — RESOLVE→GATHER→BUILD→SHAPE as named ordered stages; no order logic split
   across files. *(lint/review: a reviewer reads the order in one place.)*
2. **The domain calls a role, never a backend** — no per-backend dispatch arms in chat. *(lint:
   dep-cruiser — `domain/chat/**` imports the role contract, never `infra/providers/backends/**`.)*
3. **No agent-sdk session/seed/env in the chat domain** — it's backend-internal to providers. *(compile:
   the chat domain has no `SessionStore`/`SessionStoreEntry`/seed type; resolve: no import of the SDK.)*
4. **Immutable turn ctx** — per-speaker is `shape(ctx, speaker)`; no shared-ctx mutation across the
   per-speaker loop. *(gate candidate; Part II §10 inv 5.)*
5. **One injection list + one budget pass** — no second WI budget, no unbudgeted injection. *(test.)*
6. **The §8 rolling-pair breakpoint is preserved** — computed in SHAPE, placed by the runner; never
   dropped. *(test: `pipeline-breakpoint.test.ts` + a cache-token differential vs running neo-tavern.)*
7. **Macros before regex; macros before framing; render once; macros never on model output.** *(stage
   order + test.)*
8. **Trusted speaker label applied after all USER_INPUT/AI_OUTPUT regex** — un-forgeable. *(test.)*
9. **Engines are `kit`** — chat imports `kit/macro` + `kit/regex` + `kit/speaker-label`, never
   reimplements them. *(resolve + kit-purity.)*
10. **Chats never pin a character version** — `chats.characterVersionId` is gone; live identity via
    `resolveCurrentVersion`. *(compile: column absent.)*
11. **Participant-membership authority** — `requireParticipant`/`requireHost` replace owner-equality; no
    `loadOwnedChat` owner-equality predicate survives. *(lint: a `can()`/predicate seam; grep for
    `ownerId === ` in chat verbs goes RED.)*
12. **Memory delegates** embed→`embeddings.store` + scan→`search`, keeps the 6 semantics; `hub_score` is
    never nulled by a write. *(compile: `StoreParams` has no `hubScore`; memory holds no cosine.)*
13. **`persistence/` is queries only** — the group-character mint + the reseed batch-writers leave
    (to a verb / to providers). *(lint: `persistence-no-io` / `persistence-no-logic`.)*
14. **`context.ts` is an explicit interface**, not `ReturnType<>`. *(lint: `no-inline-types`.)*

---

## Decisions (resolved / deferred)

- **memory-as-subsystem vs domain — RESOLVED: a chat subsystem** (per `structure.md §4` + the build
  path). **FLAGGED cross-doc:** `knowledge-cluster.md §3/§8` says "its own domain" — stale wording, amend
  in the reconciliation pass (not in this slice).
- **the `search` param contract for the 6 semantics — chat's REQUIREMENT is RESOLVED (non-negotiable);
  the param *shape* is DEFERRED to the search contract.** Chat requires that **chat-scope (#5)** and the
  **bridge-candidate restriction (#2)** be **first-class params on `search.digests`** — `search.digests`
  is owner-scoped today, so this is a hard build prerequisite, not a nicety. The remaining choice (flat
  `DigestsParams` fields vs a nested `MemoryQueryOptions` sub-shape) is the search domain's to make;
  criterion: the nested shape keeps memory-specific knobs out of the general search contract, the flat
  shape avoids a memory type leaking into search — pick when `search.digests` is typed. **FLAGGED
  cross-doc:** `search.md` carries the same item as its open decision + notes chat-scope as "the risk to
  manage" — coordinate (knowledge-cluster QA owns any `search.md` edit).
- **the chat turn lock home — RESOLVED: `chat/persistence/lock.ts`.** It is a DB-backed concurrency
  primitive (the `chat_locks` table, PK on `chat_id`, `LOCK_TTL_MS`, multi-replica-aware) consumed only
  by chat verbs/engine — not a generic infra primitive (no other consumer). It is a **named exception to
  the "persistence is queries only" rule** (inv #13): a DB-backed per-chat concurrency primitive
  co-located with the table it guards, explicitly carved out (it does insert/delete, not just read).
- **compaction — RESOLVED: `verbs/compaction.ts` is the home.** The lock-free `runCompaction` core is
  injected INTO the engine via `ctx` (mirroring how the steady clone injects `runTurn` into
  `compaction.ts`); the manual `compact` lever is the public verb. The engine never imports the verb;
  the verb is wired with the engine's `runTurn` at the composition root.
- **the agent-principal mechanics (§8.6) — RESOLVED: delegated to the identity spine.** The `kind` split,
  `authorUserId` threading, and the `buddy_turns` firewall inversion are **owned by the identity spine
  (`spine/identity-auth-permission.md`)**; chat only implements its predicates (`requireParticipant`/
  `requireHost`) + the live `authorUserId` stamping. Not a chat decision.
- **guided placement default — RESOLVED: system-marker** (the `{{guided_instruction}}` marker), matching
  `Part II §6/§11` and the steady clone's `role:"system"` default for all 6 actions; per-action
  `placement` can select a depth-0 injection where a steer must read as an in-character turn.
- **memory DEFAULTS adoption — RESOLVED: adopt the new tuning at build** (`blockSize 16 · verbatimWindow
  30 · fanOut 8`, vs the steady clone's `8 · 8 · 4`). A config value, not a code semantic — set in
  `memory/constants.ts` at build.
- **persistence→assembly up-reach — RESOLVED.** `sanitizeSpeakerLookalike` moves to
  `@orb/kit/speaker-label` (the speaker-label family's destination per `shared-dissolution.md §1` — kills
  the up-reach for it). The shared `frame()` stays a chat-internal pure helper in `assembly/injections.ts`;
  `persistence/queries.ts` importing it is an **accepted intra-domain edge** (persistence→assembly is
  within one domain — the layer-cake governs cross-domain/cross-package edges, not intra-domain subsystem
  imports). The SDK-frame up-reaches leave entirely with the agent-sdk extraction.
```

---

# Part II — Resolution order & load-bearing rules (the authoritative design)

> Merged from the former top-level `chat.md` (2026-06-25 de-duplication — one home per topic).

> **Status: planning (authoritative detail).** Chat is the integration point — world-info, characters/
> group, regex, macros, guided steering, injections, memory, and render all hook in, **in a specific
> order that bites silently if wrong.** This doc makes that order **one explicit, legible, enforced stage
> list** instead of (today) logic split across three files with implicit hand-off. Consumes the `kit`
> engines (macro/regex), `connection` (the resolved backend+capability), `participants-agents-identity`
> (the chat-turn foundation), and `knowledge-cluster` (memory recall). `domains.md` carries the summary.

## 0. The principle — the order IS the artifact

neo-tavern's chat order is correct but **invisible**: the WI "macro→regex→wrap→macro" lives in
`context.ts`, the section walk in `assemble.ts`, the splice/squash/names/breakpoint in `pipeline.ts`. No
one function says "this is the order." That's the whole confusion.

> **Orbweaver: each context is a single, named, ordered stage list you can read top to bottom.** Chat
> *orchestrates* the pure `kit` engines (macro, regex) and the data they run on (the macro context, the
> active regex scripts, the WI pool, memory) **in that explicit order.** Chat owns the *order*, not the
> engines.

`chat` is a **consumer**: it builds the `MacroContext`, gathers the active regex scripts (from the
regex-script library) + WI pool + memory, then runs the engines in the canonical order. The engines
(`kit/macro`, `kit/regex`) and the speaker-label helpers are `kit` (used identically by render).

## 1. The five contexts

| Context | Side | What | Mutates canon? |
|---|---|---|---|
| **DISPLAY** | client | stored text → what a human sees | no (read-only projection) |
| **SEND** | server | composer text → persisted user message | yes (writes the post-regex user row) |
| **ASSEMBLE** | server | build the LLM prompt for a turn | no (the prompt is recomputed every turn) |
| **RECEIVE** | server | streamed reply → persisted assistant message | yes (writes the post-regex reply) |
| **COMPOSER** | client | text being edited | no — pass-through (today literal; see §9) |

## 2. The canonical order per context (the spine)

**DISPLAY** (client): `strip-leaked-speaker-label → macro → DISPLAY-regex → fix-markdown →
markdown-render (sanitize + speaker-spans + quote-spans)`.

**SEND** (server): `macro → (set {{input}}) → USER_INPUT-regex → fold into WI haystack + {{input}} →
persist post-regex user row`.

**ASSEMBLE** (server) — explicitly **four phases** (today blurred across two files):
1. **RESOLVE** — cast (primary + roster, live identity via `resolveCurrentVersion`), personas (active
   per-participant + anchor), room overrides, names. *(no macros yet — just identity.)*
2. **GATHER** — WI pool (4-scope union + keyword match over the haystack incl. pending user text),
   memory recall (`{{memory}}` via `search` scoped to this chat), ChoiceBlock variables.
3. **BUILD** — render sections in array order (the reorderable preset; `chat_history` is the pivot);
   per-section + per-injection: `macro → regex(WORLD_INFO) → frame`; route every injection into **one
   list**; **one budget pass**.
4. **SHAPE** (per runner, per speaker) — scope history to the speaker (egocentric) → splice in_chat by
   depth → squash same-role → name-stamp → group/continuation nudge.

**RECEIVE** (server): `AI_OUTPUT-regex → post-process (singleLine/dropIncomplete/trim) → REASONING-regex
→ persist`. *(macros NEVER run on model output — macros are author-side.)*

**COMPOSER**: no substitution today (autocomplete only). See §9.

## 3. Load-bearing rules (the "get it wrong and you're screwed" set — made explicit + enforced)

These are real constraints recon verified; in orbweaver they're **encoded in the stage order + gated**,
not tribal:

1. **Macros before regex, everywhere** (SEND, each WI entry, DISPLAY) — a script matching the resolved
   `{{char}}` name must see "Aria," not the literal. *The #1 silent breaker.*
2. **Macros before framing** — `[Note from user: …]` wraps *resolved* content (one shared `frame()` used
   by both system-block render and the in_chat splice — can't drift).
3. **Render once; never re-render resolved output.** The neo-tavern WI double-render (`macro→regex→wrap→
   macro`) + the `\{{x}}` escape-survives-one-pass interaction is a correctness trap. Orbweaver: resolve
   the `wiFormat` template's macros in the SAME pass (no second render of already-resolved text).
4. **Keyword match sees the in-flight user text — two-phase dissolves the lag.** RESOLVE produces names
   first, so GATHER's keyword match runs over `recent + names + pending user text` with the *resolved*
   form — killing neo-tavern's one-turn lag (a circular dep there because its macro ctx was built *from*
   the assemble ctx; here RESOLVE precedes the macro ctx).
5. **Name-stamp ordering** — scope-to-speaker before the multi-speaker check; name-stamp after squash;
   the **trusted `Name:` label applied at a step no USER_INPUT/AI_OUTPUT regex can reach** (so a member
   can't forge another speaker). (Per-participant isolation from `participants-agents-identity.md` makes
   most of this a no-op for solo/non-merged.)
6. **Squash same-role at every shaping boundary** — Anthropic hard-errors on adjacent same-role;
   deterministic squash defends a mid-life backend flip.
7. **in_chat depth semantics** — depth from the end (0 = tail), clamped once before the walk, sorted
   depth-DESC; assistant@depth-0 floors to depth-1 (no trailing-assistant prefill).
8. **RECEIVE post-process after AI_OUTPUT regex** — a user script sees the raw reply; post-process is the
   final cleanup.

## 4. ONE injection list + ONE budget pass (the biggest structural win)

Today (verified — TWO tallies, not three): WI delivery is already **ONE unified budget walk** over a
single `wiTokenBudget` (the position split into in_chat/in_static/in_prompt happens *after* the budget
decision, not as two budgets), plus the completion **fit-pass** (`fitHistoryToWindow`, stateless runners
only); `chat_injections` are **unbudgeted** (confirmed gap). So the WI half is already unified — the work
is folding the injections + the fit-pass into the same pass. Orbweaver: **WI + persona-description +
author's-note + after-history sections + guided-injections all flow through ONE `Injection[]` list**, each `{content, position, depth, role}`,
**budgeted in one pass** against the model's context window (from the `connection` capability). One list,
one budget, one splice. (The "unified injection model" `send-round-trip.md` aspired to — made real.)

## 5. Two-phase assemble kills the mutation fragility

neo-tavern mutates `assembleCtx` in place (`applyInputs`/`setSpeaker`/`setNarrator`/after-history merge)
+ aliases the macro env to `variableValues` — powerful but fragile (the per-speaker loop's correctness
depends on "re-assemble fresh off the mutated ctx"). Orbweaver: **RESOLVE+GATHER produce an immutable
turn context; BUILD+SHAPE take it (+ the speaker) and return a prompt — per speaker, no shared mutation.**
A per-speaker turn is `shape(immutableTurnCtx, speaker)`, not "mutate then re-read."

## 6. Guided steering — one clear model

Today: 6 actions, routed by a per-action `role` through **two paths** (`role:system` → a
`{{guided_instruction}}` marker in the dynamic half; `role:user|assistant` → a depth-0 injection), with
**three override layers** + an `opening` carve-out + a splice-time auto-convert. "Where does my steer
go?" takes four lookups to answer.

Orbweaver: **guided is always a typed steer with one resolution rule.** A steer is `{action, input,
placement}` where placement is *one* explicit choice (system-marker vs depth-0 injection), **defaulting
to the `{{guided_instruction}}` system-marker** (the steady clone's `role:"system"` default for all 6
actions; §11), resolved once, not re-routed at splice time (the old `role:system`-at-depth auto-convert
is dropped). Untrusted `{{input}}` is macro-neutralized (kept). `opening` is just
the action whose resolved template *is* the turn prompt (a normal action, documented, not a hidden
fourth path). Guided "response" still skips the user-commit (the steer reaches the model only via its
placement, never folded into history/WI).

## 7. Ephemeral vs persisted — the taxonomy, made explicit + enforced

| Class | Examples | Touches stored canon? |
|---|---|---|
| **render-only** | DISPLAY-placement regex, `markdownOnly` scripts, fix-markdown, span coloring, speaker-label strip | no |
| **canon-mutating at write** | USER_INPUT regex (SEND), AI_OUTPUT/REASONING regex (RECEIVE) | yes — the stored row is the transformed text |
| **prompt-affecting only** | `promptOnly` scripts | sent prompt, not display |
| **transient injection** | the one `Injection[]` list (WI, persona-desc, AN, after-history, guided) | rows may persist (e.g. chat_injections), content spliced per-turn, never into a `messages` row |
| **persisted canon** | `messages.content`/`reasoning`, variants, continue snapshots, the macro `variableValues` flush | yes |

**`runOnEdit` — wire it, don't kill it.** It's unwired today (copied from ST, never hooked up) — but
that's *intent not yet realized*, not worthless. ST's `runOnEdit` re-runs a canon-mutating regex when a
message is **edited**, so a destructive transform stays applied after an edit (a real trigger axis).
Orbweaver wires it properly — re-apply on edit — or deliberately modernizes it; never deletes it on
sight as "dead." The leg-gating (`placement ∩ markdownOnly/promptOnly ∩ call-site`) is made a single
explicit rule, not a three-way implicit interaction.

## 8. Cache: the 2B history breakpoint is LIVE — preserve it; only the dead boundary-gate is dropped

> **Corrected 2026-06-25** after a code-grounded re-check (the original §8 said "drop the minefield" —
> that was wrong and would have shipped a silent ~5300-token/turn cache regression). Two different
> things hide under "cache"; do not conflate them.

- **The old hard cache-*boundary* gate** (the static/dynamic split once forced a hard boundary) —
  relaxed/killed 2026-06. **Dead.** The static/dynamic split survives only as an advisory provenance
  hint, not a gate. (This is the part the original recon was right about.)
- **The 2B rolling-tail history breakpoint** (`computeHistoryBreakpoint`, pipeline.ts:1594) —
  **LIVE and load-bearing.** It is a SECOND Anthropic `cache_control` breakpoint, *distinct* from the
  static-system-block one, pinned on the last stable history message so the conversation **prefix**
  caches turn-over-turn. Live-verified ~5300 history tokens cached (8159 vs 2872 read — CLAUDE.md).
  It is an **optimization, not a correctness gate**: dropping it yields a correct reply with a silent
  ~5300-token/turn cache regression — precisely the failure a from-prose rebuild misses without a
  cache-token measurement.

**Orbweaver keeps it, and keeps the COMPUTATION in chat assembly.** The off-by-one machinery is one
proven invariant + three conservative aborts, all of which depend on assembly-internal knowledge the
runner does not have: a **depth≥2 in_chat injection** splices inside the stable prefix (abort), a
**boundary squash-merge** changes the boundary bytes (abort), and an **appended tail nudge** adds a
second volatile tail (abort). So this is **relocate-the-tag, not move-the-computation**: chat computes
the safe `cacheBreakpointFromEnd` (it alone knows in_chat depth + squash + nudge); the runner only
*places* the `cache_control` tag at that offset, gated on `cacheMinTokens`. You cannot push the
computation into the backend without dragging the in_chat-depth/squash semantics with it. The orbweaver
win is making the breakpoint **legible inside the explicit stage list (the SHAPE phase)** — not deleting
it. Carry `pipeline-breakpoint.test.ts` (it drives the real splice+squash) forward as the oracle, and
diff the cache-token counts against running neo-tavern when porting.

### Target spec (ST-grounded — verified against SillyTavern's `cachingAtDepth`)

ST (the thing this replaces) caches Claude prompts the **same way for both Anthropic-direct and
OpenRouter-Claude** (`src/prompt-converters.js`), via two opt-in mechanisms:
- **system-block cache** (`enableSystemPromptCache`) — `cache_control` on the last text part of the
  system block (`cachingSystemPromptForOpenRouter`, :1068) + the last tool.
- **conversation cache** (`cachingAtDepth`; `cachingAtDepthForClaude` :981 / `…ForOpenRouterClaude`
  :1016) — walk from the tail, **skip the assistant prefill** ("caching the prefill is a terrible
  idea"), (OR) skip system messages, count **role-switches**, and pin `cache_control` at **TWO** points
  — `depth` AND `depth + 2` — a rolling pair anchored at the tail. TTL `5m`/`1h` (`extendedTTL` + the
  `extended-cache-ttl-2025-04-11` beta header).

This confirms the architecture (system block + a rolling conversation breakpoint is the correct,
battle-tested pattern — not an aberration) and surfaces the one thing neo-tavern is missing: neo pins
**one** history breakpoint; ST pins a **pair** two role-switches apart. The pair is belt-and-suspenders
against tail churn — an edit/swipe that busts the newest prefix still hits the older breakpoint's cache
read.

**Orbweaver target = the synthesis (ST's pattern + neo's correctness):**
1. **System-block cache** — always-on for Anthropic (neo already does this; keep). One breakpoint on the
   static system block.
2. **Conversation cache = ST's rolling PAIR** (`depth` & `depth+2` from the tail, prefill-skipped) — the
   concrete upgrade over neo's single breakpoint.
3. **…placed only on a SAFE boundary** — neo's three aborts (`computeHistoryBreakpoint`: depth≥2 in_chat
   injection, boundary squash-merge, appended tail-nudge) gate *where* the pair may land, so a breakpoint
   never falls on bytes the next turn will churn. This is neo's correctness contribution to ST's pattern.
4. **TTL configurable** (`5m`/`1h`), each breakpoint gated on `cacheMinTokens` (below it Anthropic won't
   cache — a breakpoint there only burns one of the 4 slots).
5. Computed in **SHAPE** (it needs in_chat-depth + squash + nudge state the runner lacks); the runner
   only *places* the tags. **Default-ON** (ST defaults off only because it's a general-purpose tool;
   this is a roleplay-tuned app with a large, stable prefix where the cache win is the common case).

## 9. COMPOSER + render notes

- **COMPOSER**: today literal (no preview). Decision: add a **live macro/regex preview** (the same `kit`
  engines, the DISPLAY render minus persist) so authors see `{{char}}`/scripts resolve as they type — or
  explicitly keep it literal. (Open — §11.)
- **Render context can be null today** → silent raw fallback (literal `{{...}}`); optimistic chats lack
  DISPLAY regex/vars until commit. Orbweaver: make the degraded-render state explicit, not a
  looks-like-a-bug silent fallback.
- **Speaker-label logic lives once** (`kit`) — used at persist AND render (neo-tavern re-derives it in
  three places + duplicates the streaming-tail hold).

## 10. Invariants (gate candidates)

1. **One canonical order** — each context is a single named ordered stage list; no order logic split
   across files. (A reviewer can read the order in one place.)
2. **Macros before regex; macros before framing** — enforced by stage order.
3. **Render once** — no function re-renders already-resolved output.
4. **One injection list + one budget pass** — no second WI budget, no unbudgeted injection.
5. **Immutable turn context** — BUILD/SHAPE take it + a speaker and return a prompt; no shared-ctx
   mutation across the per-speaker loop.
6. **Trusted speaker label applied after all USER_INPUT/AI_OUTPUT regex** — un-forgeable.
7. **Macros never run on model output.**
8. **Engines are `kit`** — chat imports `kit/macro` + `kit/regex`, never re-implements them; render uses
   the same.
9. **Regex triggers are explicit + wired** (placement, leg-gating, and on-edit/`runOnEdit`) — no
   silently-inert flags. An unwired flag is wired or removed *deliberately*, never left as a lie.
10. **The rolling history cache breakpoint(s) are preserved** — orbweaver pins ST's rolling **pair**
    (`depth` & `depth+2` from the tail, prefill-skipped), each placed only on a safe boundary via neo's
    three aborts (depth≥2 in_chat injection, boundary squash, tail-nudge), computed in SHAPE and placed
    by the runner; never dropped. Gate: `pipeline-breakpoint.test.ts` carried forward + a cache-token
    differential against running neo-tavern (a correct reply with cacheWrite/read at 0 = regression).

## 11. Decisions (resolved / deferred)

- **COMPOSER preview — RESOLVED for launch, enhancement DEFERRED.** Default = literal (autocomplete only)
  at launch; the live macro/regex preview is a fast-follow that reuses the DISPLAY render path (the same
  `kit` engines, minus persist). It is not load-bearing — decide when the composer UI lands. Either way
  the COMPOSER context stays pass-through canon (no persist).
- **Guided placement default — RESOLVED: system-marker.** The default placement is the
  `{{guided_instruction}}` system-marker (matches the steady clone's `role:"system"` default for **all 6**
  actions). A steer is `{action, input, placement}` with **one** `placement` field (replacing the old
  `role` + 3-layer override); set it to a depth-0 injection (user/assistant) only for an action that must
  read as an in-character turn. Placement is resolved once — the splice-time `role:system`-at-depth →
  `[Note from system: …]` auto-convert is **dropped** (no re-routing at splice).
- **Section model — RESOLVED: keep it.** The reorderable-array + `chat_history`-pivot + overridable
  markers (`main_prompt`/`post_history` with `{{original}}`) stay. The static/dynamic kind-split survives
  **only as an advisory provenance hint, not a cache gate** (confirmed in §8 — the hard boundary-gate is
  dead).
- **Per-speaker shaping — RESOLVED: pure.** `shape(turnCtx, speaker)` carries no engine state between
  speakers (invariant #5). The one ordering constraint: the turn ctx for speaker k+1 is re-derived
  *after* speaker k's row commits (so k+1 witnesses k's line) — `shape` is pure given its ctx; canon
  advances between speakers, the function does not.
- **Group threading — RESOLVED: a `speaker` arg, never a ctx mutation.** `setSpeaker`/`setNarrator`
  become the `speaker` argument to `shape(turnCtx, speaker)`; the per-speaker loop re-derives `shape` per
  speaker off the immutable ctx (+ advancing canon), replacing the ~17 in-place `assembleCtx` mutation
  sites.
