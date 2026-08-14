---
kind: spec
status: draft
updated: 2026-08-14
---

# Entity→room member-freshness bridge — design + build plan

> Charge (owner-asked 2026-08-14, `docs/retro-workboard.md:313-323` + the paired R1-4a residual
> `:333-334`): host/member ENTITY edits do not reach OTHER users' live-room projections. This doc is the
> design of record for the bridge, the durable-append-free live fan that closes R1-4a, the quiet-mode
> interaction, and the gate lane that makes a future entity kind unable to ship without declaring its
> room reach. Design only — the build lanes cut from §10.

## 0. Verdict in one screen

- **The bridge already half-exists.** `character.updated` (domain event) → `chatUpdated` on every chat
  seating that character is BUILT and always-on (`entry/compose/emit-character-updated.ts:15-23`, wired
  `entry/compose/search-discovery.ts:162-170`). The owner's symptom is still real for characters because
  the client's `chatUpdated` row does not cover `chat.getMemberCard`
  (`packages/client/src/data/invalidation.ts:174-199` — the row's full set; `getMemberCard` rides only
  the editor-local `charactersChanged` row, `:216`). Personas and world-info CONTENT edits have no room
  fan at all (`domain/persona/verbs/update.ts:53`, `domain/world-info/verbs/entries/update.ts:4-5,90` —
  user-bus only, editor's devices only).
- **The fix shape:** extend the existing domain-event→room bridge into ONE reach engine at the
  composition root — new `DomainEvent` members `persona.updated` / `world-info.updated`, a declarative
  reach table (entity kind → seated-rooms resolver), and a NEW narrow chat-bus member
  `roomEntityChanged { chatId, entity }` fanned LIVE-ONLY (no `chat_events` append). Members re-read
  through the D16-clamped verbs (`getMemberCard`, `getChat`), so byte-gating holds by construction —
  the clamp suite is not touched (§3.1).
- **The live-only lane is the same bus-surface change R1-4a needs** (`chat-lifecycle.ts:262-270`:
  closing the reap false-emit "needs a durable-append-free live fan for `chatDeleted`"). One envelope
  change (`ChatLiveEvent` gains a null-seq arm), one pump rule (the existing synthetic non-advancement
  rule), one client exemption set (the existing `SYNTHESIZED_EXEMPT` mechanism). §4.
- **Reusing `chatUpdated` for the fan is structurally broken and measured-expensive** — a live-only
  `chatUpdated` is dropped by the client seq guard unless `chatUpdated` is exempted wholesale
  (§3.3), and its invalidate row refetches the whole room (canon + list + 6 chat-scoped reads,
  `invalidation.ts:174-199`) on every autosave flush of a seated card. The narrow member is the design.
- **Presets stay OUT** (owner word): members never fetch presets — the server assembles per turn. A
  visible "host changed the model" notice is a separate product choice; when wanted it is ONE
  `roomEntityChanged`-class emit at the preset write, nothing more. Non-goal here.

## 1. Tree inventory (what the design composes with — every claim read this session)

| Piece | Home | Fact the design leans on |
| - | - | - |
| user bus | `packages/contracts/src/user-bus/index.ts` · `transport/trpc/user-events-bus.ts` | per-USER, live-only, editor's devices; the id is a TARGETING HINT the contract lets emitters omit (`user-bus/index.ts:63-65`); quiet-mode terminal fans are id-less COARSE events published straight on the channel (`user-events-bus.ts:101-109`) |
| chat bus | `domain/chat/bus.ts` · `transport/trpc/chat-events-bus.ts` | durable-FIRST: every `emit` awaits the `chat_events` INSERT (`bus.ts:90-110`); the compose funnel fans only what was logged (`entry/compose/services.ts:414-424`); the live channel carries `{seq, event}` (`chat-events-bus.ts:21-31`) |
| room pump | `transport/trpc/stream/sources/chat.ts` | live loop DROPS any entry with `seq <= maxSeq` (`:106-109`); per-yield member gate → D16 floor → §3.6 projection as ONE verdict (`:111-121`); `chatOpened` synthesized on EVERY attach with a NON-advancing seq (`:51-59`, `:189-197`) |
| client seq guard | `client/src/data/bus/chat-event-seq-guard.ts` | drops any durable frame not advancing the per-chat mark (`:61-74`); non-durable types are exempt BY TYPE (`SYNTHESIZED_EXEMPT`, `:34`) |
| invalidation seam | `client/src/data/invalidation.ts` | the ONE map; `chatUpdated` row = canon reads + list + `getChat` + 5 chat-scoped reads (`:174-199`); `getMemberCard` only under `charactersChanged` (`:216`); `invalidateQueries` is a no-op for a read with no cache entry (`:197`) and CANCELS+RESTARTS an in-flight fetch (`:66`) |
| domain-event bus | `contracts/src/events/index.ts` · `entry/compose/event-bus.ts` | 2 members (`character.updated {contentChanged}`, `asset.created`); in-process, fire-and-forget, error-isolated; G-B belted with the SERVER_INTERNAL reach lane (`events/index.ts:19-26`) |
| the built character fan | `entry/compose/emit-character-updated.ts` | seated-rooms lookup = `chat_participants` where `characterId=X AND kind='character' AND leftSeq IS NULL`; fans a DURABLE `chatUpdated` per room (one `chat_events` row per seated room per edit) |
| member-visible projections | `domain/chat/verbs/read.ts:712-775` (getMemberCard, D22 clamp) · `domain/chat/service.ts:81-118` (roster identity) · `entry/compose/chat.ts:886-906` (`resolveUserPublics`: a human seat's displayName+avatar = their ACTIVE PERSONA's `name`/`avatarAssetId`) | the reads the bridge must refresh; every one is clamped server-side at the verb |
| clamp pass-through | `substrate/auth/clamp.ts:97-119` · `substrate/member-visibility.ts:196-204` | both are STRUCTURAL: an id-only member (no `view`, no `slotSeq`) rides through the floor anchorless and is not view-stripped — a new id-only member inherits the clamp suite with ZERO new clamp code |
| quiet mode (W8) | `transport/trpc/user-events-bus.ts:21-110` | per-`(userId, type)`, AsyncLocalStorage-scoped to the bulk run; first emit passes, rest silenced, coarse terminal from `finally`; opened only at `entry/compose/portability-runner.ts:186,217,228` |
| R1-4a residual | `domain/chat/verbs/chat-lifecycle.ts:259-270` | `chatDeleted` must emit BEFORE the row delete (a post-delete append FK-fails and `bus.ts` FLAG[emit-is-total] refuses to fan an unlogged event) — so a raced reap fans a `chatDeleted` for a room that survived |
| indexes for reach lookups | `db/schema/chat.ts:529` (`chat_participants_character_idx`, comment cites the bridge) · `:534` (`chat_participants_active_persona_idx`) · `:189` (`chats_anchor_persona_idx`) · `schema/world-info.ts:133-145` (`chat_books` PK leads chatId; `worldBookId` FK indexed per `fk-columns-indexed`) | every resolver in §3.5 is one indexed SELECT |
| G-A / G-B | `scripts/check/gates/domain-freshness-plane.ts` (26-row registry, `FreshnessRow` `:42`) · `bus-definition-belts.ts` (`SERVER_INTERNAL_REACH` `:64`) | the declared-rows grammar the room-reach lane extends (§7) |

Not touched: the derived-data cluster (`Knowledge-Cluster.md`) — no entity in scope is a vector/derived
table; `corpusRecomputed` and the indexer subscriber are unaffected.

## 2. The staleness matrix (defect, per entity kind)

| Entity edit | Member-visible projection that goes stale | Current driver | Gap |
| - | - | - | - |
| character card edit (host is the card owner — the seat's card loads under `hostUserId`, `read.ts:742-744`) | `chat.getMemberCard` (D22-clamped card dialog); `getChat.participants` (seat name/avatar); `previewContextFit` (member-gated fit budget, `transport/trpc/routers/chat.ts:361-362`) | user-bus `charactersChanged` (editor only) + the built room fan's `chatUpdated` | the room fan repaints `getChat` but NOT `getMemberCard` (`invalidation.ts:174-199` vs `:216`) — the owner's exact symptom; and each edit costs one durable `chat_events` row + a full-room refetch per seated room |
| persona CONTENT edit (name/avatar/description) | `getChat.participants` displayName+avatar for every co-member (`entry/compose/chat.ts:893-906`); assembly + fit (persona description feeds the prompt) | user-bus `personasChanged` only (`persona/verbs/update.ts:53`) — editor's devices | NO room fan at all; co-members' roster identity stale until reload. Persona SWITCHING fans (`personaSwitched`, `chat/verbs/roster.ts:538`); content edits do not |
| world-info book/entry CONTENT edit | next-turn assembly; `previewContextFit`; host-only `previewAssembly` (stale for a non-editor host after handoff-adjacent flows) | user-bus `worldInfoChanged` only; scope-affecting entry edits already fan `wiEntryScopeChanged` per attached chat (`entries/update.ts:74-88`) — content-only edits deliberately emit nothing to rooms (`:4-5`) | NO room fan for content |

Room-scoped writes are already covered (`setRoomOverrides`/group/injections/roster/turn lifecycle →
`chatUpdated` + roster events; `chat/verbs/roster.ts:120,211-240`) — out of scope.

## 3. The bridge

### 3.1 Two audience planes, one write, zero new clamps

The two buses are AUDIENCE PLANES with different authorization physics: per-user SSE may carry
owner-private payloads; the per-chat room is member-visible-clamped end to end (D16/D22, the §3.6
producer stamp). The bridge adds NO payload to either plane — `roomEntityChanged` carries
`{chatId, entity}` only, and members re-READ through the already-clamped verbs. Receipts that the clamp
suite stays byte-untouched: `isBelowHistoryFloor` passes anchorless members structurally
(`clamp.ts:106-119`), `stripChatEventForMember` passes non-view members (`member-visibility.ts:196-204`),
and the per-yield membership gate runs unchanged on every yield (`sources/chat.ts:111-121`) — a kicked
member never hears entity churn.

### 3.2 The funnel: the domain-event bus, not a user-bus hook, not per-verb sprinkles

**Chosen: extend the domain-event plane** (`DomainEvent` + one reach engine at compose). The write path
per entity domain is the pair the character domain already ships: `emitUserEvent(owner, …)` (editor's
devices) + `ctx.emit({type:"<domain>.updated", …})` (the bridge input) — `character/verbs/update.ts:72,85`
is the live precedent, so this is not a new per-verb emit pattern, it is the existing one made total.

Rejected with receipts:

- **Hooking `publishUserEvent` (deriving room reach from `UserBusEvent`):** (a) the user-bus id is a
  HINT the contract lets emitters omit (`user-bus/index.ts:63-65`) — a reach lookup needs the id, so the
  bridge would silently lose rooms exactly when an emitter exercises its contract; (b) quiet-mode
  terminal fans publish COARSE id-less events straight on the channel, bypassing `publishUserEvent`
  (`user-events-bus.ts:101-109`) — a bulk run's reach would vanish; (c) the reach resolvers are SQL over
  roster/junction tables and belong at the composition root like the existing fan, not in transport.
- **Deriving the user-bus emit from the domain event too ("a write emits ONE event" taken literally):**
  the `user-bus-coverage` ratchet quantifies emit literals in `server/src/{domain,transport}` and
  deliberately EXCLUDES `entry/compose` (`docs/design/event-bus-coverage-survey.md` §1.2: a member whose
  only emit is compose-side would false-MISSING) — moving 87 verb-side `emitUserEvent` calls behind the
  bridge would blind the gate for zero behavioral change. The frame's "{editor's devices} always" is
  satisfied verb-side, as today; the reach table owns ONLY the room plane.
- **A third transport / a notifications-style store:** nothing here is durable or per-user; the room
  channel already exists and is clamped.

### 3.3 The event: new narrow member, not `chatUpdated`

New `ChatBusEvent` member (in `contracts/src/chat/bus.ts`):

```ts
export const ROOM_ENTITY_KINDS = ["character", "persona", "world-info"] as const;
export type RoomEntityKind = (typeof ROOM_ENTITY_KINDS)[number];
// … union member:
| { type: "roomEntityChanged"; chatId: ChatId; entity: RoomEntityKind }
```

Id-free by design (the user-bus hint precedent: the client map path-invalidates regardless; an id would
add a leak surface and buy no narrower filter — the existing `charactersChanged` row already
path-invalidates `getMemberCard`, `invalidation.ts:216`). Allowlist-clean: a closed literal of a branded
id + an enum (`bus.ts:196-202`).

Why not reuse `chatUpdated`:

1. **Undeliverable as live-only.** A live-only event must carry a NON-advancing seq (§3.4), and the
   client seq guard drops any non-exempt frame whose seq does not advance the chat's mark
   (`chat-event-seq-guard.ts:61-74`). Exemption is BY TYPE (`:34`); exempting `chatUpdated` wholesale
   would un-dedup real durable `chatUpdated` re-replays (the stuck-Stop class the guard exists for).
   A fresh never-durable type joins the exempt set safely, like `chatOpened`.
2. **Measured over-invalidation.** The `chatUpdated` row refetches canon reads + the chat list +
   `getChat` + 5 chat-scoped reads (`invalidation.ts:174-199`), and `invalidateQueries` cancels+restarts
   in-flight fetches (`:66`). A card-editor autosave would storm every open member device with
   full-room refetches — the exact class W8 was built to contain.
3. Migrating the existing character fan OFF `chatUpdated` (§3.8) also stops paying one durable
   `chat_events` row per seated room per card edit.

### 3.4 The live-only lane (durable-append-free chat-bus fan) — shared with R1-4a

The chat room's envelope grows a null-seq arm; nothing else about the transport changes:

- **Envelope** (`transport/trpc/chat-events-bus.ts`): `ChatLiveEvent` becomes
  `{ seq: number; event } | { seq: null; event }`. `publishChatEvent` unchanged.
- **Emit surface** (`entry/compose/services.ts`, beside `emitChatEvent`): `emitChatEventLive(event)` →
  `publishChatEvent({ seq: null, event })`. No `chat_events` INSERT, no ring entry, no member stamp
  needed (the lane is restricted by TYPE to id-only members — see the belts below).
- **Pump** (`stream/sources/chat.ts` live loop): a `seq: null` entry SKIPS the `entry.seq <= maxSeq`
  dedup, runs the SAME `resolveLiveYield` verdict (membership gate + clamp), and yields with
  `seq: maxSeq` — the current cursor, exactly the synthetic non-advancement rule (`:51-59`), so the
  socket cell's resume cursor (`stream/socket.ts:116-118` — advances at delivery from the frame's seq)
  never moves past an undelivered durable row.
