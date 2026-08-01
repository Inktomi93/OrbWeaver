# Stickler review — SSE-1 S2: the chat room fold (`wt/agent-ae7a23e7ea4435982` @ `b4904ab4`, work commit `c52555b6`)

**Reviewed:** `git diff main...HEAD` of the S2 worktree (`.claude/worktrees/agent-ae7a23e7ea4435982`), every
touched file read in full, plus the S1 machinery the fold newly activates (`stream/socket.ts`,
`stream/frame-queue.ts`, `stream/socket-registry.ts`, client `room-registry.ts`/`use-orb-socket.ts` —
landed at `f2185df1`, unchanged by this diff, but chat is the FIRST durable-cursor `lag` room to ride them).
**Law applied:** spec `docs/history/design/sse-multiplex-spec.md` §3.3/§4.2/§4.3/§5.3/§5.5/§6/§7/§12/§13; D106;
D110 §3.6; Tier-4-Transport Esoteric #5; the mandated §13.3 stickler pass (this document).

**VERDICT: MERGE-WITH-FIXES** — the security machinery moved intact (byte-identity verified mechanically;
member-strip/D16-clamp/reasoning-cut all proven on the real ladder, plus the new two-room isolation
property), but the chat room's overflow/reconnect healing story is broken in three compounding places
(F1, silent member-visible event loss + a permanent stuck-Stop class — NOT a leak), and one e2e spec the
spec §12 ordered re-pinned still asserts the deleted procedure (F2, deterministic e2e red).

---

## Findings

### F1 (HIGH) — chat `roomLagged`/reconnect healing is unimplemented + the room cursor counts ENQUEUED frames, so shed/undelivered chat events are silently and PERMANENTLY lost

Three defects, one compound failure. Chat is the first channel where any of this is reachable —
`advanceCursor` was dead code before this fold (`user`/`rpg` frames carry no `seq`;
`notifications`/`chat` were `refusedUntilFolded`), so S2 activates the class even though (a) and (c)
live in S1-landed files.

**(a) `packages/server/src/transport/trpc/stream/socket.ts:76-79` — the cursor advances at ENQUEUE
time, before `queue.push` may shed the frame.** `pumpRoom` calls `advanceCursor(key, frame)` and THEN
`queue.push(ref, frame)`. Under the `lag` policy (`frame-queue.ts::pushLagging`), a push at capacity
sheds the room's entire pending tail AND drops the pushed frame itself — all frames whose seqs already
advanced `cell.rooms.get(key).cursor`. The `roomLagged` control frame then carries
`cursorFor(key)` = that advanced cursor. This directly contradicts:
- `socket-registry.ts:49-50` — "`cursor` is the last DURABLE seq **delivered**";
- `frame-queue.ts:82-84` — "`cursorFor` reads the room's last **delivered** DURABLE seq";
- spec §7's legality argument for `lag` — "the client re-attaches at `cursor` and the durable replay
  **refills the gap** with the identical verdict" (it cannot: the gap is *behind* the cursor);
- spec §5.3/§5.5 — the withheld-row rule's whole point is that an undelivered row stays ahead of the
  cursor so the replay re-offers it.

**Reproduced this session** (scratch script `reports/stickler/scratch/lag-cursor-repro.ts`, driving the
REAL `createFrameQueue` with the verbatim `advanceCursor` ordering, capacity 4, pump yields seqs 1–8
with no drain):

```
delivered: roomLagged(cursor=5), 6, 7, 8
cell cursor: 8
=> rows never delivered AND behind the cursor (lost to replay): 1, 2, 3, 4, 5
```

Even the `roomLagged` notice's own cursor (5) is past five never-delivered rows.

The same enqueue-optimism loses **in-flight frames on ordinary disconnects**: frames drained/yielded
into the SSE writer (or still queued) when the socket dies have already advanced the cell cursor; the
reconnect pump resumes PAST them. Pre-fold this could not happen — the resume cursor was the tRPC
client's own `Last-Event-ID`, i.e. the last seq the client actually received, so a reconnect replay
covered exactly what was lost.

