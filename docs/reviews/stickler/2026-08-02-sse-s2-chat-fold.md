# Stickler review — SSE-1 S2: the chat room fold (`wt/agent-ae7a23e7ea4435982` @ `b4904ab4`, work commit `c52555b6`)

**Reviewed:** `git diff main...HEAD` of the S2 worktree (`.claude/worktrees/agent-ae7a23e7ea4435982`), every
touched file read in full, plus the S1 machinery the fold newly activates (`stream/socket.ts`,
`stream/frame-queue.ts`, `stream/socket-registry.ts`, client `room-registry.ts`/`use-orb-socket.ts` —
landed at `f2185df1`, unchanged by this diff, but chat is the FIRST durable-cursor `lag` room to ride them).
**Law applied:** spec `docs/design/sse-multiplex-spec.md` §3.3/§4.2/§4.3/§5.3/§5.5/§6/§7/§12/§13; D106;
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
