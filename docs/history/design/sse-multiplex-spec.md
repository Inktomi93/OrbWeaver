# SSE multiplex — ONE socket, typed room frames (SSE-1)

**Status:** **CLOSED — BUILT S0-S5, D118.**
**Scope:** the server transport stream layer (`packages/server/src/transport/trpc/**`), the client bus
layer (`packages/client/src/data/bus/**` + the two feature stream hooks), the CT SSE stub, the e2e SSE
instrument, and one new `initTRPC` option. Domain-side bus shapes are OUT of scope and unchanged.
**Evidence:** the 2026-08-01 starvation incident (`a2658fbc`, [[sse-per-origin-connection-budget]]) ·
code recon of all seven live subscriptions (inventory §2) · `@trpc/server@11.18.0` d.ts (`ping` /
`reconnectAfterInactivityMs` verified in `dist/unstable-core-do-not-import.d-BdVSvUCr.d.mts:1193-1237`,
`1352-1357`).
**Sibling spec (written aware of each other):** `docs/design/tracked-field-unification.md` (TRK lane),
`SET-SEAMS` (settings). No overlap in touched files; TRK adds rpg bus members, which this spec's fold
carries unchanged.

---

## 1. Motivation — say it honestly

**The connection cap is a DEV/E2E problem, not a prod problem.** Prod terminates on Caddy with h2 + h3,
where per-origin stream concurrency is a non-issue (multiplexed over one connection). Dev and e2e run
plain HTTP/1.1 on `:5173` / `:8788`, where a browser allows ~6 concurrent connections per origin and
every SSE subscription pins one for its lifetime. A "fix the cap" framing would therefore be dishonest —
h2 in dev would also "fix" it.

**The value is elsewhere, and it is real:**

1. **The starvation CLASS becomes unmakeable.** The 08-01 incident was not a config bug: `useRpgBus`
   legitimately opened a third always-on stream per room, and 3 sockets × 2 tabs hit exactly 6 → an
   unrelated `character.list` hung forever with zero errors. The fix (`a2658fbc`) was a *gate on that one
   hook* — i.e. a per-feature discipline that the NEXT always-on stream (automation chips, presence,
   tool-use, expressions) has to re-learn. At one socket per tab, adding a stream costs zero connections
   and the class stops existing. Discipline → physics, which is what this repo does with boundaries.
2. **One home for transport policy.** Today the same seven properties (attach-live-before-replay,
   withhold-not-throw membership, per-yield re-gate, monotonic-seq dedup, typed terminal frame,
   reconnect gap-heal, tracked-envelope uniformity) are hand-rolled in 5 routers and 5 client hooks,
   each with its own subtly different copy. `bus-channel.ts` already did this once for the emitter half
   (three identical EventEmitters → one mint). This is the same collapse for the *subscription* half.
3. **It collapses transport back to the shape D38 already has domain-side.** One closed event union +
   one bus, with routing as data — not N transports.
4. **Per-room failure isolation.** Today a `DomainError` thrown mid-stream ends the WHOLE stream
   (`withSubscriptionErrors` yields a terminal frame and returns). On a multiplex, one room's fault is a
   `roomFailed` control frame; the socket and every other room survive.

**The cost, stated up front:** one socket is one failure domain. A silently-dead socket becomes a total
freshness blackout instead of a partial one. §8 (heartbeat) is the mitigation and is not optional.

---

## 2. Current state — the seven subscriptions (recon, 2026-08-01)

| proc | key | gate | durable replay | cursor | client consumer |
| - | - | - | - | - | - |
| `chat.streamMessages` | `chatId` | member `chatEventBounds`, withhold-not-throw, re-run PER YIELD | yes (`replayChatEvents`) | `tracked(seq)` = durable per-chat seq | `data/bus/use-chat-bus.ts` |
| `sessions.streamUserEvents` | principal `userId` | implicit (principal) | no | none | `data/bus/use-user-bus.ts` |
| `rpg.stream` | `chatId` | chat membership via `chatEventBounds` probe, re-run PER YIELD | no | none | `data/bus/use-rpg-bus.ts` (gated on the game pointer) |
| `notifications.notifications` | principal `userId` | `multiHumanProcedure` belt | yes (`list` paging) | `tracked(seq)` | `features/notifications/hooks/use-inbox-stream.ts` |
| `automation.stream` | `chatId` | `resolveStreamAuthority` THROWS NOT_FOUND for a non-member; host-only events filtered per subscriber | no | per-stream ordinal | **none wired** |
| `workloads.subscribe` | `workloadId` | verb-internal owner gate | no | n/a | `features/workloads/hooks/use-workload-subscription.ts` (one per open workload row) |
| `chat.impersonateStream` | request | verb-internal | no | ordinal (explicitly NOT a cursor) | `features/chat/hooks/use-guided-actions.ts` (imperative `.subscribe`) |

Standing per-tab spend today: 2 sockets in a non-game chat, **3 in a game chat**, +1 per open workload
row, +1 transiently while impersonating. Two tabs on a game chat = at the cap.