**(b) `packages/client/src/data/bus/use-chat-bus.ts` (this diff) — chat has NO lag heal at all.**
`useChatBus` deliberately passes no `onSocketLive` (header: "NO onSocketLive GAP-HEAL, DELIBERATELY —
this room's heal is SERVER-side"; the server heal = `chatOpened` per pump-(re)start). But a
`roomLagged` does NOT restart the pump (the room stays attached, `socket.ts` keeps pumping live) and
does not reconnect the socket — so for chat, `roomRegistry.lagged(ref)` (which only fans
`onSocketLive`, `room-registry.ts:204-209`) is a **no-op**. Spec §6 mandates: "`roomLagged` → the
room's gap-heal + (chat/notifications) a re-attach at the last known cursor" — neither is implemented
for chat. The comment at `use-orb-socket.ts:43-44` ("for a durable room the heal refetches, and the
server's cursor still points at the last delivered row") is false on BOTH halves for chat: nothing
refetches, and the cursor points past dropped rows (see (a)).

**(c) `packages/server/src/transport/trpc/stream/socket-registry.ts:152-157` — even the spec'd
re-attach at `roomLagged.cursor` would be a server no-op.** Idempotent re-attach honors only a
STRICTLY LOWER `sinceSeq`; `roomLagged.cursor` equals the cell cursor at shed time, so a client
re-attaching at it changes nothing (no pump restart, no replay). A working heal must re-attach at the
CLIENT's own high-water mark (the seq-guard already tracks it) or the server must roll the cursor back
to the last *delivered* seq when it sheds.

**Concrete failure scenarios (inputs/state → wrong outcome):**
1. A member's tab is backgrounded/stalled while a turn streams (every token delta is one durable-seq
   frame — `chat.int.test.ts` shows deltas taking seqs 1,2,3…; 512 queued frames ≈ one long turn).
   The queue overflows → the tail (deltas, `messageCommitted`, `turnCompleted`…) is shed →
   `roomLagged` arrives → **nothing happens** (b). The transcript is silently stale on a LIVE socket
   until the user reopens the chat or the socket happens to reconnect; `staleTime` is Infinity, so no
   other freshness path exists.
2. The shed (or an in-flight-at-disconnect frame) includes a turn terminal (`turnCompleted` /
   `turnAborted`). The chat-stream store slot stays open forever: `applyChatBusEvent` clears slots only
   on terminals (`apply-chat-bus-event.ts:52-60`), `chatOpened` only invalidates queries (line 95-98),
   and the reconnect replay SKIPS the terminal because the cursor already passed it (a). This is the
   exact stranded-slot / stuck-"Stop generating" P1 the seq-guard documents ("the slot is stranded live
   and the composer's Stop button sticks forever") — pre-fold it self-healed on reconnect via
   `Last-Event-ID`; post-fold it cannot heal at all.

**Not a security finding:** frames are dropped, never mis-projected — the member-strip verdict is
untouched. This is availability/correctness of delivery, which is why the verdict is
MERGE-WITH-FIXES rather than BLOCK.

**Safe remediation direction (for the orchestrator, not implemented):** advance the room cursor at
DELIVERY (in `runSocket`'s drain loop, per frame yielded) rather than in `pumpRoom` before the push —
or roll the cursor back to the last-delivered seq when `pushLagging` sheds; and give chat a real lag
heal (either client-side: `onSocketLive` → invalidate + re-attach at the seq-guard's high-water mark,
or server-side: a shed restarts the pump from the last delivered cursor, which re-runs
`attachSynthesesAndReplay` and re-fires the `chatOpened` invalidate). A regression test: drive
`runSocket` with a full queue, shed a chat tail containing a terminal, reconnect, and assert the
terminal is re-delivered (today it is not).

**Regression-test gap that let this land:** `frame-queue.test.ts` stubs `cursorFor` (e.g. `() => 17`),
so it pins "roomLagged carries whatever cursorFor returns" — the composed property "that cursor is the
last DELIVERED seq" is asserted nowhere.

### F2 (MEDIUM) — `tests/e2e/event-sequence.spec.ts:59-77` still asserts the DELETED `chat.streamMessages` on the wire → deterministic e2e failure

`expect(getLabels.some((l) => l.includes("chat.streamMessages"))).toBe(true)` (line 77). The proc is
deleted; the client's chat room rides `stream.connect` (GET) + `stream.attach` (POST), so no request
label can ever contain `chat.streamMessages` — the assertion fails on every run. The spec is untagged
(no `@live`/`@smoke`), so it runs in the default `pnpm e2e` battery (`playwright.config.ts` grepInvert
only drops `@live`). Spec §12 explicitly ordered "`multi-tab-room-sync.spec.ts` + `event-sequence.spec.ts`
re-pinned onto the multiplex instrument", and §13-S2 required every reader of the deleted proc reshaped
in the same commit; multi-tab-room-sync was re-pinned, event-sequence was not (its header comment at
lines 8-9 is also stale). Evidence: the repo-wide `streamMessages` sweep (grep -a, live-code hits only
in this spec); `pnpm check`/`pnpm test` do not run e2e, so the branch's own battery could not catch it.
Fix: re-pin the first test's assertion to the multiplex wire (`stream.connect` subscribe +
`stream.attach` POST), same shape the spec's other instruments now use.

---

## Verified clean (what my silence covers)

**Byte-identity of the moved bodies (the builder's central claim) — VERIFIED mechanically.**
`git show main:packages/server/src/transport/trpc/routers/chat.ts` (== `e7a62b7b`, confirmed by diff)
vs `stream/sources/chat.ts`, paren-aware whole-body extraction, comment lines stripped:
- `resolveLiveYield`, `scrubberFor`, `retireScrubberOnCommit`: identical except the sanctioned type
  alias `ReturnType<typeof createHiddenSpanStreamScrubber>` → `HiddenSpanStreamScrubber` (same type).
- `memberBounds`: byte-identical.
- `attachSynthesesAndReplay`: identical logic; only the envelope reshape
  (`tracked(cursorId, event)` → `{channel:"chat", chatId, seq: cursorSeq, event}`) — synthetics carry
  `cursor ?? 0` as frame seq, exactly reproducing the pre-fold wire (`String(resumeSeq ?? 0)` tracked id).
- `chatEventStream` → `run`: identical loop; deltas: cursor comes from the cell instead of
  `parseResumeSeq(lastEventId)` (now zod-validated `int().min(0).nullish()` — strictly tighter),
  `signal` non-optional, `maxSeq` from `frame.seq` instead of `Number(env[0])` (same value), yield is
  the frame instead of `tracked(String(seq), …)`. `parseResumeSeq` correctly deleted.

**Builder hot-spot 1 — `deltaScrubbers` allocation:** confirmed INSIDE `run` (`sources/chat.ts:89`),
per-pump; a re-attach/reconnect makes fresh pumps (fresh maps) — verdicts never cached in the cell.
The new §5.5 two-room isolation tests (`stream/sources/chat.test.ts:451-585`) drive one principal, one
socket, two chats, one deception-active, through the REAL ladder (`createCaller` → attach → connect →
`runSocket` → the real pump, real `scrubDeltaEventForMember`/`stripChatEventForMember`; only the two
service reads are `vi.fn`) — reasoning cut applies to the deception room only, held `<lie` tails don't
bleed across rooms, and a reconnect re-derives per-room verdicts. Asserts the real projection output,
not the stub.

**Hot-spot 2 — per-yield verdict, no hoisting:** `resolveLiveYield` calls `memberBounds` per live
event, verbatim; the kicked-member/withhold sequence is pinned (`chat.test.ts:116-151`, verdict flips
per probe).

**Hot-spot 3 — cursor hold-or-lower on synthetics:** within a pump the synthetic carries the pump's own
start cursor (`cursor ?? 0`) — hold; the `null → 0` transition on a cursor-less attach reproduces the
pre-fold `Last-Event-ID:"0"` from-zero re-replay, which the seq-guard dedups (pinned in
`message-list-surface.ct.tsx` MARK_THEN_REOPEN + `chat-event-seq-guard.test.ts`). Post-abort cursor
writes are fenced (`control.signal.aborted` checked before `advanceCursor`). The enqueue-vs-delivery
defect is F1(a), not the synthetic path.

**Hot-spot 4 — byte-blindness above the source:** ast-grep sweep of `$X.event` over
`transport/trpc/stream/**` + `routers/stream.ts` (`-l ts`): only `sources/chat.ts` (the room source —
sanctioned) and `frame-queue.ts:73` `collapseKeyOf` — which is unreachable for chat (`push` routes
`OVERFLOW_POLICIES.chat === "lag"` → `pushLagging`, which never reads the event). `socket.ts` reads
only `"seq" in frame` + the `roomKey` routing fields. Client sweep (`-l ts` + `-l tsx` over
`data/bus/`): `.event` read only by the three sanctioned room-hook translators.

**Hot-spot 5 — principal provenance:** pump principal = the CONNECT ctx (`routers/stream.ts:33-37` →
`runSocket` → `source.run({principal})`); attach authorizes under the ATTACH ctx; the registry's
`owned()` gate (`socket-registry.ts:107-116`) collapses a foreign socketId to leak-free NOT_FOUND at
BOTH adopt and detach, and `adopt` runs eagerly in the connect RESOLVER (refusal before the generator
exists). Same-user cross-request principals converge because every verdict re-derives from the DB per
yield.

**Deleted-proc absence / resurrection:** repo-wide `streamMessages` sweep — live-code hits are comments
plus F2's spec only. `.subscription(` sweep over `transport/`: exactly 4 sites
(`chat.impersonateStream` exempt-permanent, `notifications`/`automation` exempt-staged, `stream.connect`
sanctioned); `chat.streamMessages` correctly REMOVED from the `single-stream-transport` EXEMPT list, so
re-adding it goes RED. `route-trpc-subscription.ts` deleted with zero remaining importers.

**CT stub honesty (`route-orb-socket.ts`):** frames flow through the REAL client path
(`useOrbSocket.routeFrame` → `roomRegistry.deliver` → `useChatBus.onEvent` → seq-guard →
`applyChatBusEvent`) — the stub fakes only the network; replayable on every connect
([[ct-sse-stub-replayable-every-connect]] honored); the recorder asserts the lifecycle
(`attachRequests()` pins `sinceSeq: 0` seed vs `null`, `connects() === 1` pins one-socket-per-tab).
Frames are typed `StreamFrame`, so the stub cannot silently author a shape the contract forbids.
The handshake has a 5s poll timeout that serves the body anyway — a mis-scripted CT fails visibly
rather than hangs (harness-acceptable).

**Moved tests:** the deleted describes in `routers/chat.test.ts` (3 describes / 7 tests) and
`routers/chat.int.test.ts` (2 describes / 5 tests) map 1:1 onto `stream/sources/chat.test.ts` +
`chat.int.test.ts` (titles diffed side-by-side; assertions preserved, now driven through the full
attach→connect ladder). The int suite still uses the real db, real `chat_participants` rows, real
durable-first bus, and pins live/replay verdict coherence row-for-row.

**e2e/probe instruments:** `tests/e2e/support/sse.ts` now drives the REAL multiplex wire (POST
`stream.attach` with CSRF header → GET `stream.connect`, filter by room; per-caller socketId so
host+member ride independent cells); `live-reasoning-strip.local.spec.ts` /
`live-member-strip.local.spec.ts` re-pinned onto it; `scripts/probes/sse-tap.ts` reshaped to
attach-then-connect with the split link. (I did NOT run the `@live` e2e specs — they need the live
stack + fixture provider; their reshaped instrument code was reviewed line-by-line instead.)

**Gates + suites run this session (worktree):**
- `pnpm check` — PASS, all 12 stages (biome, eslint, types×5, tests:execution-membership,
  structure:full incl. `single-stream-transport`, depcruise, knip, docs) — full output read.
- `pnpm vitest run` on every touched/moved server+client suite — 167/167 pass, 0 type errors
  (`stream/*` unit+int+test-d, `routers/chat.test.ts` 58, `routers/chat.int.test.ts`,
  `routers/stream.test.ts`, client bus `room-registry`/`seq-guard`/`apply-chat-bus-event`).
- Playwright CT single-file: `message-list-surface.ct.tsx` + `chat-room-surface.ct.tsx` — 31/31 pass.
- Scratch repro of F1(a) (see above).

**Docs/ledger compliance:** the D106/D110-§3.6 comment updates across `domain/chat/**`,
`Tier-4-Transport.md`, `AGENTS.md` are accurate renames (checked each against the code they describe);
the cross-tenant sweep's chat classification note matches the accept-always/withhold-per-yield posture
and the S2 stream.test.ts dual-transport pin now asserts chat attaches while notifications/automation
still refuse.

**Regions NOT read in full:** the untouched middle of `routers/chat.ts` (the ~500 lines of CRUD
procedures — only its diff hunks + header read; tsc green covers the import removals),
`use-rpg-bus.ts`/`use-user-bus.ts` bodies (untouched; grepped for their gap-heal wiring only), the
notifications/automation router bodies (comment-only hunks read). The `@live` e2e specs were reviewed,
not executed.

## Unconfirmed suspicions (low priority, not findings)

- A pump restart mid-slot (re-attach with lower sinceSeq during an active stream) hands the live
  continuation a FRESH `HiddenSpanStreamScrubber` that never saw the slot's earlier `<lie` opener.
  This is byte-identical to the pre-fold reconnect behavior (every reconnect made a fresh subscription
  scope), so it is not an S2 regression; whether the pre-existing class can leak a hidden tail
  mid-slot on reconnect is a question for a separate domain-level look at
  `scrubStreamReplayForMember`'s coverage of the live continuation, if anyone ever cares.
- `roomRegistry.failed()` (roomFailed) leaves the client-side room entry joined while the server
  detached it; recovery relies on the reconnect re-announce. Matches the spec's reconnect story;
  no failure scenario found that a reconnect doesn't cover.

---

# RE-REVIEW 261b728b — the F1/F2 remediation (fix commit on `wt/agent-ae7a23e7ea4435982`)

**Reviewed:** the fix delta `261b728b` in the worktree, every touched file read IN FULL
(`stream/socket.ts`, `stream/frame-queue.ts`, client `chat-event-seq-guard.ts` / `room-registry.ts` /
`use-bus-room.ts` / `use-chat-bus.ts` / `use-orb-socket.ts`, the four touched test files,
`tests/e2e/event-sequence.spec.ts`), plus the unchanged machinery the mechanism composes with
(`socket-registry.ts`, `sources/chat.ts` / `user.ts` / `rpg.ts`, `routers/stream.ts`,
`use-user-bus.ts` / `use-rpg-bus.ts`, `apply-chat-bus-event.ts`, `state/chat-stream.ts`) and spec
§5.3/§5.4/§5.5/§6/§7.

**VERDICT: MERGE-WITH-FIXES.** The shed arm of the heal is correct, well-guarded at its edges, and its
regression test bites (probe-verified this session). The reconnect arm — the `SinceSeqSource` thunk —
is defeated end-to-end by the client seq-guard whenever the reconnected socket delivers ANY durable row
before the rewind `stream.attach` lands, which is the normal case for a mid-stream disconnect. That
leaves a narrower but still permanent remnant of the exact stuck-Stop class F1 named (RF1 below).

## Findings

### RF1 (HIGH, narrower trigger than F1) — the reconnect thunk heal is a guard-dropped no-op whenever the resumed pump delivers any row before the rewind attach lands; an in-flight-lost turn terminal still strands the slot

`packages/client/src/data/bus/chat-event-seq-guard.ts:71-74` (monotonic admit, not contiguity-aware) ×
`packages/client/src/data/bus/use-chat-bus.ts:98` (the thunk) ×
`packages/server/src/transport/trpc/stream/socket.ts:174-177` (reconnect re-hydrates pumps from the
cell's — too-high — delivered cursor in the pre-await setup slice) ×
`packages/client/src/data/bus/use-orb-socket.ts:60-62` (the rewind rides a separate HTTP mutation with
no ordering barrier against SSE frames already flowing).

**The mechanism's hole.** The fix's reconnect story (use-chat-bus.ts header, "a RECONNECT — the
re-announce below carries this client's high-water mark … so the server restarts the pump there") is
true server-side and false end-to-end:

1. Server cursor counts frames at YIELD (`socket.ts:186`) — frames handed to a dying socket's writer
   are counted delivered but never reach the client. Gap = `(client mark, server cursor]`.
2. On reconnect the cell survives and `runSocket`'s setup slice starts the chat pump at the (too-high)
   cursor IMMEDIATELY; it replays `cursor+1..tip` and drains live — on the already-open SSE stream.
3. The client's re-announce (`socketLive` → `announce` → thunk → `stream.attach` POST) needs a full
   HTTP round trip; nothing orders it before the pump's frames. Any durable row so delivered has
   `seq > cursor > mark` — the guard ADMITS it and the mark jumps PAST the gap (admit requires only
   advance, never contiguity).
4. When the rewind lands, the server does everything promised — honors the lower `sinceSeq`
   (`socket-registry.ts:152-157`), restarts the pump, re-replays the gap — and the guard drops every
   re-replayed row `≤ mark`, including the gap. Permanently: no later path re-offers rows below the
   mark, and the mark never resets (not on `socketDown`, not ever).

**Reproduced this session** — `reports/stickler/scratch/reconnect-thunk-race-repro.ts` (worktree),
driving the REAL `runSocket` + REAL `createSocketRegistry` + REAL chat room source + REAL
`createChatEventSeqGuard`; only the two chat-service reads are fakes (the socket.test.ts pattern).
Client applies rows 1–3; rows 4 (delta) + 5 (`turnCompleted`) are yielded-but-lost (cursor 5, mark 3);
row 6 (another member's `chatUpdated`) lands while offline; reconnect; the resumed pump delivers row 6
pre-attach; then the rewind attach at 3 lands:

```
after socket #1: server cursor = 5 | client mark = 3
pre-attach delivery applied: 1,2,3,6 | mark now = 6
  post-attach frame: control:attached
  post-attach frame: chat seq=3 chatOpened
  post-attach frame: chat seq=4 delta
  post-attach frame: chat seq=5 turnCompleted   ← the server re-offers the terminal, as designed
applied seqs : 1,2,3,6
guard-dropped: 4,5,6                            ← the guard drops the entire heal
turn terminal (row 5) applied by the client: false
```

Client-side ordering does not save it: the thunk resolves at `socketLive` (before any `onData`), so it
carries the pre-gap mark; and if the announce were delayed until after the new rows, the thunk would
resolve ABOVE the server cursor and the attach would be an idempotent no-op (`socket-registry.ts:154` —
no rewind at all). Either ordering loses the gap.

**Concrete failure scenario:** wifi drop / laptop sleep <60s mid-turn (TCP buffers eat the turn's tail,
terminal included); reconnect inside the reap window; the resumed pump delivers anything — the queued
backlog above the cursor, or any row another participant produced — before the rewind POST lands (the
repro shows this is the structural norm, not a race the client can win). Result: the gap rows are
permanently un-applied. Canon CONTENT self-heals (`chatOpened` is exempt-by-type and invalidates the
chat's queries), but the chat-stream store does not: a terminal in the gap leaves the slot live
(`apply-chat-bus-event.ts:52-60` — terminals are the only slot-clear; `chat-stream.ts` has no timeout),
the composer's Stop sticks, clicking Stop wedges the slot in `stopping` forever — page reload is the
only single-user recovery. Pre-fold, `Last-Event-ID` resume made the replay part of the SAME ordered
stream, so this class could not exist; the fix claims parity ("the recovery `Last-Event-ID` used to
give us for free") and does not deliver it in this arm.

**Not touched by the shed arm:** a shed's gap is `> cursor` (never-yielded rows), which the restart
replay re-delivers ABOVE the client mark — that arm is genuinely closed (test 2 + the bite probe).
Only the reconnect/in-flight arm (gap `≤ cursor`) has this hole.

**Safe remediation directions (orchestrator's choice, not implemented):** make the resume request an
ordering barrier — e.g. the server withholds a durable room's post-reconnect delivery until the first
(re)announce for that room arrives (the cell already knows the socket went dark), or the guard becomes
contiguity-aware for durable rows (track `[mark, gap…]` and admit a replayed row that fills a known
gap), or `socketDown` clears the affected chats' marks (re-replay is then deduped only by content-safe
means — note a from-zero replay must still be droppable, so plain clearing needs the seed analysis).
A regression test: the repro's exact timeline through the real ladder, asserting the terminal is
APPLIED (not merely re-offered on the wire).

## Adversarial edge probe of the claimed mechanism — verified clean

- **Park/resume no-op guards** (`socket.ts:141-147`): detach-while-parked → `cell.rooms` miss → no-op;
  detach+re-attach-while-parked → fresh room + `startPump`, the stale notice finds `pumps.has(key)` and
  no-ops; rewind-re-attach-while-parked → same. All traced through `socket-registry.ts::attach/detach`
  listener wiring.
- **Socket death while parked:** the pending notice dies with the queue, but `goDark` leaves
  `cell.rooms` + the last-delivered cursor; reconnect re-hydrates the pump at that cursor and the
  replay refills the shed (> cursor) rows. The in-flight sub-gap rides RF1's thunk arm.
- **Second shed racing the resume:** a resume happens only when the notice DELIVERS, which clears the
  pending-notice collapse — the next overflow pushes a fresh notice and `onShed` fires again
  (`frame-queue.ts:129-138`). The one skip path needs a re-attach restart while a notice is pending
  AND the queue held at capacity by a different lag room (see unconfirmed list).
- **Pre-yield advance vs generator cancellation:** the pre-yield write makes "delivered" = "pulled by
  the transport", over-counting by at most the in-flight window — exactly what the thunk exists to
  cover (RF1 is that cover failing, not the pre-yield placement; post-yield placement would only move
  the same problem). Teardown fabricates no progress (test 1's post-`return` assertion).
- **Live-only rooms' park/resume:** `user`/`rpg` both wire `onSocketLive` (blanket invalidate), and
  every resume path reaches a heal: notice delivered → `roomRegistry.lagged` fans the heal
  (`room-registry.ts:225-230`) with the pump restarted BEFORE the notice was yielded (no listener gap:
  events between park and resume are lost server-side but predate the invalidate's refetch);
  death-while-parked → reconnect `socketLive` → `roomWentLive` heal; detach-while-parked → rejoin
  heal. `automation` has no client hook — but it `refusedUntilFolded` server-side, so unreachable.
  A collapse-room park does sever in-place payload replacement until resume (a small behavior change
  from pre-fix at-capacity behavior) — healed by the same invalidate, no correctness loss.
- **Attach synthesis in the parked window:** a queued-but-shed `chatOpened` is re-synthesized by every
  restart path (`attachSynthesesAndReplay` runs per pump start); test 2 asserts `sawOpened`. No path
  loses it.
- **Cursor regression via stale queued frames after a rewind restart:** stale higher-seq frames
  deliver first and raise the cursor, the restart's synthetic (seq = rewound cursor) lowers it, the
  replay re-raises it — transient LOWER cursor only, which errs toward re-delivery (client-deduped),
  never skip. Safe direction.
- **`advanceCursorOnDelivery` for a detached room's leftover frames:** `cell.rooms` miss → skip. Safe.
- **Post-close resume pump leak:** a roomLagged drained after `close()` starts a pump whose pushes are
  inert (closed-queue check) and which the `finally` teardown aborts (`pumps` map holds it). Bounded.

## Test-reality verification

- **The mandated regression test BITES** — probe this session: removed the `resumeAfterLag` call from
  the drain loop (cp/mv restore, no git), `socket.test.ts` test 2 times out (shed rows 1–512 never
  arrive); restored, 2/2 pass. Test 1 pins the exact delivered-cursor value (enqueue-advance would
  read 7, it asserts 5), including after teardown.
- **Test 2's contiguous-prefix assertion** (`toEqual(rows.map(r => r.seq))`) catches the loss-direction
  off-by-one at the park boundary even though its shed lands at K=0 (nothing delivered pre-shed): a
  resume at `cursor+1` loses row 1 and fails the exact-equality pin; a K>0 boundary is composed from
  test 1's cursor pin + `replayChatEvents(afterSeq)` semantics; the duplicate-direction off-by-one at
  K>0 is untested but harmless (client guard dedups; no loss). Acceptable.
- **`frame-queue.test.ts`** now pins the onShed contract (fires once per emitted notice, ref-correct,
  rate-limited while a notice is pending) — the composed cursor property correctly moved to
  `socket.test.ts` (the composition suite the F1 postmortem demanded).
- **`chat-event-seq-guard.test.ts`** pins `highWater` (applied ≠ offered; synthetics don't move it;
  per-chat). `room-registry.test.ts` pins the thunk re-read per announce and lowest-wins merging.
- **F2 re-pin verified by read** (`event-sequence.spec.ts`): asserts a `chat.` GET, exactly ONE
  `stream.connect`, and a `stream.attach` POST — the multiplex wire, matching the helpers in
  `tests/e2e/support/chat-room.ts` (`busLive`/`waitForStreamOpen` exist and match). NOT executed this
  session (needs the e2e stack); the builder's run is claimed green.

## Gates + suites run this session (worktree)

- `pnpm check` × 2 — PASS, all 12 stages, full output read both times (the second run because my bite
  probe's patch window overlapped the first run's `structure:full`; the clean-tree rerun is the
  verdict). `git status` clean (scratch lives under gitignored `reports/`).
- `pnpm vitest run` over `stream/*` (socket, frame-queue, socket-registry, sources/chat unit+int,
  room-sources test-d), `routers/chat.test.ts`, `routers/stream.test.ts`, `tests/client/data/bus/*` —
  170/170 pass, 0 type errors.
- Playwright CT single-file: `message-list-surface.ct.tsx` + `chat-room-surface.ct.tsx` — 31/31 pass.
- Scratch repro of RF1 (transcript above, script in the worktree's `reports/stickler/scratch/`).
- `ast-grep` sweeps: `createFrameQueue($$$A)` → ONE production site (socket.ts, `onShed` wired) + the
  queue's own tests; no other caller silently missing the heal hook.

## Regions NOT read / not run

The `@live` e2e specs and `event-sequence.spec.ts` were reviewed, not executed (need live stacks).
`apply-chat-bus-event.test.ts` relied on for reducer semantics (ran green; not line-audited this
pass). Everything else from the base review's NOT-read list stands.

## Unconfirmed suspicions (low priority, not findings)

- **Rate-limiter park skip:** a detach→re-attach (or rewind re-attach) restarts the pump while a
  roomLagged notice is still pending; if the queue is simultaneously held at capacity by a DIFFERENT
  lag room, the restarted pump's pushes shed-and-collapse silently (no new notice, no park) and the
  eventual notice delivery no-ops (`pumps.has` → true), dropping the replayed range with the cursor
  later jumping past it on live rows. Needs a second flooding lag room + a user re-attaching into a
  stalled socket; traced in code, not reproduced. Root texture is RF1's (the notice/park state is
  keyed per room, not per pump instance) — worth one line in whatever RF1's fix touches.
- socket.test.ts's `bounds` fake comment says "an unclamped MEMBER" while returning
  `viewerIsHost: true` — comment nit only; the suite is about delivery, not projection.

---

# PASS 3 ddfd76ca — the resumable ordering barrier + the scrub reconcile (final pass)

**Reviewed:** the merge `ddfd76ca` (parents: branch `261b728b`, main `65b90415`) in the worktree
`.claude/worktrees/agent-ae7a23e7ea4435982`. The true new content (files differing from BOTH parents):
`stream/socket.ts`, `stream/socket-registry.ts`, `stream/frame-queue.ts`, `stream/room-source.ts`,
`stream/room-sources.ts`, `stream/sources/{chat,user,rpg}.ts` + the six stream test files — all read IN
FULL. Also read in full (carried verbatim from main's `ed2aafc5`, but the scrub reconcile's other half):
`domain/chat/bus.ts`, `domain/chat/substrate/member-visibility.ts`; and (unchanged since pass 2, the
barrier's client half): `use-orb-socket.ts`, `room-registry.ts`, `use-bus-room.ts`, `use-chat-bus.ts`,
`chat-event-seq-guard.ts`, `routers/stream.ts`, plus the `memberText` contract arm
(`contracts/src/chat/bus.ts:214-231`) and the compose fan (`entry/compose/services.ts:364-373`).
Law applied: spec §3.3/§4.2/§5.3-§5.5/§6/§7/§8; the §5.5 leak fence; D106; D16.

**VERDICT: MERGE-WITH-FIXES.** The barrier is correct and probe-verified for every reconnect the server
has NOTICED (clean close, reap-window retry, process restart) — but the cell has no single-owner guard,
so a reconnect that beats the server's death-detection (the half-open-TCP class: NAT rebind, sleep/wake,
silently-dead proxy — precisely §8's motivating class) runs a SECOND generator on the still-"live" cell,
bypasses the barrier (`announced` was never re-armed), resurrects RF1's stranded terminal, and the zombie
generator's eventual teardown then clobbers the live connection's listener (P3F1, HIGH — reproduced).
Everything else probed is sound.

## Findings

### P3F1 (HIGH) — no single-owner guard on the socket cell: a reconnect that outruns the server's death-detection bypasses the barrier (RF1 resurrected) and the zombie's late `goDark` clobbers the live generator

`packages/server/src/transport/trpc/routers/stream.ts:31` (adopt returns a LIVE cell with no takeover) ×
`packages/server/src/transport/trpc/stream/socket-registry.ts:193-207` (`goLive` overwrites the listener;
`announced` is re-armed ONLY in `goDark`) × `packages/server/src/transport/trpc/stream/socket.ts:229-235`
(the finally runs `goDark(cell)` unconditionally — no identity check that this generator still owns the
cell).

**The mechanism.** `announced` is per-CONNECTION state, but it is cleared only when the PREVIOUS
generator's finally runs. The server learns a socket died when a write to it errors: on a clean close
(FIN/RST) that is immediate, but on a half-open TCP (client NAT-rebound, slept, or switched networks)
the 15s ping's writes BUFFER into the kernel and the error surfaces only after the retransmission
timeout — minutes. The client meanwhile reconnects at `reconnectAfterInactivityMs` (45s). In that
overlap window:

1. `adopt` hands the new `stream.connect` the still-live cell; `runSocket` #2's setup slice reads
   `room.announced === true` (never re-armed) → `startOrHoldPump` starts the chat pump IMMEDIATELY from
   the server's delivered cursor — the barrier is bypassed on exactly the reconnect class it was built
   for. Pre-announce delivery jumps the client's mark past the gap; the re-announce's rewind replay is
   then guard-dropped wholesale. A lost turn terminal strands the slot — RF1's exact failure.
2. While both generators live, the zombie's drain loop keeps "delivering" (into the dead socket) any
   frames its still-running pumps produce, ADVANCING the shared room cursors past rows no live client
   received — compounding the loss.
3. When the zombie's finally eventually runs, `goDark` clobbers the LIVE cell: `listener = null` (every
   subsequent attach/announce records the room but starts NO pump — a silently-dead room on a live
   socket, no `attached` ack, no error, until the next reconnect), `live = false` + `lastSeenAt` set
   (the cell is reap-eligible WHILE a live socket serves it — 60s later any registry entry point deletes
   it, discarding every cursor), `announced = false` (spurious re-arm), and `liveSocketCount`
   undercounts (the `/api/_debug` starvation pin).

**Reproduced this session** — `reports/stickler/scratch/dual-generator-overlap-repro.ts` (worktree),
driving the REAL `runSocket` ×2 concurrently on one REAL registry cell + the REAL chat room source + the
REAL client seq guard (fakes: the two chat service reads — the socket.test.ts pattern). Rows 1-3 applied,
4 (delta) + 5 (turnCompleted) yielded-but-lost (cursor 5, mark 3), row 6 written offline; reconnect
BEFORE #1 is aborted:

```
[1] server cursor = 5 | client mark = 3 | announced = true
[2] BARRIER CHECK — frames delivered on the reconnected socket BEFORE any announce:
    control:attached | chat seq=5 chatOpened | chat seq=6 chatUpdated
    client mark now = 6
[3] applied: 1,2,3,6 | guard-dropped: 4,5,6
    turn terminal (row 5) applied: NO — RF1 stranded slot, resurrected
[4] after #1's late goDark, while #2 is STILL live:
    cell.live = false | cell.listener = NULL (clobbered) | chat.announced = false
[5] new-room attach on the LIVE socket #2 → NOTHING delivered (silent room: no ack, no pump)
```

The composed regression suite never covers this shape: every socket.test.ts reconnect does
`it1.return()` (→ finally → goDark) BEFORE `stream.connect` #2 — the sequential case, where the barrier
holds (verified: its pin bites, see below). socket-registry.test.ts likewise never calls `goLive` twice
without an intervening `goDark`.

**Safe remediation direction (for the orchestrator, not implemented):** make the cell single-owner.
(a) Re-arm the barrier at CONNECT, not only at disconnect — `goLive` clears `announced` for every room
whose source is resumable (`announced` is per-connection state; clearing it where the connection BEGINS
removes the dependence on the zombie's timely death). (b) Epoch-stamp ownership: `goLive` returns/records
a token (or the listener identity), and `goDark` + the drain loop's `advanceCursorOnDelivery` no-op when
the caller is no longer the cell's current owner — that kills the clobber and the zombie cursor
inflation. (c) Optionally have `goLive` on a live cell abort the previous generator via a cell-held
handle (the eager kill; (a)+(b) are sufficient for correctness without it, since the zombie can no longer
write anything that matters). Regression test: the repro's timeline — two concurrent `runSocket` on one
cell, assert nothing is delivered pre-announce on #2, the terminal is APPLIED after the re-announce, and
a post-overlap new-room attach still gets its `attached` ack + pump.

### P3F2 (MEDIUM) — the barrier's liveness hangs on ONE swallowed, unretried HTTP mutation: a lost re-announce now silences a resumable room for the life of the connection

`packages/client/src/data/bus/room-registry.ts:140-145` (`announce` = `void transport.attach(...).catch(()
=> undefined)`) × `packages/server/src/transport/trpc/stream/socket.ts:168-172` (a held room lifts ONLY
on `onAttach`/`onAnnounce` — both exist solely as consequences of that mutation; no timer, by design) ×
spec §8 (ping 15s < `reconnectAfterInactivityMs` 45s ⇒ a healthy socket never self-reconnects).

**The consequence chain (each link verified by read this session):** on a reconnect the SSE stream and
the `stream.attach` re-announce are independent HTTP requests. If the announce fails while the stream
succeeded — a flap outliving the reconnect by seconds, a server restart between the two, a cap/rate-limit
refusal (`DomainRateLimitError` rides the same collapsed `.catch`, indistinguishable from the deliberate
NOT_FOUND swallow) — then: the barrier holds the chat room (no `attached` ack, no `chatOpened`, no
frames); nothing retries the announce; `resumeAfterLag` cannot fire (the pump never ran, so it cannot
shed); the ping keeps the socket alive so no inactivity reconnect ever comes. The transcript is frozen
with zero signal until the user leaves and re-enters the chat or the network flaps again. Pre-barrier
(261b728b) the same lost announce cost only the REWIND — delivery still resumed from the server cursor;
the barrier raises the stake of that one unacknowledged mutation from "gap heal" to "all delivery".
This is the answer to the builder's own hot-spot question ("is the pin strong enough?"): the pin
(re-announce per live edge) is tested client-side, but the TRANSPORT of the announce has no
delivery guarantee and its failure mode is total, silent, and unbounded in duration.

**Safe remediation direction:** any one of — a bounded retry on the announce (it is idempotent
server-side by design, so retrying is free); surfacing a failed attach for a JOINED room to the room's
`onError` instead of the blanket swallow (the swallow exists for the leak-free NOT_FOUND refusal, which
is distinguishable by code); or a server-side barrier timeout that degrades to the pre-barrier
resume-from-cursor (delivery with a possible gap + `chatOpened` invalidate beats silence). Regression
test: drop exactly the re-announce mutation in the room-registry/socket composition and assert the room
still delivers (or surfaces an error) within the timeout.

## Builder hot-spots — adversarially verified

1. **attach emits ONE signal (onAttach XOR onAnnounce); no double-start.** Verified in
   `socket-registry.ts::attach` (every path returns after exactly one callback) and pinned in
   socket-registry.test.ts ("a rewind is an attach, never also an announce"). `startPump` aborts and
   replaces any prior controller under the same key (`pumps` holds one entry per room); `liftBarrier`
   starts only when `!pumps.has(key)`. All listener callbacks run synchronously inside the mutation, and
   `pumps.set` happens in the same synchronous slice as `onAttach` — an announce can never observe a
   half-started rewind. CLEAN (the dual-GENERATOR case of P3F1 is a different axis: two pumps maps).
2. **`liftBarrier` vs an in-flight rewind.** The racing interleavings all collapse to duplicate replay
   (client-deduped) or a correct restart; traced every ordering incl. announce-during-park (lift starts
   from the delivered cursor; the later notice's unconditional `resumeAfterLag` re-restarts — duplicates
   only). CLEAN.
3. **Barrier liveness.** The client DOES announce on every live edge after the first
   (`room-registry.socketLive` → unconditional `announce` per room when `reconnected`; the first edge is
   covered by the join/bind announce, which also sets `announced: true` on the freshly-created server
   room). Pinned in room-registry.test.ts + the socket-registry announce tests. The contract-break
   consequence is P3F2 (silent room, no timer — confirmed); the barrier-bypass consequence is P3F1.
4. **resumable ⟺ lag correspondence.** Runtime-pinned in room-sources.test.ts (set-equality over
   `STREAM_CHANNELS` + the exact set `["notifications","chat"]`); the `.test-d` pins table totality both
   directions. `refusedUntilFolded("notifications")` honestly carries `resumable: true` but is
   unreachable (attach always refuses). CLEAN.
5. **unstamped (undefined) vs stamped-identical (null).** Cannot be confused: `exactOptionalPropertyTypes`
   is ON (tsconfig.base.json:38), so no producer can spell `view:`/`memberText: undefined` explicitly —
   and JSON round-trips preserve the distinction (null survives `chat_events` storage; undefined is
   absent). The producer stamps EVERY delta (`memberText: null` for reasoning ticks + identical-text
   ticks, a string for scrubbed ticks — `member-visibility.ts:266-281`), the compose root fans the
   LOGGED copy (`services.ts:364-373` fans `logged.event`), and the member-replay round-trip through the
   real db is pinned (chat.int.test.ts D16-streaming test: a member's replay CONTAINS the stamped-null
   post-join delta — a stripped stamp would withhold it and fail that assertion). Legacy pre-stamp
   `chat_events` delta rows replay as unstamped ⇒ withheld from members — fail-closed under-delivery,
   healed by the at-commit view; acceptable pre-launch posture, stated in the contract comment. CLEAN.

## Probe-bite re-verification (mandated)

Disabled the barrier (`startOrHoldPump` → unconditional `startPump`; cp/backup + mv restore, no git):
`socket.test.ts` fails EXACTLY at the pin — "rows lost in flight … re-delivered AND applied" red with
`expected 'delivered' to be 'held'` (pre-attach delivery observed), the other four tests stay green.
Restored; file re-run green (5/5); `git status` clean. The merge message's bite claim is accurate.

## Verified clean (what this pass's silence covers)

- **The delivered-cursor contract + shed heal (261b728b's arms), recomposed with the barrier:** re-read
  in full; the park-fires-on-every-shed / notice-rate-limited split (`frame-queue.ts::announceLag`) and
  the unconditional `resumeAfterLag` close pass 2's park-skip suspicion; the new socket.test.ts test 2
  drives exactly the re-attach-while-notice-pending interleaving and asserts the contiguous-prefix pin.
  A `collapse`-room park at capacity restarts via the same notice path (pass 2's noted small behavior
  change, unchanged).
- **`refusedUntilFolded` / NO_FRAMES:** refusal precedes the pump in `stream.attach` (authorize first),
  so the pump is unreachable; `resumable` on the refused arms cannot gate anything.
- **The scrub reconcile at the room source:** `deltaScrubbers`/`scrubberFor`/`retireScrubberOnCommit`
  deleted from `sources/chat.ts`; `resolveLiveYield` is now fully stateless (per-yield `memberBounds` →
  D16 floor → host verbatim / member `scrubDeltaEventForMember`+`stripChatEventForMember`), byte-equal
  in verdict to the durable twin `scrubChatEventReplayForMember`. §5.5 two-room isolation re-pinned on
  what remains per-room (the P3 reasoning verdict; the stamp forwarded verbatim; unstamped withheld
  without stalling; reconnect re-derives from current membership) — chat.test.ts:457-630, driven through
  the real ladder. The mid-slot reconnect leak is pinned END-TO-END over a real db + real durable bus
  (chat.int.test.ts:361-423: opener lands in the disconnect gap, closer arrives live, the tail bytes and
  the `"/>` framing never reach the member's wire).
- **`retireSlotState`'s `"view" in event` narrow:** safe — `exactOptionalPropertyTypes` forbids explicit
  `view: undefined`, and every live emit site passes a defined view (grep of all six view-carrying emit
  constructions) or filters first; absent-view events fall through to the terminal sweep. An ast-grep +
  grep sweep found zero `view: undefined` spellings repo-wide.
- **`emit`-is-total unchanged:** the stamper runs before the try, but it cannot throw on any
  constructible event (above), and `reportDroppedAppend` never throws.
- **Gates + suites (worktree, this session):** `pnpm check` PASS — all 12 stages, full output read
  (biome, eslint, types ×5, tests:execution-membership, structure:full, depcruise, knip, docs).
  `pnpm vitest run` over the six stream suites + client bus (incl. the 3 bus suites) — 109/109, 0 type
  errors. socket.test.ts re-run green post-probe.
- **Merge-fidelity:** `domain/chat/bus.ts` + `member-visibility.ts` are byte-identical to main's
  `ed2aafc5` (diff vs the main parent is empty); the client bus files are byte-identical to the branch
  parent (pass 2's review of them stands).

## Regions NOT read / not run

Main-side churn riding the merge (settings/rpg/ui files identical to `65b90415`) — out of scope, not
read. The `@live`/e2e specs — unchanged since pass 2; reviewed then, not executed (the merge message
claims a green isolated-stack run; not re-verified here). `routers/chat.ts` CRUD middle — unchanged,
still unread (tsc + pass 1 cover). `apply-chat-bus-event.ts` reducer internals — ran green; relied on,
not re-audited.

## Unconfirmed suspicions (low priority, not findings)

- The worktree's copy of THIS report is stale (the merge kept the branch-side file, dropping main's
  RE-REVIEW section — main's copy, updated at `e0cb972e`, is canonical and is where this pass appends).
  Housekeeping, not a code defect.
- Pass 2's cross-room rate-limiter interaction (a SECOND flooding lag room holding the queue at capacity
  while the first room's notice pends) is narrowed by park-on-every-shed but a mixed-room saturation
  still parks/restarts rooms via a shared capacity — traced as safe (each room's own notice restarts it;
  duplicates deduped), not exhaustively driven.