- **Client** (`chat-event-seq-guard.ts:34`): `roomEntityChanged` (and `chatDeleted`, §4) join the
  exempt-by-type set; rename it `NON_DURABLE_EXEMPT`. Belt: the set stays keyed
  `ChatBusEvent["type"]` so a rename fails tsc.
- **Type belts (the lane's physics):** contracts export
  `LIVE_ONLY_CHAT_EVENT_TYPES = ["roomEntityChanged", "chatDeleted"] as const` +
  `DurableChatBusEvent = Exclude<ChatBusEvent, { type: LiveOnlyChatEventType }>`. `chatBus.emit` /
  `emitChatEvent` narrow to `DurableChatBusEvent` (a live-only member cannot be durably appended —
  compile error), and the db CHECK derives from the durable subset
  (`db/schema/chat.ts:635,653` — `chat_events_type_check` keys change ⇒ **`0000_baseline.sql` SQUASH
  in the same commit**, the pre-launch DB law; no gate catches this).
- **Loss/heal semantics (stated, not accidental):** a live-only event missed while a device is dark is
  NEVER replayed. The heal is the attach synthesis: `chatOpened` re-fires on EVERY (re)attach — reopen,
  reconnect, shed-restart (`sources/chat.ts:189-197`; `use-chat-bus.ts:44-56`) — and its invalidate row
  is widened to cover the bridge's member-card read (§3.7). Fit/preview staleness after a missed fan is
  accepted: the next canon terminal refetches them via the durable replay (`chatCanonReads`,
  `invalidation.ts:69-76`), so the bound is one turn, and widening `chatOpened` with fit reads would
  re-pay a BOOT-4X-class fetch on every room open.

### 3.5 The reach engine + the declarative table

One engine at the composition root (grown from `emit-character-updated.ts`; the workload-contributions
posture — domains declare, one engine dispatches, the engine knows no domain):

```ts
// entry/compose/room-reach.ts (new)
type RoomReachResolver = (db: Db, event: <the entity's DomainEvent member>) => Promise<ChatId[]>;
const ROOM_REACH = { character: …, persona: …, "world-info": … } as const
  satisfies Record<RoomEntityKind, RoomReachResolver>;   // tsc: a new kind cannot ship unresolved
```

Subscribed on the domain-event bus beside the existing two subscribers
(`search-discovery.ts:150-170`), always-on (open-room freshness is orthogonal to `corpusAutoindex` —
the built fan's own ruling, `:162-163`). Per event: resolve rooms (one indexed SELECT), then
`emitChatEventLive({ type: "roomEntityChanged", chatId, entity })` per room.

Resolvers ("rooms whose member-visible projection reads this entity"), all present-seat scoped:

| Kind | SQL (one indexed lookup each) | Index receipt |
| - | - | - |
| character | `chat_participants` where `characterId = X AND kind='character' AND leftSeq IS NULL` (the built fan's query, verbatim) | `chat.ts:525-529` |
| persona | `chat_participants` where `activePersonaId = X AND leftSeq IS NULL` UNION `chats` where `anchorPersonaId = X` (the anchor renders `{{user}}` even when its owner is offline — `roster-humans.ts:28-31`) | `chat.ts:534` · `:189` |
| world-info | `chat_books` where `worldBookId = X` (the scope-fan's own `listChatIdsForBook`, `world-info/persistence/queries.ts:184-187`) ∪ the character-book and persona-book junctions joined through present seats — mirror the assembly pool's gather set (`chat/assembly/world-info/pool.ts`), which is the definition of "this room reads this book" | `world-info.ts:133-145` + the junction FK indexes |

**"Live" means: has a present seat; delivery-cost is gated by subscription physics, not a presence
query.** Publishing to a room with no attached SSE subscriber is a no-listener `EventEmitter.emit`
(`bus-channel.ts:49-56`) — free. The presence registry is userId-keyed, not room-keyed
(`presence-registry.ts:1-9`), so filtering reach by it would add a seam to save nothing. Per-edit cost:
one indexed SELECT + K in-process publishes + (per SUBSCRIBED member device) one per-yield gate probe
and a handful of query invalidates — and zero durable rows (the current character fan pays one
`chat_events` INSERT per seated room per edit; the bridge deletes that cost).

### 3.6 New domain events + emit sites

`DomainEvent` grows two members (`contracts/src/events/index.ts` — ids REQUIRED, unlike the user-bus
hints; the reach lookup depends on them):

- `{ type: "persona.updated"; personaId: PersonaId }` — emitted by persona `update` / `remove` /
  `import`-restore (every content-affecting write; `set-active` stays chat-side — switching already
  fans `personaSwitched`).
- `{ type: "world-info.updated"; bookId: WorldBookId }` — emitted by book `update`/`remove` and entry
  `create`/`update`/`remove`/`reorder`/`upsert-entries` (beside their existing `worldInfoChanged`
  emits; the scope-affecting subset ALSO keeps its `wiEntryScopeChanged` fan — different consumers:
  scope changes move the ATTACHMENT view, content changes move the assembly).

`PersonaContext`/`WorldInfoContext` gain the injected `emit: EmitDomainEvent` (the character precedent —
domains never import the bus, `events/index.ts:7-10`). Coupled sites per new member (G-B's belts make
all of them compile-forced or gate-forced): `DOMAIN_EVENT_TYPES` tuple + its `satisfies`
(`events/index.ts:26`) · the `assertNever` indexer subscriber (`search-discovery.ts:150-159` — new
members are explicit no-op cases there) · `domain-events-coverage` spec · the reach engine's
`ROOM_REACH` Record · `DOMAIN_TRIGGER_TYPES` only if automation wants triggers (subset, optional).

### 3.7 Client rows (the one-invalidate-funnel half)

`BUS_FILTERS.roomEntityChanged` dispatches on `event.entity` (Record over `RoomEntityKind`, exhaustive):

| entity | filters | why |
| - | - | - |
| character | `chat.getMemberCard.pathFilter()` · `chat.getChat.queryFilter({chatId})` · `chat.previewContextFit.pathFilter()` · `promptPreviewReads` | card dialog (free when closed, `invalidation.ts:197`) + seat identity + member fit; previews for a non-editor host |
| persona | `chat.getChat.queryFilter({chatId})` · `previewContextFit` · `promptPreviewReads` | roster identity (persona name/avatar = the seat's publics, `compose/chat.ts:893-906`) + assembly-derived reads |
| world-info | `previewContextFit` · `promptPreviewReads` | assembly-derived reads only — `worldInfo.*` reads are owner-scoped (no member ever holds a cache entry; the owner's devices ride `worldInfoChanged`) |

Also: `applyChatBusEvent` gains the arm (invalidate-only, like `chatUpdated` — `apply-chat-bus-event.ts`
ends in `assertNever`, so this is compile-forced) · `CHAT_BUS_EVENT_TYPES` row (compile-forced) ·
`chatOpened`'s row (`invalidation.ts:163`) widens with `getMemberCard.pathFilter()` as the
reconnect/reopen heal for missed live-only fans (§3.4; free when the dialog is closed). The editor's own
open-room device receives both the user-bus event and the room event — overlapping path-invalidates are
idempotent and `collapseFilters` dedupes within each pass; accepted.

### 3.8 Migrate the character fan onto the bridge (same wave)

`emit-character-updated.ts`'s fan becomes the `character` row of `ROOM_REACH` and its emitted event
becomes `roomEntityChanged{entity:"character"}` (live-only). Wins: the member-card dialog finally
repaints (the owner's symptom), per-edit durable-log pollution stops, and the per-edit member refetch
narrows from the full `chatUpdated` set to three reads. Loss: a member dark through a card edit no
longer gets it from the durable replay — healed by the widened `chatOpened` row on their next attach
(§3.4). Delete the old fan in the same commit (no half-migration).

## 4. R1-4a: `chatDeleted` moves to the live-only lane

Defect (`chat-lifecycle.ts:259-270`): `reapHusk` must emit before its guarded DELETE (a post-delete
append FK-fails; an unlogged event is never fanned), so a claim landing between emit and DELETE leaves a
fanned `chatDeleted` for a surviving room. The durable `chatDeleted` row is also pointless BY
CONSTRUCTION — the row delete cascades `chat_events` away (`db/schema/chat.ts:641-644`), so no
`chatDeleted` is ever replayable.

Close: `chatDeleted` joins `LIVE_ONLY_CHAT_EVENT_TYPES`. Both delete paths (lifecycle delete +
`reapHusk`) run the DELETE FIRST — the predicate rides the DELETE's own WHERE, `RETURNING` decides —
then `emitChatEventLive({type:"chatDeleted", chatId})` only when rows returned. The false-emit window
is gone, not narrowed.

**The one gate divergence this needs (owner fork F-A, §11):** after the DELETE commits, the pump's
per-yield `memberBounds` probe returns `null` (chat gone) and `resolveLiveYield` would withhold the
event from everyone (`sources/chat.ts:145-147`). `chatDeleted` therefore bypasses the member-gate in the
pump: an id-only room-DEATH signal, delivered to every ATTACHED subscriber (attach was membership-gated;
today's pre-delete emit already reaches the same set by racing the delete). Leak analysis: the only
widened audience is a kicked-but-still-attached member, who learns "the room died after my kick" — one
bit, no bytes, and symmetric with what their next `getChat` NOT_FOUND already tells them. Client: the
seq-guard exemption is safe because no durable `chatDeleted` can ever re-replay (cascade); the
`onChatDeleted` landing action (`apply-chat-bus-event.ts:99-105`) is idempotent.

## 5. Quiet mode: bulk windows silence the room fan too (coarse terminal per room)

Answering the charge's (3): yes — silence and coalesce, mirroring W8 exactly. Without it, a profile
re-import touching N seated entities fans N×rooms `roomEntityChanged`, and each tick
cancels+restarts in-flight member refetches (`invalidation.ts:66`) — the same storm W8 contained on the
user plane (`user-events-bus.ts:23-29`).

Mechanics: `QuietScope` (currently user-pair-keyed, `user-events-bus.ts:52-59`) generalizes into one
transport module (`transport/trpc/quiet-fanout.ts`) carrying a second map keyed `(chatId, entity)`.
`emitChatEventLive` (only the `roomEntityChanged` member — never `chatDeleted`) consults it: first fan
per pair passes (start marker), later fans silenced, one coarse terminal per silenced pair from the
`finally`. AsyncLocalStorage propagation holds: the domain-event dispatch runs inside the emitting
request's async context (`event-bus.ts:34-38` — `emit` is called synchronously by the verb;
`void dispatch(…)` captures the ambient context), so a bulk run under `withQuietUserEvents` covers the
bridge with no new plumbing at the call sites (`portability-runner.ts:186,217,228` unchanged). The
export keeps its name unless the owner wants the rename (fork F-G).

## 6. Cost summary

Per single entity edit: 1 indexed SELECT (reach) + K in-process publishes (free at K rooms with no
subscribers) + per subscribed device: 1 `chatEventBounds` probe (the pump already pays this per yield)
+ ≤4 path-invalidates of mostly-unmounted reads. Zero durable writes (strictly cheaper than the shipped
character fan, which pays K `chat_events` INSERTs today). Per bulk run: 1+1 events per (room, kind)
regardless of N (§5). No polling, no presence queries, no new sockets.

## 7. Gate extension — a future entity kind cannot ship without declaring room reach

Prose-only boundaries are wishes (constitution §2.3); the lane is enforced at three tiers, each named:

1. **tsc — the registry field.** `FreshnessRow` (`domain-freshness-plane.ts:42`) gains a REQUIRED
   `roomReach: { lane: "none"; why: string } | { lane: "bridge"; entity: RoomEntityKind }`. Every one of
   the 26 existing rows must declare on the day the field lands (compile-forced); `character`/`persona`/
   `world-info` declare `bridge`, everything else `none` with the cite + end condition (the gate's
   existing `none` grammar, `:36-42`).
2. **tsc — dispatch totality.** `ROOM_REACH satisfies Record<RoomEntityKind, RoomReachResolver>`
   (§3.5) + the client row's Record over `RoomEntityKind` (§3.7): declaring a new kind fails the build
   until its resolver AND its invalidation filters exist. G-B's ARM C already forces the belt + coverage
   spec for any new `DomainEvent` member (`bus-definition-belts.ts:64-78`).
3. **Gate arm — SEATED-red (the honesty ratchet, new arm on `domain-freshness-plane`).** Derive
   "seatable": a mutating domain whose tables are referenced by an FK column on a CHAT-ANCHORED table
   (`chat_participants`, or any junction carrying a `chats.id` FK — derivable from
   `packages/db/src/schema/*.ts` the way `own-tables-only` reads schema files). A seatable domain whose
   row says `roomReach: none` is RED — the exact self-cleaning grammar of the existing MISSING/STALE/
   ORPHAN arms (`domain-freshness-plane.ts:12-16`). This is what makes the NEXT seated entity kind
   (databank racks, regex display scripts, an agent-seat satellite) unable to ship silent: seating it
   requires the junction, the junction trips SEATED-red, clearing SEATED-red requires the `bridge` lane,
   and the `bridge` lane requires the resolver + client rows via tier 2.

Gate work follows `scripts/check/GATE-AUTHORING.md` (two-sided receipts; the six-case probe shape where
markers apply; conformance rows retargeted when any exemption row moves).

## 8. Non-goals + candidate rows deliberately not in this wave

- **Presets** (owner word): members never fetch them; a "host changed the model" room notice is ONE
  future `roomEntityChanged`-class emit at the preset write + one client toast row — a product choice,
  not freshness infrastructure. Recorded as the `preset` registry row's `roomReach: none` end condition.
- **Databank document rename:** the per-chat rack is member-visible and rides `chatUpdated` for
  membership/visibility (`invalidation.ts:188-198`), but an owner's RENAME emits only `databankChanged`
  (editor-only) — same defect class. Candidate `bridge` row (`entity: "databank"` + the D85 scope
  junctions as reach); deferred to keep this wave at the owner-named three. SEATED-red (§7.3) will hold
  the row honest.
- **Regex display scripts:** chat-scoped display-tier scripts can change member-rendered transcript
  bytes (`chat/substrate/regex-tier.ts`); whether script CONTENT edits need a room fan needs its own
  read of the display path. Candidate row; the registry's `regex` row documents the open question in its
  `roomReach: none` why-string until ruled.
- **Agents/observers:** dormant DDL only (`Spine-Identity-and-Auth.md` §4); the kind-shape CHECK arms
  are unreachable. The reach grammar accommodates them the day they land (a seat is a
  `chat_participants` row — the character resolver's shape).

## 9. Constraints that bind the build (restated as instructed)

- **The D16 clamp suite stays byte-untouched.** No edits under `substrate/auth/` or
  `member-visibility.ts`; the bridge's member is id-only and inherits the clamp structurally (§3.1).
  The ONE authorization-adjacent change is the `chatDeleted` pump bypass (§4), which is an owner fork,
  not a clamp edit.
- **Imports flow one direction.** Domains emit injected ops only (`EmitDomainEvent`, `EmitUserEvent`);
  the reach engine, resolvers, and fan live at `entry/compose`; transport keeps zero domain imports
  beyond what `stream/sources/chat.ts` already declares. No domain ever imports chat to fan —
  `membership-fan-guard` additionally bans `emitUserEvent` inside `domain/chat/**`.
- **KISS/YAGNI are SUSPENDED for architecture.** The maximal provable version is the deliverable: the
  declarative table, the compile-forced dispatch, the gate lane, and the quiet coalescer ship together —
  not a minimal `if (character)` patch.
- Green-to-commit; the baseline squash rides the same commit as the union change; scoped lane
  verification per §L, with `types:graph` named in every floor (value-changing union edits).

## 10. Build plan (staged; LANE 1 is the first executor cut)

**LANE 1 — the lane + the bridge (one worktree lane, one commit):**

1. Contracts: `ROOM_ENTITY_KINDS`, the `roomEntityChanged` member, `LIVE_ONLY_CHAT_EVENT_TYPES`,
   `DurableChatBusEvent`; `CHAT_BUS_EVENT_TYPES` row; allowlist contract-test fixtures.
2. DB: CHECK derives from the durable subset; **squash into `0000_baseline.sql`** (regen via
   drizzle-kit + biome-format the meta).
3. Transport: `ChatLiveEvent` null-seq arm; pump skip-dedup + non-advancing yield; `emitChatEventLive`
   in `services.ts`; `DurableChatBusEvent` narrowing on `chatBus.emit`/`emitChatEvent`.
4. Domain events: `persona.updated` / `world-info.updated` members + belts + context `emit` injection +
   verb emit sites (§3.6).
5. Compose: `room-reach.ts` (table + 3 resolvers + subscriber); DELETE `emit-character-updated.ts` and
   its wiring in the same commit.
6. Client: `NON_DURABLE_EXEMPT` (renamed set) + `BUS_FILTERS.roomEntityChanged` + reducer arm +
   widened `chatOpened` row.
7. Tests (the floor names them): `tests/server/entry/compose/room-reach.int.test.ts` (per-kind reach:
   seated/left/anchor/junction rows; the old `emit-character-updated.int.test.ts` retargets — a
   previously-deleted-path recreation is a coupled site, check the test-baseline deletions ledger);
   `tests/server/transport/trpc/stream/sources/chat.int.test.ts` gains live-only arms (delivered to
   member, withheld from kicked, cursor NOT advanced, dedup NOT tripped); seq-guard unit arms;
   `tests/client` invalidation-map rows; the G-B coverage specs for the two new domain-event members.

**LANE 2 — R1-4a + quiet + the gate lane (after F-A is ruled):**

8. `chatDeleted` → live-only; both delete paths reorder to DELETE-first; pump bypass per F-A; the
   reapHusk header's residual note is truth-repaired in the same commit.
9. `quiet-fanout.ts` generalization + room-pair coalescing + int test (N-item bulk ⇒ 1+1 per pair;
   thrown-mid-run still terminal-fans — the W8 `finally` rule).
10. Gate: `FreshnessRow.roomReach` + the 26-row declaration sweep + the SEATED-red arm + two-sided
    probes; workboard rows (bridge + R1-4a) closed with receipts.

## 11. Owner forks (each with recommendation)

| # | Fork | Options | Recommendation |
| - | - | - | - |
| F-A | `chatDeleted` pump delivery after the row is gone (§4) | (a) pump bypasses the member gate for `chatDeleted` (id-only death signal, attached-subscriber audience) · (b) keep pre-delete emit ordering and accept the residual false-emit forever | **(a)** — the widened audience is one bit to a kicked-but-attached member; (b) leaves R1-4a open permanently, which the board says to close |
| F-B | Does a bulk quiet window silence the room fan (§5) | (a) yes, coarse terminal per (room, kind) · (b) no, per-item room fans | **(a)** — the W8 storm math applies identically; under-announcing is impossible (the terminal is derived from what was silenced) |
| F-C | Event grain (§3.3) | (a) one `roomEntityChanged` with an `entity` enum · (b) three members (`seatedCharacterChanged`…) | **(a)** — one seq-guard exemption, one reducer arm, one filter row dispatching a Record over the SAME union the reach table and gate lane key on; (b) triples the coupled sites for zero narrower targeting (filters are path-level either way) |
| F-D | Migrate the built character fan in LANE 1 (§3.8) | (a) same wave · (b) leave the durable `chatUpdated` fan beside the bridge | **(a)** — (b) double-fans every card edit and keeps the durable-row cost; leaving the old structure beside the new is the banned half-migration |
| F-E | Databank rename + regex display scripts (§8) | (a) rows in this wave · (b) candidate rows, SEATED-red keeps them honest | **(b)** — owner named three kinds; both candidates need their own read receipts; the gate lane is precisely what stops them rotting silently |
| F-F | Preset "host changed the model" notice (§8) | (a) never · (b) one emit when the product wants it | **(b) recorded as the row's end condition** — no build now |
| F-G | Rename `withQuietUserEvents` when it learns room pairs (§5) | (a) rename (`withQuietBulkFanout`) · (b) keep | **(a)** — 3 prod call sites + tests; a name that claims user-only while silencing two planes is a lying comment in function form |

## 12. Verification log (what this design's receipts cover)

Read IN FULL this session: `contracts/src/user-bus/index.ts` · `contracts/src/chat/bus.ts` ·
`contracts/src/events/index.ts` · `contracts/src/stream/index.ts` · `transport/trpc/user-events-bus.ts`
· `transport/trpc/chat-events-bus.ts` · `transport/trpc/bus-channel.ts` ·
`transport/trpc/presence-registry.ts` · `transport/trpc/stream/sources/chat.ts` · `domain/chat/bus.ts` ·
`entry/compose/event-bus.ts` · `entry/compose/emit-character-updated.ts` ·
`entry/compose/emit-chat-changed.ts` · `client/data/invalidation.ts` · `client/data/bus/use-chat-bus.ts`
· `client/data/bus/use-user-bus.ts` · `client/data/bus/apply-chat-bus-event.ts` ·
`client/data/bus/chat-event-seq-guard.ts` · `scripts/check/gates/domain-freshness-plane.ts` ·
`scripts/check/gates/membership-fan-guard.ts` · `substrate/chat-detail.ts` · `substrate/participant-name.ts` ·
`world-info/verbs/entries/update.ts` · `Knowledge-Cluster.md` · `Spine-Identity-and-Auth.md` ·
`Documentation-Law.md`. Read in relevant part (offsets cited inline): `entry/compose/services.ts` ·
`entry/compose/search-discovery.ts` · `entry/compose/chat.ts` (`resolveUserPublics`) ·
`entry/compose/portability-runner.ts` · `domain/chat/service.ts` (`loadParticipantViews`) ·
`domain/chat/verbs/read.ts` (`getMemberCard`) · `domain/chat/verbs/chat-lifecycle.ts` (R1-4a) ·
`substrate/auth/clamp.ts` · `substrate/member-visibility.ts` · `db/schema/chat.ts` ·
`db/schema/world-info.ts` · `transport/trpc/stream/socket.ts` (cursor advance) ·
`docs/design/event-bus-coverage-survey.md` (§0-1, §4-5) · the D-ledger rows D16/D18/D22/D60 +
`Core-0` §6-§8 sweeps (no existing ruling homes this seam; the workboard row is the mandate). NOT read:
`chat/assembly/world-info/pool.ts` beyond its path (the WI resolver's gather-set mirror is a build-lane
verification item, §3.5), `frame-queue.ts`/`room-registry.ts` internals, the automation watcher beyond
its subscriber shape.