Shared machinery that already exists and stays: `bus-channel.ts` (`defineBusChannel`, the typed
`firehose` opt-in), `subscriptions.ts` (`withSubscriptionErrors`), `presence-registry.ts`,
`chat-event-seq-guard.ts`.

---

## 3. The wire protocol — ONE channel, nested vocabularies

### 3.1 The transport surface

Three procedures, one new router `transport/trpc/routers/stream.ts`:

```ts
stream.connect   // authedProcedure.subscription — input { socketId }, the ONE EventSource
stream.attach    // authedProcedure.mutation     — input { socketId, ref, sinceSeq? }
stream.detach    // authedProcedure.mutation     — input { socketId, ref }
```

`attach`/`detach` ride the ordinary batched HTTP link (`httpBatchLink`) — they cost **zero** connections
and inherit the CSRF header + rate-limit + domain-error middleware every mutation gets. Delivery NEVER
rides a mutation return ([[chat-turn-surface-bus-driven]]): `attach` returns `void`; everything a
subscriber sees arrives as a frame on the socket.

### 3.2 Room refs and frames (home: `packages/contracts/src/stream/index.ts`)

Cross-boundary wire shape ⇒ `contracts` (constitution §0.2). It imports the existing per-bus unions; no
event vocabulary is re-spelled.

```ts
export type StreamRoomRef =
  | { readonly channel: "user" }
  | { readonly channel: "notifications" }
  | { readonly channel: "chat"; readonly chatId: ChatId }
  | { readonly channel: "rpg"; readonly chatId: ChatId }
  | { readonly channel: "automation"; readonly chatId: ChatId };

export type StreamChannel = StreamRoomRef["channel"];

/** The room-channel belt. NOT named `*_EVENT_TYPES` — it is not an event union, and that suffix would
 *  drag it into the `bus-definition-belts` gate's producer/consumer belt demand. */
export const STREAM_CHANNELS = ["user", "notifications", "chat", "rpg", "automation"] as const satisfies readonly StreamChannel[];

export type StreamFrame =
  | { readonly channel: "user"; readonly event: UserBusEvent }
  | { readonly channel: "notifications"; readonly seq: number; readonly event: InboxView }
  | { readonly channel: "chat"; readonly chatId: ChatId; readonly seq: number; readonly event: ChatBusEvent }
  | { readonly channel: "rpg"; readonly chatId: ChatId; readonly event: RpgBusEvent }
  | { readonly channel: "automation"; readonly chatId: ChatId; readonly event: AutomationBusEvent }
  | StreamControlFrame;

export type StreamControlFrame = { readonly channel: "control" } & (
  | { readonly type: "attached"; readonly ref: StreamRoomRef }
  | { readonly type: "detached"; readonly ref: StreamRoomRef }
  | { readonly type: "roomLagged"; readonly ref: StreamRoomRef; readonly cursor: number | null }
  | { readonly type: "roomFailed"; readonly ref: StreamRoomRef; readonly code: TrpcErrorCode; readonly message: string }
);

/** The ONE routing key — the server registry's map key AND the client handler-registry key. */
export function roomKey(ref: StreamRoomRef): string; // "user" | "notifications" | "chat:<id>" | "rpg:<id>" | "automation:<id>"
```

**How the three vocabularies nest without collision — the rule:** they do not flatten. The OUTER
discriminant is `channel`; each arm carries its bus event **verbatim under `event`**, retaining its own
`type`. `ChatBusEvent["type"]`, `UserBusEvent["type"]` and `RpgBusEvent["type"]` are never in the same
union, so a future collision (`rpg` minting a `chatOpened`) is impossible by construction — no rename
tax on any domain, and the client reducers keep their exact current input types
(`applyChatBusEvent(event: ChatBusEvent, …)` unchanged).

`control` is a FRAME channel, not a ROOM channel: `StreamChannel` derives from `StreamRoomRef`, so
`control` can never be attached, and a `Record<StreamChannel, …>` map (§4.2, §5.1) is total over rooms
only. A contract test pins `STREAM_CHANNELS` ↔ the data-frame arms ↔ `ROOM_SOURCES` (§12).

### 3.3 The tracked id is an ORDINAL, never a cursor

Every yield is `tracked(String(ordinal), frame)` — a per-socket monotonic counter — because
`withSubscriptionErrors` requires uniform tracked envelopes (a mix breaks the client's discriminant
narrowing, `subscriptions.ts`). It exists ONLY to satisfy the wire shape, exactly like
`trackedImpersonationDeltas` today.

**Consequences, stated so nobody re-derives them wrong:**

- **`Last-Event-ID` on `stream.connect` is IGNORED by the server.** One SSE stream has one resume id;
  this socket carries N independent cursors, which no single id can express. The resume truth is the
  per-room cursor held in the socket cell (§5.3).
- **Durable cursors travel INSIDE the frame** (`frame.seq` on `chat` and `notifications`), because
  `ChatBusEvent` does not carry its seq — today it rides the tracked id. The client's
  `chat-event-seq-guard.ts` is unchanged in logic; it reads `frame.seq` instead of `envelope.id`.
- A composite-cursor encoding (`c:<chatId>=<seq>;n=<seq>`) was considered and **rejected**: it grows
  with the room set, has no bound, and puts resume policy in a string parser instead of in the room
  source that owns the verdict.

