---
kind: spec
status: active
updated: 2026-07-18
---

# World-state · Clips · Trackers — the memory-extension cluster mini-spec (the D94 entry ticket)

> **Status: DESIGN — nothing below is built.** This is the mini-spec D94 names as the entry ticket for
> the D55-reserved seams: `@orb/contracts/memory` (`CLIP_KINDS` / `CLIP_SOURCE_KINDS` / `CLIP_SCOPES`),
> the `{{world_state}}` macro slot beside `{{memory}}`, and the `reconcile-world-state` WorkloadKind
> (PD-18 stub; sole claimant = memory, per the D58 amendment 2026-07-18 that retired the rpg claim).
> Closes the spec gap PD-133 tracks. Recovered intent: the gutted `domains/memory.md` §9 seam-reservation
> roadmap (git `4885a5d2^`) + the council's "synthesize, don't just retrieve" v2 apex
> (`reports/COUNCIL-REVIEW.md` at `479d7584` — "builds a superb substrate and only retrieves from it;
> the move is to synthesize"). Evidence mines (never port-by-copy): the Marinara tracker system
> (`reports/research/marinara-delta-features.md` §1 — continuity-history merge, field locks,
> id→name→index lock resolution) and SillyTavern (which has NO tracker/world-state system — its nearest
> analogs are the Summarize extension and World Info; trackers are Marinara's contribution).
> Builder prerequisite reading: `docs/law/Constitution.md` · `docs/law/Knowledge-Cluster.md` · ledger D55/D58/D86/D93/D94
> · the live `domain/chat/memory/` code + headers. The ledger wins on any conflict.

**The one-paragraph design.** The tiered digest memory remembers what was SAID (episodic, derived,
rebuildable). This cluster adds the layer that knows what is TRUE: **Clips** are durable, human-legible
memory atoms (typed statements over `CLIP_KINDS`, provenance over `CLIP_SOURCE_KINDS`, scoped over
`CLIP_SCOPES`, embedded and retrievable); **Trackers** are named current-state slots that update in
place (relationship status, plot-thread state, standing facts-in-motion — per chat, optionally
per-subject-character, host-lockable); **world-state** is the reconciled narrative snapshot — a derived,
watermarked projection of settled canon ∪ the clip/tracker layer, assembled into the `{{world_state}}`
macro in the dynamic (cache-safe) prompt half beside `{{memory}}`. The `reconcile-world-state` workload
is the synthesis engine: a host-funded, fire-and-forget, derive-from-canon pass (structured
`runStructuredTurn` on the summarize role) that updates synthesized trackers, mints/retires synthesized
clips, and rewrites the snapshot — invalidation-safe against swipe/edit/fork/delete because the
synthesized layer is a pure function of canon ∪ user-authored rows and rebuilds whole on hash mismatch.

---

## 1. Concept partition (the four memories, and the rpg line)

| Layer | Question it answers | Mutability | Store | Prompt surface |
| - | - | - | - | - |
| digests/segments (BUILT, D55) | "what was said" (episodic) | derived, self-healing | `chat_digests`/`chat_segments` | `{{memory}}` |
| **Clips** | "what is durably true" (semantic atoms) | user-authored OR synthesized; user/promoted never auto-deleted | `memory_clips` (+ `clip_embeddings`) | `{{world_state}}` Facts block (+ retrieval) |
| **Trackers** | "what is true RIGHT NOW" (evolving slots) | updates in place; host-lockable | `memory_trackers` | `{{world_state}}` Trackers block |
| **world-state snapshot** | "the current story situation" (reconciled prose) | derived projection, rebuildable | `chat_world_states` | `{{world_state}}` Story-state block |

- **Clip vs tracker:** a clip is an append-durable STATEMENT ("Mira is allergic to silver"); a tracker
  is a SLOT whose value evolves ("Mira↔Kade relationship: uneasy allies"). Both share the ONE kind axis
  `CLIP_KINDS` (`fact`/`trait`/`relationship`/`world-state`/`plot-thread`) and the ONE provenance axis
  `CLIP_SOURCE_KINDS` (`user`/`synthesized`/`promoted`) — derive, never re-declare (§5.5 discipline).
  *(Rejected: separate tracker-kind/tracker-source tuples — a second spelling of the same axes; the
  contracts tuples were reserved precisely to be THE axes.)*
- **vs the digest memory:** digests are block-keyed, witnessing-scoped, retrieval-selected episodes;
  the clip/tracker layer is entity-keyed current truth. They never share rows; the recall bridge stays
  untouched. `{{memory}}` = remember; `{{world_state}}` = know.
- **THE RPG BOUNDARY (D86 — rpg is OUT of scope here).** rpg/lite trackers (rpg-design doc 13) are
  GAME state: model-written via D48 TOOLS inside the turn, swipe-keyed snapshots, lock-merged staging.
  Memory trackers are NARRATIVE memory: OBSERVED state synthesized POST-turn from committed prose by
  the reconciler — **no tool ever writes `memory_clips`/`memory_trackers`/`chat_world_states`, and the
  reconciler never reads rpg tables** (it reads canon prose only). The two coexist on one chat with no
  mutual exclusion (memory runs on rpg chats exactly as digests do). ADJACENT, not same — the D86
  tool-write model is why the rpg claim on this workload was retired (D58 amendment).
- **The Narrative Director is NOT this workload** — the observe→propose→confirm observer shipped as
  `crew-director` (D59/D98). The reconciler proposes nothing and asks nothing; it derives.

## 2. Data homes

All three tables land in `db/schema/memory.ts` (producer-named — the memory subsystem is the writer;
invariant 4 of `Knowledge-Cluster.md`); `clip_embeddings` lands in `db/schema/embeddings.ts` (vector
tables are named for THEIR producer). New branded ids in `@orb/kit/ids`: `ClipId` (`clip`),
`MemoryTrackerId` (`mtracker`), `WorldStateId` (`wstate`). All DDL rides the `0000_baseline` regen (WS0).

### 2.1 `memory_clips` — the durable atom store

| Column | Shape | Notes |
| - | - | - |
| `id` | `ClipId` PK | |
| `ownerId` | FK `users` CASCADE, **KEPT** | D23: TRUE PRODUCER — a curated per-user memory artifact; the `global` scope has no owned anchor to derive through (the `world_books` precedent exactly). Synthesized chat clips stamp the HOST (the D55 host-owned-memory rule). |
| `scope` | text CHECK in `CLIP_SCOPES` | |
| `chatId` | FK `chats` CASCADE, nullable | per-scope shape CHECK (the `users_agent_shape` precedent): `scope='chat'` ⇒ `chatId` NOT NULL · `scope='character'` ⇒ `characterId` NOT NULL · `scope='global'` ⇒ both NULL |
| `characterId` | FK `characters` CASCADE, nullable | |
| `kind` | text CHECK in `CLIP_KINDS` | |
| `source` | text CHECK in `CLIP_SOURCE_KINDS` | `promoted` = a synthesized clip the user blessed; joins `user` under the never-auto-delete invariant |
| `text` | text | the statement, ≤ a contracts-capped length |
| `enabled` | boolean default true | user off-switch; disabled clips never inject and never rank |
| `retiredAtSeq` | integer nullable | synthesized-only soft retirement (§4); NULL = live |
| `mintedAtSeq` | integer nullable | canon watermark a synthesized clip was derived at (NULL for user clips) |
| `createdAt`/`updatedAt` | | |

Index: `(ownerId, scope)`; `(chatId)` partial where chatId not null.

### 2.2 `memory_trackers` — evolving current state (chat-scoped)

| Column | Shape | Notes |
| - | - | - |
| `id` | `MemoryTrackerId` PK | |
| `chatId` | FK `chats` CASCADE | **NO ownerId** — D23 DERIVE: room state anchored to the chat, membership-scoped reads, host-gated writes (D18; the digests precedent, D20) |
| `key` | text | the label — label-as-mini-prompt (the Marinara lesson: the NAME + hint ride into the prompt as steering) |
| `subjectCharacterId` | FK `characters` SET NULL, nullable | per-subject grouping ("Corruption — Sera"); nullable = room-level |
| `kind` | text CHECK in `CLIP_KINDS` | one axis, derived (§1) |
| `source` | text CHECK in `CLIP_SOURCE_KINDS` | user-created vs reconciler-minted |
| `value` | text | the current state (free text — narrative trackers; numeric meters are rpg's plane, deliberately NOT modeled here) |
| `hint` | text nullable | steering guidance rendered beside the value |
| `locked` | boolean default false | host lock — the reconciler NEVER writes a locked tracker (the Marinara field-lock lesson; edit-wins) |
| `enabled` | boolean default true | |
| `updatedAtSeq` | integer | canon watermark of the last value write |
| `createdAt`/`updatedAt` | | |

Unique: `(chatId, key, subjectCharacterId)` (id→key resolution at reconcile-apply is id-then-key —
the Marinara id→name→index lock lesson, minus positional: rows here have stable ids).

### 2.3 `chat_world_states` — the reconciled snapshot (derived, rebuildable)

One row per chat: `id` (`WorldStateId`), `chatId` FK CASCADE **unique** (no ownerId — derive via the
chat), `text` (the snapshot prose), `reconciledAtSeq` (watermark), `canonHash` (the invalidation gate —
§3.3), `updatedAt`. A pure function of canon ∪ the clip/tracker layer: delete the row and the next
reconcile rebuilds it (`Knowledge-Cluster.md` invariant 1 extended to this table).
*(Rejected: parking the snapshot in `chats.metadata` — metadata is host-SET config (D91's
`databankVisibility`), never derived output; mixing derived state into a config blob breaks the
derive/config separation and the rebuild-by-delete property.)*

### 2.4 `clip_embeddings` — clips join the substrate

Clips are retrievable: a 6th `VECTOR_TABLES` member + a `{ kind: "clip", lens: "clip-text" }` arm on
`embeddings.store` (unique `(clipId, model)`; `content_hash` staleness gate as every lens). **The ONE
write path holds** (invariant 1) — memory never inserts a vector; the clip write path fires
`embeddings.store` post-commit (non-blocking), and the `index` workload's text sweep gains the clip
source for backfill/model-change. Owner-scope at search DERIVES via `memory_clips.ownerId` (the
`character_embeddings` pattern, D20). A retired/disabled clip is excluded at query time, not evicted
(the row deletes cascade the vector — FK physics, D50's no-eviction-events rule).
*(Rejected: no embeddings, inject-everything — a global clip library grows unboundedly; without
retrieval the Facts block either blows the budget or silently truncates, the named owner sin. Rejected:
riding `chat_digests` — clips are not block-keyed and not chat-bound; a fake block key would poison the
bridge.)*

### 2.5 Contracts (additive over the reserved tuples)

`@orb/contracts/memory` grows: `clipSchema`/`Clip`, `memoryTrackerSchema`/`MemoryTracker`,
`worldStateViewSchema`/`WorldStateView` (snapshot + trackers + in-scope clips — the panel read shape),
the CRUD input schemas, and `WORLD_STATE_*` caps (text lengths, facts budget). The three reserved
tuples are consumed, never widened. `@orb/contracts/settings`: `memoryDefaultsSchema` gains a
`worldState` sub-object (`mode: "on"|"off"`, `reconcileBlockThreshold`, `factsBudgetTokens`,
`snapshotMaxTokens`) — the D36 pattern verbatim: GLOBAL enable via AppSettings, per-user opt-out via
`UserSettings.memory` (`worldStateEnabled`), **no per-chat column**. Versioned-config lift stamped
(the schema-version rule).

## 3. The reconciler — `reconcile-world-state` goes live

### 3.1 Job (exactly three writes)

> **OWNER INVARIANT (ruled 2026-07-18, at spec review — "I don't want characters remembering between
> chats"): SYNTHESIS IS CHAT-BOUNDED.** No automated path (reconcile incremental, full re-derive,
> retirement, promotion, GC) ever WRITES a `character`- or `global`-scope row — all three machine
> writes below are chat-keyed, always. A memory crosses chats ONLY via an explicit human act with the
> scope picked in hand (character-editor authoring, the global library, Save-as-clip's scope picker) —
> authored content traveling with a card, never a character "remembering." Enforce like the
> never-delete-user-clips invariant: by construction (the mint path carries no scope parameter — it
> writes `scope:'chat'` literally) + a dedicated §8 test asserting a full reconcile over multi-chat
> fixtures produces ZERO non-chat-scope rows.

Per hosted chat with pending work: (1) **update synthesized trackers** — upsert/update unlocked
trackers from newly settled canon (id-then-key match; locked and disabled rows untouched; user rows'
values MAY be updated — that is what a tracker is for — but user rows are never deleted);
(2) **mint/retire synthesized clips** — durable facts discovered in settled canon become
`source:'synthesized'` chat-scope clips (`mintedAtSeq` stamped); a synthesized clip the new canon
contradicts/supersedes is soft-RETIRED (`retiredAtSeq`), never hard-deleted incrementally (the panel
shows "the story moved on"; promote rescues it); (3) **rewrite the snapshot** — one prose synthesis of
"the current situation" composed from the settled tail + live trackers + live world-state/plot-thread
clips, written to `chat_world_states` with the new watermark + hash.

### 3.2 Reads and the synthesis call

The runner is THIN (the runner-env law): the implementation lives in
`domain/chat/memory/state/reconcile.ts`, exposed as `WorkloadRunnerEnv.memory.reconcileWorldState(args)`
beside `backfill` — no new env namespace. It reads settled canon through memory's existing
block/transcript substrate (selected-variant chain, macro-resolved bodies — the digest build's exact
input discipline) and the clip/tracker rows through the subsystem's own persistence. The model call is
`runStructuredTurn` (`@orb/server/kit/structured-turn`) on the host's **summarize role**
(`resolveRole('summarize')` — memory's own precedent: the summarizer is a turn on the user's backend,
token-guarded, D55), with an **anthropic-clean** output schema (D93: no `discriminatedUnion`, no wire
bounds — flat kind-tagged ops, bounds on the post-parse zod belt). One run = one completion = one
schema (`{ trackerOps[], clipOps[], snapshot }`), ONE bounded correction retry — the D59/D79 structured
discipline. *(Rejected: the agent role — this is memory machinery, not an agent seat; the summarize
role is the one memory already funds and token-guards. Rejected: tools — an extractor is not an actor;
D59's "members are pure structured output" rule applies with the same force.)*

### 3.3 Derive-from-canon vs incremental (THE design driver)

**Watermarked-incremental with whole-rebuild on invalidation.** Normal path: process only blocks
settled since `reconciledAtSeq` (the digest build's aged-out cutoff shields the live tip, so swipes and
edits at the tip never touch the reconciled layer — the protect-zone property, free). Invalidation
path: `canonHash` = a rolling `@orb/server/kit/content-hash` over the settled selected-variant chain
(seq/attribution/personaId/content — the `MsgRow` hash basis) up to the watermark; each run recomputes
the prefix and on mismatch (edit/swipe-select/re-attribution/delete BELOW the watermark, or a fork's
divergence) performs a **full re-derive**: hard-delete the chat's synthesized clips + synthesized
trackers, reset the snapshot, re-run from seq 0 in block batches. Legal because the synthesized layer
is a pure function of canon ∪ user-authored rows — the D46 derive-don't-stamp lesson applied wholesale:
user/promoted clips, user trackers, and locks are the STAMPED stratum (never touched by any rebuild);
everything synthesized is the DERIVED stratum (always safely destroyable). *(Rejected:
incremental-only with per-edit patch-up — reconciling a mid-history edit against an already-evolved
tracker chain is un-derivable in general (the value folded later evidence in); the rebuild is the only
honest answer, and it is cheap at chat scale. Rejected: eager re-derive on every edit event — the
watermark/hash check at next run gets the same correctness with zero hot-path work.)*

**Fork (D27):** the fork COPIES the user stratum (chat-scope `user`/`promoted` clips, user trackers,
locks) and copies NO synthesized rows — the fork's first reconcile derives fresh (it may seed from the
parent snapshot when the canon-hash prefix matches; an internal optimization, non-normative).
**Deletes:** chat delete cascades all rows; character delete cascades character-scope clips and
SET-NULLs tracker subjects — FK physics, no reaper.

### 3.4 Cadence + triggers

- **Post-turn threshold (primary):** the engine's existing fire-and-forget memory hook
  (`engine.ts`, beside `generateSegments`/`generateDigests`) additionally enqueues a SINGULAR
  `reconcile-world-state` `{ chatId }` on the HOST when ≥ `reconcileBlockThreshold` (default 1) new
  complete blocks settled past the last watermark — a cheap pre-check first, so a fresh chat does ZERO
  reconcile work (D55 trigger discipline). Enqueue-not-inline: the summarize call must never ride the
  turn's tail latency; the queue coalesces bursts via the single-active `(kind, ownerId, source)` lock.
- **Host action:** `memory.reconcileNow(chatId)` — host-gated explicit run (also the recovery path
  after mass edits). This is ALSO the reserved D55 "retroactive rebuild" host-action pattern's sibling.
- **Backfill/import:** the `memory-backfill` runner and the import post-settle enqueue a reconcile per
  affected hosted chat (same params).
- **Bulk:** the box-owner sweep (`ownerId: null`, no chatId) walks every host's hosted chats —
  maintenance/migration. Mode policy flips to `{ singular: true, bulk: true, bulkRequiresTarget: false,
  stub: false }`; params widen `noParams` → `z.object({ chatId: chatIdSchema.optional() })`
  (singular carries the chat; bulk omits it — the databank-reindex shape).

### 3.5 `WorkloadRunnerEnv` presence/buddy exposure — **NO** (PD-133's question, decided)

The reconciler is a pure derive-from-canon pass. Presence is transport ephemera — a pure function of
canon that reads who-is-online-now is no longer a function of canon (rebuild-idempotence dies), and
scheduling-by-presence buys nothing (the post-turn trigger already implies presence). Buddy is a
different authority plane (observe→propose→confirm), and the "observer agent" idea this row once
gestured at shipped as `crew-director`. **What this kills:** a "reconcile only while watched" nicety
(worthless) and any direct-push notification from the runner (the `worldStateUpdated` bus member covers
live UI). `WorkloadRunnerEnv` gains only the `memory.reconcileWorldState` op. PD-18 + PD-133 close on
this spec's WS3.

### 3.6 Observability

`memory.reconcile` structured log + trace (`{blocksProcessed, trackerOps, clipOps: {minted, retired},
snapshotTokens, rebuilt: boolean, ms}`) — the memoryTrace discipline: "did it work and why" is a
first-class greppable fact. `assembleTrace` gains the `world_state` marker's include/size row.

## 4. Synthesis, authoring, and the deletion policy

- **Synthesized** clips/trackers come ONLY from the reconciler (§3). Structured turns under D79/D93
  wire law; the summarize role; host-funded.
- **User authoring:** full CRUD verbs (§6 authority). The client's two entry points: the State tab's
  add-clip/add-tracker forms, and a message-action "Save as clip" (prefills `text` from the selected
  message, host picks kind/scope) — the pin-one-off-fact gesture the §9 roadmap named.
- **Promotion:** `memory.promoteClip` flips a `synthesized` clip → `promoted` (host for chat-scope,
  owner for character/global). Promoted ≡ user for every protection below. Promotion of a RETIRED clip
  clears `retiredAtSeq` (the rescue path).
- **THE INVARIANT (contract-reserved since birth): a `user` clip is NEVER auto-deleted** — and this
  spec extends it: no automated path (reconcile incremental, full re-derive, retirement, GC) deletes or
  retires a `user` or `promoted` clip, or deletes a user-created tracker, or writes a locked tracker.
  Only the explicit owner/host delete verb removes them. Enforced by construction (the re-derive delete
  is `WHERE source = 'synthesized'`) + a dedicated transition test (§8 test bill) — the
  merge-clear-needs-a-transition-test class.
- **Auto-deletion of synthesized rows:** incremental runs soft-retire clips (`retiredAtSeq`) and may
  delete synthesized trackers only on full re-derive; there is no time-based GC (durability is the
  product; the substrate stays small — text rows).

## 5. Consumption — `{{world_state}}` assembly

- **The marker:** `world_state` joins `TEMPLATED_MARKERS` + `BUILTIN_MACRO_METADATA` (category `system`, alongside `memory`) +
  `DEFAULT_MARKER_TEMPLATES` (`Current state:\n{{world_state}}`) + a default section directly AFTER the
  `memory` marker, enabled by default — an empty value renders NOTHING (the memory marker's exact
  contract), so default-ON is inert until the first reconcile. The assembler's server-marker union
  (`compact_summary | memory | guided_instruction`) gains the `world_state` arm.
- **Cache-safety:** the value lands in the dynamic (cache-safe) half beside `{{memory}}` — per-turn
  variance never busts the cached static prefix (the seam comment the contracts header reserved). It
  stays a RAW identity-class macro (resolved at assemble, never frozen — the D51 freeze set is
  volatile-only).
- **Composition (three blocks, in order):**
  1. **Trackers** — live-formatted from `memory_trackers` at assemble time (enabled rows, grouped by
     subject, `key (hint): value` — label-as-mini-prompt), NOT from the snapshot, so a host edit shows
     next turn without waiting for a reconcile.
  2. **Facts** — enabled, unretired clips in scope: chat-scope clips ∪ the HOST's global clips ∪
     character-scope clips of PRESENT roster characters owned by the host (§6). Under
     `factsBudgetTokens` everything injects verbatim (no embed call — trigger discipline); over budget,
     rank by the recall query (`buildRecallQuery` reuse) through a new injected `ctx.searchClips` op
     (wired at `entry/compose/chat.ts` beside `searchDigests` — memory holds zero cosine, invariant 2)
     and take the budget's worth, pinned `user`/`promoted` first.
  3. **Story state** — `chat_world_states.text`, token-capped (`snapshotMaxTokens`).
- **Recall interplay:** `{{memory}}` is untouched — digests never carry clips, clips never enter the
  bridge. One steering license line ships INSIDE the default marker template (the Marinara insight,
  adapted): values color behavior; never recite the numbers. *(Rejected: folding clips into the
  `{{memory}}` result — two retrieval semantics under one macro makes the trace unreadable and couples
  the budget knobs; the reserved seam was ALWAYS a second macro.)*
- **Witnessing:** deliberately NOT applied to `{{world_state}}` — it is room-level shared truth
  (merged-bucket semantics) landing in the shared prompt every mode reads. Per-character PRIVATE
  knowledge is what character-scope clips + the egocentric digest buckets express; a scoped-mode chat
  that wants secret state uses those, not the snapshot.
- **Preset/budget:** the marker is a normal section — preset-orderable, role-settable, trigger-gated,
  disable-able per preset; the D32 placement shape governs any depth-positioned variant.

## 6. Authority + multi-user

- **Funding + execution:** reconcile runs under `runAsUserId` (the HOST) — one world-state per chat,
  host-owned, exactly the D55 memory rule ("only the host runs it, everyone benefits"). A gate keys the
  ops off `runAsUserId`, never the member.
- **Shared-prompt writes are HOST-owned (the D53 precedent):** chat-scope clip CRUD, tracker CRUD,
  locks, `reconcileNow` = `requireHost`. Members READ the chat layer (`requireParticipant` — it is in
  their prompt anyway; the `WorldStateView` panel read is membership-gated).
- **Injection sources are the host's own:** the Facts block draws the host's global clips and the
  host's character clips for present roster characters — a MEMBER's global/character clips never mutate
  the shared prompt (D53's exact line). Member-owned globals stay their own (they apply in rooms THEY
  host).
- **Member privacy (the D91 name-private rule):** the member panel payload carries the chat-scope layer
  ONLY; the host's contributing global/character clips are prompt-side and never enumerated to members.
- **`global` scope under D18/D20:** a global clip is owner-stamped (`memory_clips.ownerId`), reached by
  `fetchOwned`, and means "inject into every chat this owner HOSTS" — cross-chat by construction, never
  cross-tenant (no membership union widens another user's clips into a room).
- **Bus:** ONE new `ChatBusEvent` member `worldStateUpdated { chatId }` (id-only, re-read canon —
  D38/D50), emitted by the reconciler apply and by every chat-scope clip/tracker write verb. Declared
  in WS0 (the baseline `chat_events` CHECK regen) with a cited DEFERRED entry; the entry clears at WS3
  (the bus-coverage three coupled sites — gate DEFERRED map + mustPass example + check-gates STALE
  fixture, one change).

## 7. Client surface (sketch — the seams, named)

- **The chat CONTEXT "State" tab** — grafted through the §6c chat-context contributor registry
  (`makeChatsSection` tabs; the DBK-E databank-tab precedent): trackers list (host inline-edit, lock
  toggle, add row), the Facts list (chat clips; add/promote/retire-view; member read-only), the
  snapshot view + host `Reconcile now` + the reconcile trace line. Feature home:
  `packages/client/src/features/memory-state/` (surfaces + components per the five-tier ladder; CTs in
  `tests/ui` mirror).
- **Character-scope clips** — a section inside the character editor (owner-only; the editor already
  owns per-character panes).
- **Global clip library** — a library-management surface (`createCollectionSurface` +
  `createEntityMutation`; the ManagePartiesList one-list-two-mounts precedent if it needs a second
  mount). Placement: see Q3 (owner re-ruled — NOT Refinery; recommended a Settings USER-group
  "Memory" pane, the Personas precedent).
- **Message action "Save as clip"** — the message-row action menu, opening the add-clip form prefilled.
- All server reads ride the new `memory` tRPC router (§8 WS1); live updates ride `worldStateUpdated`
  through the central invalidation seam (one event→queryFilter map).

## 8. Chunk plan — WS0..WS5

Coupled-site checklists are IN the chunk that lands them; a chunk is done only with its test bill green
(`pnpm check` + `pnpm test`) and — for WS5 — rendered verification (`done ≠ rendered`).

### WS0 — contracts + schema riders (M) — the born-whole foundation

- [ ] `@orb/kit/ids`: `clip` / `mtracker` / `wstate` prefixes + branded types.
- [ ] `@orb/contracts/memory`: the §2.5 shapes (tuples consumed, never widened).
- [ ] `@orb/contracts/settings`: `memoryDefaults.worldState` knobs + user opt-out + version lift.
- [ ] `@orb/contracts/chat`: `worldStateUpdated` bus member + replay-guard row; bus-coverage DEFERRED
  entry (cited to this spec, cleared WS3) + gate example + check-gates fixture (the 3 sites).
- [ ] `db/schema/memory.ts` (three tables, §2.1–2.3) + `clip_embeddings` in `schema/embeddings.ts`;
  per-scope shape CHECKs; **`0000_baseline` regen** (squash — carries the tables + the
  `chat_events` type CHECK; biome-format the meta).
- [ ] `embeddings/contract/params.ts`: `VECTOR_TABLES` + the `clip` lens arm + persistence
  insert/prune in `embeddings/persistence/queries.ts` (the ONE write path — invariant 1 holds with
  no carve-out, the `document_chunks` precedent).
- [ ] `@orb/contracts/preset`: `world_state` marker + macro-catalog entry + default template + default
  section.
- Tests: contract tests (tuple derivation, scope-shape CHECK mirrors), db-structure green, baseline
  regen verified.

### WS1 — the state subsystem + verbs (M)

- [ ] `domain/chat/memory/state/` (clips.ts / trackers.ts / persistence additions / view\.ts):
  CRUD + promote + lock verbs behind ChatService front-door methods (the sealed-subsystem rule —
  only chat reaches in); authority per §6 (`requireHost` writes on chat scope, `fetchOwned` on
  global/character, `requireParticipant` reads).
- [ ] Clip write path fires `embeddings.store` post-commit (non-blocking); the `index` text sweep gains
  the clip source.
- [ ] NEW tRPC router `routers/memory.ts` — **sweep-classified same change** (every procedure
  PROBED/EXEMPT in the cross-tenant sweep; the new-router law).
- [ ] Fork copy (user stratum) folded into the D27 fork verb; cascade behavior pinned by tests.
- Tests: per-verb persistence + authz (member write refused, member read name-private, cross-tenant
  sweep), the never-auto-delete + lock invariant units, fork-copy transition test.

### WS2 — assembly consumption (M)

- [ ] Assembler `world_state` server-marker arm + the §5 three-block composer + budgets + the
  `searchClips` injected op (compose-wired at `entry/compose/chat.ts`).
- [ ] Trace + `assembleTrace` row; macro stays raw (freeze-set untouched — pinned by test).
- Tests: composition goldens (blocks, order, license line, budget cut with pinned-first), OFF ⇒
  byte-identical prompt (the non-databank-turn pin pattern), no-embed-under-budget trigger-discipline
  unit, cache-half placement assertion.

### WS3 — the reconciler live (L) — the workload stub→live six sites, one change

- [ ] `@orb/contracts/workloads`: mode-policy flip (`singular:true, bulk:true, stub:false`).
- [ ] `workload-params.ts`: `{ chatId? }` schema; `workload-result.ts`: `WorldStateReconcileResult`.
- [ ] `runner-env.ts`: `WorkloadMemoryEnv.reconcileWorldState` (+ the runner rewritten as the thin
  delegate).
- [ ] `domain/chat/memory/state/reconcile.ts`: watermark/hash incremental + full re-derive (§3.3), the
  structured synthesis (summarize role, anthropic-clean schema, one correction retry, token-guard),
  apply (id-then-key tracker ops; retire semantics; snapshot write), `memory.reconcileNow` verb +
  the engine post-turn threshold enqueue + backfill/import enqueue.
- [ ] `entry/compose/runner-env.ts` forward-wiring; transport run-UI visibility + fixtures.
- [ ] `worldStateUpdated` emit + bus-coverage DEFERRED entry cleared (+ the STALE fixture flip).
- Tests: **composed-real int test through the REAL runner** (D100 — a faked executor can stay green
  across a dead seam): enqueue → runner → env → reconcile → rows + bus, with a scripted structured
  reply; invalidation transitions (tip swipe = no-op via protect zone; below-watermark edit ⇒ full
  re-derive; user/promoted/locked survive the rebuild — the D-driver test); trigger discipline (fresh
  chat: zero enqueues); schema wire-cleanliness (no oneOf/bounds — the D93 belt); mode-policy/params
  contract mirrors.

### WS4 — retrieval + scale (S)

- [ ] Over-budget Facts ranking live end-to-end (embed staleness via content\_hash; disabled/retired
  excluded at query; owner-scope derivation test per D20 gates).
- [ ] Bulk sweep + model-change reindex path proven (clips re-embed under the `index` force sweep).
- Tests: scope-before-rank sweep addition for `clip_embeddings`; ranking determinism unit.

### WS5 — client (L)

- [ ] The §7 surfaces (State tab · character-editor section · global library pane · Save-as-clip) +
  invalidation wiring.
- Tests: CTs per surface (host vs member affordances, lock toggle, promote, empty states with action);
  a live drive + `pnpm snap` on the State tab (the ct-stub-lie lesson — the panel must render REAL
  reconciled data, not a stubbed resolver).

Build order is strict WS0 → WS1 → (WS2 ∥ WS3-prep) → WS3 → WS4 → WS5; WS0 is the only chunk that
touches the baseline.

## 9. Invariants (gate/test-protected — additions to the Knowledge-Cluster set)

1. The synthesized stratum (synthesized clips/trackers, the snapshot) is a pure function of canon ∪ the
   user stratum — deletable + rebuildable at any time.
2. `user`/`promoted` clips and user trackers are NEVER auto-deleted or auto-retired; locked trackers
   are never machine-written. (The contract's founding invariant, widened.)
3. No D48 tool writes any memory-state table; the reconciler reads no rpg table. (The rpg line.)
4. One vector write path holds — clip vectors enter only via `embeddings.store`; memory holds zero
   cosine (Facts ranking delegates to the injected `searchClips`).
5. Reconcile + every shared-prompt-affecting write runs host-side (`runAsUserId`/`requireHost`); a
   member's clips never reach another host's prompt.
6. `{{world_state}}` lives in the dynamic cache-safe half; empty ⇒ renders nothing; OFF ⇒ the turn is
   byte-identical to today.
7. Trigger discipline: a fresh chat does zero reconcile/embed work; under-budget Facts assembly issues
   no embed call.

## 10. Open questions (owner-taste only; recommendation pre-selected)

| # | Question | Recommendation |
| - | - | - |
| Q1 | Default `world_state` section posture in `DEFAULT_PROMPT_CONFIG` | **ON** (empty renders nothing — inert until the first reconcile; discovery beats a buried toggle) |
| Q2 | `reconcileBlockThreshold` default | **1 block** (= `blockSize` 8 messages — rides the digest cutoff; the singular lock coalesces bursts, so 1 is one summarize call per settled block, the freshest honest cadence) |
| Q3 | Global clip library's client home | ~~a Refinery-group pane~~ **OWNER-RE-RULED 2026-07-18: NOT Refinery** — the original rec fabricated an identity for an unrecorded section; the owner revealed Refinery's actual reserved purpose (ITERATIVE CHARACTER REWRITING — never recorded before this ruling; nothing else squats there). **OWNER-ANSWERED (2026-07-18, same exchange): Settings → Memory — a USER-group "Memory" pane** (the Personas precedent), with the chat State tab + character-editor section unchanged as the scoped surfaces. Q3 CLOSED |
| Q4 | `factsBudgetTokens` / `snapshotMaxTokens` defaults | **600 / 400** (≈ the memory bridge's typical footprint; both are knobs) |