---

## 4. Authorization — per-room scopes on one socket

### 4.1 The socket's own trust boundary

- `socketId` is CLIENT-MINTED (`crypto.randomUUID()` per tab) and is **not a capability**. The registry
  cell is keyed `${principal.userId}:${socketId}`; a guessed id belonging to another user resolves a
  DIFFERENT cell. An `attach`/`connect` whose `ctx.auth.userId` differs from the cell owner is a
  leak-free `NOT_FOUND` (the repo's standard cross-tenant collapse) — never a hijack, never a 403 that
  confirms existence.
- The socket is bound to ONE principal for its lifetime. On a viewer-identity change (logout/login in
  the same tab) the client mints a NEW `socketId` and drops the old one; the abandoned cell is reaped
  (§5.4). Server-side there is no re-binding path at all.
- `socketId` never appears in a frame and never keys anything a domain sees. It is transport state.

### 4.2 The per-channel attach gate (`ROOM_SOURCES`, home `transport/trpc/stream/room-sources.ts`)

```ts
interface RoomSourceDef {
  /** Runs INSIDE stream.attach. Throws (DomainNotFound → NOT_FOUND) to REFUSE; returns to accept. */
  readonly authorizeAttach: (args: RoomArgs) => Promise<void>;
  /** The per-subscription pump. Owns the per-yield verdict, the replay, and ALL per-viewer projection. */
  readonly run: (args: RoomArgs & { readonly cursor: number | null; readonly signal: AbortSignal }) => AsyncIterable<RoomYield>;
}
const ROOM_SOURCES = { user, notifications, chat, rpg, automation } satisfies Record<StreamChannel, RoomSourceDef>;
```

A new channel fails `tsc` at this Record — enforcement tier 2, not a gate (constitution §2.2: push it up
the ladder).

| channel | `authorizeAttach` | per-yield re-gate in `run` | source of the rule today |
| - | - | - | - |
| `user` | none (channel key IS `ctx.auth.userId`; no input can widen it) | none | `routers/sessions.ts:20-22` |
| `notifications` | the `multiHumanProcedure` capability belt, moved from the procedure onto the attach (the socket itself stays `authedProcedure` — a single-user deployment must still get its user/chat/rpg rooms) | none (self-scoped) | `routers/notifications.ts:4-7` |
| `chat` | **none — accept always** (draft-tolerant: a client may attach before `chat.start` commits) | `chatEventBounds` per yield → membership + `historyFloorSeq` + `viewerIsHost` + `reasoningHostOnly`, ONE verdict; `null` ⇒ withhold WITHOUT advancing the cursor | `routers/chat.ts:8-26, 635-677` |
| `rpg` | **none — accept always** (same withhold-not-throw posture; a game may be born while attached) | `isChatMember` probe per yield (a kicked member stops receiving) | `routers/rpg.ts:22-28, 146-161` |
| `automation` | `resolveStreamAuthority` — THROWS NOT_FOUND for a non-member (refuse at attach) | host-only events filtered per subscriber tier | `automation-bus.ts:9-12`, `routers/automation.ts:135-142` |

**Migration invariant (non-negotiable):** the fold changes NO authorization verdict and NO gate ordering.
Every predicate above is the SAME function, called at the SAME moment relative to the live attach
(listener first, gate second — `defineBusChannel.subscribe`'s buffering contract). "Refuse at attach" vs
"accept-and-withhold" is preserved PER CHANNEL, including the asymmetry between automation (refuse) and
chat/rpg (withhold) — that asymmetry is deliberate (a chat/rpg room is legitimately attachable before it
exists; an automation room is not).

### 4.3 How D106 threads

Unchanged, and structurally easier to keep right. `resolveHistoryFloorSeq` stays the ONE home; the
chokepoint stays `guard.ts::requireParticipant`; the three projections (SQL `seq >= floor`,
`isBelowHistoryFloor`, `spanWitnessed`) are untouched. The chat room source is the same code as
`chatEventStream` today — the multiplexer NEVER inspects or transforms `frame.event`. Written as a law:

> **The multiplexer is byte-blind.** `stream/` may queue, order, drop, and frame. It may not read, strip,
> clamp, or synthesize a domain event. Every per-viewer verdict lives in the room source, which is the
> same per-subscription scope it lives in today.

One emit is still ONE logged + fanned row with ONE verdict (D106) because the durable INSERT and the
live publish are untouched (`entry/compose/services.ts::emitChatEvent` → `publishChatEvent`).

---

## 5. Subscription lifecycle

### 5.1 The socket cell (home: `transport/trpc/stream/socket-registry.ts`)

Process-local, single-replica — the same ASSUMES(single-replica) stance as every existing bus and
`presence-registry.ts`.

```ts
interface SocketCell {
  readonly userId: UserId;
  readonly rooms: Map<string /* roomKey */, { ref: StreamRoomRef; cursor: number | null }>;
  readonly commands: AsyncQueue<{ kind: "attach" | "detach"; ref: StreamRoomRef; sinceSeq: number | null }>;
  live: boolean;
  lastSeenAt: number;
}
```

- **The cell is created by whichever arrives first** — `attach` or `connect`. Order-independence is
  deliberate: it kills the attach-before-connect race AND lets the e2e instrument attach then connect.
- `attach` = authorize (§4.2) → enqueue the command → return. `detach` = enqueue → return. Commands are
  processed IN ORDER by the live generator, so `attach` immediately followed by `detach` before the
  socket connects collapses to no room.
- **Replay and live delivery NEVER ride the mutation.** `attach` returns nothing; the room's replay is
  produced by the socket generator, which is the single ordering home. Otherwise a replay returned from
  a batched mutation could interleave ahead of live frames already queued.

### 5.2 The generator

`stream.connect` (one per socket) runs the merge loop:

1. adopt-or-create the cell for `(ctx.auth.userId, input.socketId)`; refuse (NOT_FOUND) if owned by
   another principal; mark `live`.
2. `ctx.presence.connect(ctx.auth.userId, signal)` — see §5.6.
3. re-hydrate: for every room already in `cell.rooms`, start its pump from the stored cursor (the
   reconnect path, §5.3).
4. drain `cell.commands` concurrently with every room pump, merging into ONE bounded frame queue (§7);
   yield `tracked(ordinal, frame)`.
5. on abort (client gone / server shutdown): abort every pump, `live = false`, stamp `lastSeenAt`,
   LEAVE the room set in place for the reap window.

Each pump is `ROOM_SOURCES[ref.channel].run({...})` wrapped so a throw becomes a `roomFailed` control
frame + room removal — never a socket teardown. `withSubscriptionErrors` remains wrapped around the
socket generator for a genuine socket-level fault.

### 5.3 Reconnect — server-sticky, client-invisible

The client does not re-attach on reconnect. tRPC's EventSource retries `stream.connect` with the same
`socketId`; the cell survives; the new generator re-runs step 3, which for each room means: **re-run the
attach gate, then resume from `cell.rooms[key].cursor`** — i.e. exactly the durable replay path
(`chat` → `replayChatEvents({afterSeq: cursor})`, `notifications` → `collectSince(cursor)`), and a
live-only room simply re-attaches its emitter.

The cursor is advanced by the socket generator ONLY on a frame that actually carried a durable seq —
the same "a withheld row does NOT advance the cursor" rule as today (`routers/chat.ts:635-644`), so a
clamped/scrubbed-to-null row leaves a `seq` gap and the reconnect replay re-applies the identical
verdict to it.

**What re-fires on reconnect (unchanged semantics):**

- `chatOpened` — per attach AND per reconnect, stamped with the NON-advancing cursor id (the synthetic
  rule). Under the multiplex the "id" is a frame ordinal, so the synthetic instead carries
  `seq: cursor ?? 0` in the frame; `chat-event-seq-guard.ts`'s EXEMPTION-BY-TYPE (`chatOpened` /
  `historyTruncated` always admitted) is what actually makes it work and is unchanged.
- `historyTruncated` — same predicate (`resumeSeq < minSeq - 1`) off the same `chatEventBounds` probe.
- Live-only rooms (`user`, `rpg`, `automation`) — the client's blanket gap-heal, fired from the SOCKET's
  `pending` transition and fanned to every attached room's `onSocketLive` (§6). Today each hook watches
  its own connection state; the fan-out preserves the behavior exactly.

### 5.4 Reaping, caps, refusals

| rule | value | why |
| - | - | - |
| cell reap after `!live` | 60s | > the EventSource retry window; a real tab close frees the rooms |
| rooms per socket | 32 | a client bug cannot grow the map unboundedly; refuse with `RESOURCE_EXHAUSTED` |
| sockets per user | 8 | ~one per tab + slack; refuse the 9th (oldest-`!live` cell is reaped first) |
| duplicate attach of a live room | idempotent | re-attach with a LOWER `sinceSeq` is honored (it is a replay request); a higher one never rewinds the cursor forward |

### 5.5 Per-subscription member-strip — the leak-prone path

This is the section to get right ([[reasoning-cut-durable-replay-leak]] — the member strip has three
paths and the REPLAY is the one that leaks).

**The rule: scrub state is PER PUMP, and a pump belongs to exactly one (socket, room, principal).**
Concretely, carried over unchanged from `chatEventStream`:

- `deltaScrubbers: Map<slotSeq, HiddenSpanStreamScrubber>` is allocated INSIDE the chat pump, never in
  the socket, never in the registry. Two rooms on one socket have two independent maps; two tabs have
  four. A host subscriber still allocates none.
- The durable replay stays inside the domain: `service.replayChatEvents` → `scrubChatEventReplayForMember`
  + `scrubStreamReplayForMember` (`domain/chat/verbs/read.ts:863-876`). The transport never re-derives
  `role === "host"`; it threads `viewerReadsHidden` / `reasoningHostOnly` as DATA (D106-F1).
- The live half keeps `resolveLiveYield` verbatim: per-yield `memberBounds` → `isBelowHistoryFloor` →
  host verbatim / member `scrubDeltaEventForMember` | `stripChatEventForMember`.
- **New invariant to test explicitly:** a socket attached to two chats where ONE has deception active
  must not apply that room's `reasoningHostOnly` verdict to the other room. Today this is guaranteed by
  "one subscription = one chat"; under the multiplex it is guaranteed by pump-scoped state, which is
  weaker-looking and therefore gets a dedicated test (§12).
- **The cursor rule doubles as a leak fence:** because a withheld row does not advance the cursor, a
  reconnect's replay re-derives the verdict for that row from the CURRENT membership — a member promoted
  to host between connections gets the host verdict, a demoted host gets the member verdict. Same as
  today; do not "optimize" by caching verdicts in the cell.

### 5.6 Presence

`presence.connect(userId, signal)` moves from the notifications subscription
(`routers/notifications.ts:70-71`) to the socket generator. Same ref-count, same 15s grace, strictly more
accurate: liveness stops being coupled to the multi-human capability belt (today a deployment where
`multiHumanProcedure` refuses the notifications router registers no presence at all). The
offline→online host-return drain (`drainDeferredTurns`) rides the same edge, moved with it.

**Flagged as owner-visible behavior change** — see §14.

---

## 6. The client surface

Homes (all under `packages/client/src/data/bus/`, the existing bus dir):

| file | role |
| - | - |
| `socket-id.ts` | the per-tab `socketId` (module const); rotates on viewer-identity change |
| `use-orb-socket.ts` | the ONE `useSubscription(trpc.stream.connect…)`; mounted ONCE at `routes/app-root.tsx` beside today's `useUserBus` |
| `room-registry.ts` | `roomKey → { ref, handlers, gapHealers }`; ref-counted attach/detach via the imperative tRPC client |
| `use-bus-room.ts` | `useBusRoom(ref | null, { onEvent, onSocketLive })` — the ONE room hook |

**The feature-facing hook surface does not change.** `useChatBus(chatId, deps)`, `useUserBus(deps)`,
`useRpgBus(chatId, deps)` and `useInboxStream()` keep their exact signatures and their existing
comments-worth of semantics; only their BODIES swap `useSubscription(...)` for `useBusRoom(...)`. No
feature file is touched by the fold.

Behavioral mapping:

- `skipToken` (draft chat / non-game chat) → `useBusRoom(null, …)` — no attach, no socket cost. The
  `useRpgBus` game-pointer gate stays (it now saves an attach RTT instead of a connection; keeping it
  costs nothing and keeps the hook honest).
- The `lastEventId: "0"` draft→committed seed becomes `sinceSeq: 0` on the attach. Same replay, better
  name.
- `chat-event-seq-guard.ts` survives verbatim except reading `frame.seq`. It is still load-bearing: a
  re-attach with `sinceSeq: 0` still re-replays from zero and a re-replayed `turnStarted` would still
  strand the composer's Stop.
- `onConnectionStateChange → pending` moves to the socket and fans out to every attached room's
  `onSocketLive`, preserving each hook's gap-heal (`invalidateAllUserRoots`, `gapHealRpg`).
- `roomFailed` → the room's `onError` (today's `__subscriptionError` route: `notify.error`), and the
  room detaches. `roomLagged` → the room's gap-heal + (chat/notifications) a re-attach at the last
  known cursor.

---

## 7. Backpressure

ONE bounded queue per socket (default **512** frames), fed by every pump. Overflow policy is per channel,
derived from that channel's EXISTING healing story — never a silent drop:

| channel | policy on overflow | why it is safe |
| - | - | - |
| `chat` | drop the room's live tail, emit `roomLagged{cursor}`, keep the room attached | durable + resumable: the client re-attaches at `cursor` and the durable replay fills the gap with the identical verdict |
| `notifications` | same | same (durable inbox + `collectSince`) |
| `user` | COLLAPSE — keep at most one pending frame per `event.type` | every member is a coarse invalidation trigger; N identical `chatsChanged` invalidate exactly like 1 |
| `rpg` | COLLAPSE per `event.type` | same (`RPG_BUS_FILTERS` are path invalidations) |
| `automation` | COLLAPSE per `event.type` | ephemeral chips by design (no durable row, 03 §1.4) |

Collapse is legal ONLY for a channel whose client handler is a pure invalidation trigger. That property
is not enforceable by tsc, so it is a documented row in the policy Record
(`Record<StreamChannel, OverflowPolicy>`, total by construction) plus a unit test per policy. A future
channel that carries CONTENT must pick `lag`, not `collapse`.

The per-pump upstream (`on(emitter, ch, {signal})`) still buffers unbounded, exactly as today — this
spec bounds the socket-side queue, which is where a slow consumer actually accumulates.

---

## 8. Heartbeat (required, not optional)

At the ONE `initTRPC.create` (`transport/trpc/trpc.ts:19`):

```ts
initTRPC.context<Context>().create({
  errorFormatter: …,
  sse: {
    ping: { enabled: true, intervalMs: 15_000 },
    client: { reconnectAfterInactivityMs: 45_000 },
  },
});
```

Both keys verified against `@trpc/server@11.18.0` (`SSEPingOptions` / `SSEClientOptions`, and the root
config's `sse` = `Pick<SSEStreamProducerOptions, 'ping' | 'emitAndEndImmediately' | 'maxDurationMs' | 'client'>`).
The repo sets NO `sse` config today → ping is off by default (`enabled: false`) and the client has no
inactivity reconnect. With one socket carrying everything, a dead-but-open socket is a total blackout;
the ping keeps intermediaries (Caddy, dev proxies) from idling the stream, and
`reconnectAfterInactivityMs` makes the client detect a silently-dead one at 3× the ping interval.

This lands in **stage 0** — it is a strict improvement for the existing per-proc streams too.

---

## 9. What explicitly does NOT change

- **The domain-side D38 bus shape.** `@orb/contracts/events` stays the closed in-process domain-event
  union; `EmitDomainEvent` stays injected; emitters still never touch a bus directly; wiring stays at
  `entry/compose/event-bus.ts`. Nothing in this spec is visible below `transport/`.
- **The per-bus event unions and their belts.** `ChatBusEvent`/`UserBusEvent`/`RpgBusEvent`/
  `AutomationBusEvent` + `CHAT_BUS_EVENT_TYPES`/`USER_BUS_EVENT_TYPES`/`RPG_BUS_EVENT_TYPES` are
  untouched. The frames NEST them.
- **`bus-channel.ts` and the emitter half.** `publishChatEvent`/`publishUserEvent`/`publishRpgEvent`/
  `publishAutomationEvent`, durable-first ordering, and the firehose opt-in (`subscribeAllChatEvents`,
  the buddy observer) are unchanged. The buddy observer does NOT ride the multiplex — it is a server-side
  long-lived supervisor, not a browser socket.
- **D106 and D110 §3.6 verdicts, homes, and projections.**
- **The client invalidation seam** (`data/invalidation.ts`) and all three total maps.
- **`chat.impersonateStream`** stays a standalone subscription (§14, decision 2).
- **The domain replay verbs** (`replayChatEvents`, `chatEventBounds`, notifications `list`).

---

## 10. Homes — the file map

**New (server):**

- `packages/contracts/src/stream/index.ts` — refs, frames, `STREAM_CHANNELS`, `roomKey`, the zod input
  schemas for the three procs.
- `packages/server/src/transport/trpc/routers/stream.ts` — connect/attach/detach.
- `packages/server/src/transport/trpc/stream/socket-registry.ts` — cells, caps, reaper.
- `packages/server/src/transport/trpc/stream/frame-queue.ts` — the bounded merge queue + overflow
  policies.
- `packages/server/src/transport/trpc/stream/room-sources.ts` — the `ROOM_SOURCES` Record.
- `packages/server/src/transport/trpc/stream/sources/{user,notifications,chat,rpg,automation}.ts` — the
  MOVED generator bodies (not rewrites).

**Deleted (server), each in the same commit as its client swap — no dual transport, no "for now":**
`routers/sessions.ts::streamUserEvents` · `routers/rpg.ts::stream` · `routers/chat.ts::streamMessages`
(+ `chatEventStream`/`resolveLiveYield`/`attachSynthesesAndReplay`/`memberBounds`, which MOVE to
`sources/chat.ts`) · `routers/notifications.ts::notifications` · `routers/automation.ts::stream`.

**New (client):** `data/bus/{socket-id,use-orb-socket,room-registry,use-bus-room}.ts`.
**Rewritten bodies (client), signatures intact:** `use-chat-bus.ts`, `use-user-bus.ts`, `use-rpg-bus.ts`,
`features/notifications/hooks/use-inbox-stream.ts`.

**Tests (mirror homes, per constitution §0.2):** `tests/server/transport/trpc/stream/*.test.ts`,
`tests/client/data/bus/*.test.ts`, `tests/support/ct/route-orb-socket.ts`, `tests/e2e/support/sse.ts`
(reshaped in place).

---

## 11. Migration map — order and what folds when

| stage | folds | why this order |
| - | - | - |
| **0** | nothing — `sse` ping/inactivity config (§8) + `contracts/stream` + `roomKey` + the CT/e2e instrument groundwork | zero behavior change, lands the vocabulary |
| **1** | `user` + `rpg` | live-only, no cursor, no replay, no strip — the whole lifecycle (cell, commands, reconnect, gap-heal fan-out) is proven on the two cheapest rooms; `rpg` is the room that caused the measured incident |
| **2** | `chat` | the hard one: replay, synthetics, per-yield clamp, mid-stream scrubbers. Bodies MOVE; the security tests move with them |
| **3** | `notifications` (+ presence move) | durable replay #2 + the `multiHumanProcedure` belt relocation to the attach gate + the presence/drain edge |
| **4** | `automation` | no client consumer today — it folds as a pure server-side move, and whoever wires the chips later gets the multiplex for free |
| **5** | `workloads` (see §14 decision 3) | requires homing the workload event union in `contracts` first — a real prerequisite, not a rename |

After stage 2 the standing per-tab spend is **1 socket**, game chat or not, N tabs or not.

**Gate rows that move:**

- `bus-definition-belts` — unchanged in behavior (belts stay in contracts, client total maps stay in
  `data/invalidation.ts`). Its header comment cites `features/rpg/hooks/use-rpg-stream.ts` as the rpg
  map's home; that file does not exist (the map is in `data/invalidation.ts:151`) — fix the comment
  while in the area, do not change the logic.
- `bus-coverage` / `user-bus-coverage` / `rpg-bus-coverage` — unchanged. `EMIT_SCOPE` is
  `packages/server/src/(domain|transport)/`, and no emit site moves.
- **New gate `single-stream-transport`** (whole-project, ts-morph): NO `.subscription(` outside
  `routers/stream.ts`, with a cited EXEMPT list (`chat.impersonateStream`). This is the ratchet that
  keeps the fold from silently un-folding — the property tsc cannot see. Per [[new-gate-four-coupled-sites]]
  it is 4 sites: the gate module, the Enforcement-Active-Gates row, the gate count, and `writeFixtures`
  (`mustFlag`: a probe router with a bare `.subscription(`; `mustPass`: the exempt one).
- **Cross-tenant sweep** ([[new-router-needs-sweep-classification]]): `stream.attach` and `stream.detach`
  classified **PROBED** (a stranger attaching a foreign `chatId` / a foreign `socketId`); `stream.connect`
  PROBED (a foreign `socketId`).

---

## 12. Test plan

**Node unit (`tests/server/transport/trpc/stream/`):**

- `socket-registry` — cell created by attach-before-connect AND connect-before-attach; attach→detach
  before connect collapses to no room; cross-principal `socketId` = NOT_FOUND (not a hijack, not a 403);
  room cap / socket cap refusals; reap after the window; a reconnect adopts the same cell with cursors.
- `frame-queue` — each overflow policy: `lag` emits `roomLagged` with the last durable cursor and keeps
  the room; `collapse` keeps exactly one pending frame per `(roomKey, type)`; ordering within a room is
  FIFO; a full queue never blocks an unrelated room's control frames.
- `room-sources` totality — a `.test-d` pinning `Record<StreamChannel, RoomSourceDef>` and the frame
  union ↔ `STREAM_CHANNELS` correspondence (a new channel must fail compile in both directions).
- per-room fault isolation — a throwing pump yields `roomFailed` and the socket keeps delivering other
  rooms (the property that does not exist today).

**Int/db (`tests/server/transport/…`):** port every existing stream case from
`tests/server/transport/trpc/routers/chat.int.test.ts` onto the chat room source — replay-after-cursor,
withhold-does-not-advance-cursor, `historyTruncated` predicate, `chatOpened` per attach, kicked-member
stops mid-stream, `from-join` clamp on both halves. These should be near-mechanical: the body moved.

**Security (the reason this spec exists at all):**

- **Two-room scrub isolation** — one principal, one socket, two attached chats, ONE with deception
  active: assert the reasoning channel is stripped in that room and INTACT in the other, live AND on a
  reconnect replay. (New property; today it is guaranteed by one-subscription-per-chat.)
- Extend `tests/e2e/live-member-strip.local.spec.ts` + `live-reasoning-strip.local.spec.ts` onto the
  multiplex instrument — they drive the REAL path, which is the whole point of keeping them.
- Cross-tenant sweep rows (§11).

**CT (`tests/support/ct/route-orb-socket.ts` — the harness reshape):**

The current `routeChatStream` fulfills a COMPLETE `text/event-stream` body on the first subscribe. Under
the multiplex the client attaches AFTER the socket is live, and a frame for an unattached room is
dropped by the registry (correct — the real server never sends one). So the stub gets a deterministic
handshake instead of a sleep:

- one Playwright route handler for `**/api/trpc/**`; `stream.attach` / `stream.detach` mutations are
  recorded and answered `null`; the `Accept: text/event-stream` request AWAITS the expected attaches,
  then fulfills with the full framed body (route handlers are async — the SSE request simply hangs until
  then, which is what a stream does).
- frames are authored as `{ channel, …, event }` — the existing scripted `ChatBusEvent[]` become
  `chat` frames with an explicit `seq`, preserving the synthetic-cursor cases
  (`chatOpened`/`historyTruncated` carry the non-advancing cursor).
- the script is replayable on EVERY connect, not first-only ([[ct-sse-stub-replayable-every-connect]] —
  today's stub serves an empty stream on reconnect, which is a latent flake).
- the recorder exposes `attaches()` / `detaches()` / `connects()`, so a CT can assert lifecycle directly:
  attach on chat open, detach on chat switch, exactly ONE connect per page.

Every existing chat CT keeps asserting the same reducer/store effects through the new stub.

**E2E:**

- `multi-tab-room-sync.spec.ts` + `event-sequence.spec.ts` re-pinned onto the multiplex instrument
  (`tests/e2e/support/sse.ts` → `collectSocketFrames`: POST `stream.attach` with the CSRF header, then
  GET `stream.connect?input={socketId}`, filter by `roomKey`).
- **The starvation regression pin:** an `/api/_debug` counter of live sockets per user
  ([[observability-harness-verify-landings]]) — assert 1 per tab, 2 across two tabs, and that opening a
  GAME chat adds ZERO. This is the assertion that makes the class unmakeable rather than merely fixed.
- Honest limit to write into the test's comment: 6 TABS still hits the cap. One socket per tab is the
  floor, not immunity.

---

## 13. Build sequence

1. **S0 — vocabulary + heartbeat.** `contracts/stream` (+ contract test), `sse` config, gate skeleton
   (`single-stream-transport` registered but scoped to the not-yet-existing router so it is vacuous).
   Commit. Nothing else moves.
2. **S1 — the machinery + the two cheap rooms.** `socket-registry`, `frame-queue`, `room-sources`,
   `sources/{user,rpg}`, `routers/stream.ts`; client `socket-id`/`use-orb-socket`/`room-registry`/
   `use-bus-room`; `useUserBus`/`useRpgBus` bodies swapped; `sessions.streamUserEvents` +`rpg.stream`
   DELETED in the same commit. Unit + `.test-d` + cross-tenant rows. Verify live: two tabs on a game
   chat, socket count 2 total.
3. **S2 — chat.** Move `chatEventStream` & friends into `sources/chat.ts` intact; swap `useChatBus`;
   delete `chat.streamMessages`; move the int tests; reshape the CT stub + the e2e instrument in the
   same commit (they are the only readers of the deleted proc). **This commit gets a `stickler` pass**
   ([[proposed-done-needs-opus-stickler]]) — it moves the member-strip path.
4. **S3 — notifications + presence.** Belt relocation, presence move, `drainDeferredTurns` edge.
5. **S4 — automation.** Server-only move.
6. **S5 — workloads.** Contracts homing first, then the fold; `use-workload-subscription` keeps its
   signature.
7. **Close-out:** the `single-stream-transport` gate goes live with its exempt list; ledger entry
   (next free D-number, per the D110+ rule) recording the ONE-socket transport law + the byte-blind
   multiplexer rule + the per-channel overflow policy; workboard SSE-1 closed.

Each stage is independently shippable and independently revertible; no stage leaves two transports for
the same room.

---

## 14. Owner decisions — flagged, with recommendations

> **RULED (owner, 2026-08-01) — ALL RESOLVED; the spec is build-ready as written:**
> **1. SSE** (not wsLink) — stages 1–5 stand. **2.** `chat.impersonateStream` stays unfolded, gate-exempt.
> **3.** `workloads.subscribe` FOLDS at stage 5, with its event union homed in `contracts` first.
> **4. Presence moves onto the socket** — the behavior change is taken. VOCABULARY RIDER: the owner's
> people-group vocabulary is ROSTER — spec/code copy says **roster gating**, never "cast-gating", in every
> surface this build touches. **5.** No dev-only escape hatch — delete on fold. **6.** Hygiene numbers
> ratified as stated (512 · 15s · 45s · 60s · 32 · 8).
>
> **PLUS (AU-8 #1, recorded here per the audit):** `automation.stream` is a **DOORWAY** — sanctioned-dormant,
> wired through the multiplex at stage 4; the future automation-chips UI consumes it there. Not a WIRE item,
> not deleted.

1. **SSE multiplex vs `wsLink` (WebSocket).** tRPC's `wsLink` multiplexes natively and would make most of
   §5 disappear. **Recommendation: SSE.** It keeps the fetch-adapter/Hono mount, cookie auth, the CSRF
   posture, and the Caddy h2/h3 story exactly as they are; a WS upgrade adds a second auth seam, a second
   deployment concern, and re-opens questions D106/D110 §3.6 currently answer inside one request scope.
   The lifecycle machinery this spec adds is ~3 small modules — cheaper than a transport change.
   *This is the one genuine architecture fork; if the owner prefers WS, stages 1-5 re-plan.*
2. **`chat.impersonateStream` stays unfolded.** It is request-scoped, user-gesture-initiated, at most one
   at a time, and its abort semantics ARE the socket teardown. Folding it would mean modelling "detach =
   cancel generation". **Recommendation: leave it, exempt it in the gate, revisit only if it ever becomes
   concurrent.**
3. **`workloads.subscribe` folds (stage 5) but needs a contracts home for its event union** — today the
   client hook hand-rolls a narrow local view because "no client-importable event type" exists.
   **Recommendation: fold it** (N concurrent rows = N sockets is the same class we are killing), and home
   the union properly as part of it.
4. **Presence moves onto the socket (§5.6)** — a behavior change: liveness stops depending on the
   multi-human belt, so a single-user deployment starts registering presence where it previously did not.
   **Recommendation: take the change** (it is more accurate, and cast-gating reads presence). Flagged
   because it touches chat's cast-gating input, which is owner-sacred territory.
5. **No dev-only escape hatch.** Keeping the per-proc streams alive "for the e2e instruments" is exactly
   the half-migration the constitution bans. **Recommendation: delete on fold; the instruments move in
   the same commit.**
6. **Numbers to ratify or ignore:** queue 512 frames · ping 15s · inactivity reconnect 45s · cell reap
   60s · 32 rooms/socket · 8 sockets/user. All are hygiene bounds, none is load-bearing; they are stated
   so the build has no improvisation surface ([[spec-completeness-no-improvisation]]).
