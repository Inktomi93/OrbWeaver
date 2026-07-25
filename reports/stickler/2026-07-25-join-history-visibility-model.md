# Chat read-visibility — the design ruling (joinHistoryVisibility cluster)

Frontier-tier DESIGN RULING, branch `retro-burn-down`, 2026-07-25. Read-only session (two lanes
concurrently editing `packages/server` + `tests/e2e`). Owner directive applied: KISS/YAGNI suspended for
SHAPE — build the seam/contract/invariant now, defer consumers; the bar per proposal is "without this, a
named future read path becomes a nightmare or silently ships a leak."

---

## (A) THE MODEL — Presence-Interval Visibility: two planes, one verdict

**The unit of visibility is the canon row (`messages.seq`), and every derived artifact classifies by the
seq-span of the canon it derives from.** A committed row classifies by its own seq. A live token stream
classifies by the seq of the slot it fills (`slotSeq`). A summary classifies by its coverage span
(`[1, compactedAtSeq]`). A memory digest classifies by its block span. A variable DELTA classifies by the
seq it is stamped at. An artifact with NO canon anchor — an id, a count, a lifecycle fact, a resume-control
signal, a CURRENT variable value — is **room-activity metadata** and is never clamped.

**Two planes, exhaustively:**

- **ROOM plane** — what the room's shared machinery reads: turn assembly, the engine, compaction, quiet
  extraction, smart arbitration, automation fact resolution, the `subscribeAllChatEvents` firehose. Reads
  FULL canon under the host's authority (`runAsUserId`). Unclamped **by type**, never by forgetting.
- **VIEWER plane** — any bytes leaving the server toward a specific human: `listMessages`, both replays,
  the live SSE fan-out, `ChatDetail`, the fork copy, previews, and every FUTURE member-facing surface
  (memory recall UI, member search, export, a plugin-facing read API). Clamped by that human's own
  visibility, resolved ONCE.

**The one law that makes future paths correct by construction:**

> **Membership and visibility are one inseparable answer.** No API — verb, persistence read, injected
> cross-domain op, or delivery gate — may answer "is X a member of this chat" without simultaneously
> handing back "what may X see" (the floor). Any surface that can say "member: yes" without a floor is a
> latent leak, because the next consumer will stop at "yes."

This is not theoretical: the one confirmed leak this ruling found (F1 below) exists precisely because
`automation/persistence/canon-reads.ts::canInstallerSeeFact` answers membership without the floor.

**The verdict has exactly three projections, all derived from the ONE resolver
(`substrate/auth/clamp.ts::resolveHistoryFloorSeq`):**

1. **Row projection (SQL):** `seq >= floor` — `loadMessagesPage` / `loadStreamReplay` / `loadMessageSlots`.
2. **Event projection:** `isBelowHistoryFloor(event, floor)` — keyed on the canon-anchor CARRIER
   (`view.seq` / `slotSeq`), shared verbatim by durable replay and live fan-out.
3. **Span projection:** a derived artifact is visible iff its span intersects the viewer's presence
   interval — today implemented as the compact-summary all-or-nothing (`floor <= 0`), which is the
   degenerate form of `spanWitnessed(span, [[floor, ∞)])` (`memory/build/substrate/witnessing.ts`) — the
   SAME predicate that already gates character recall. **The member floor and character witnessing are one
   interval algebra: `[joinSeq, leftSeq)`, closed at join, open at left.** A future member-facing digest
   read reuses `spanWitnessed` with the member's own interval; nothing new is invented.

### Verdict on the landed shape (the coordinator's central question)

"Every history query takes a REQUIRED floor param" is **type-forced only inside the three floor-consuming
persistence reads** — a caller of those cannot forget. Repo-wide it is a **convention**: seven floorless
canon readers (`loadCanonHistory`, `loadCanonHistoryAfter`, `loadMessageView`, `loadSlotTarget`,
`loadPendingUserText`, …) sit in the same `persistence/queries.ts` with nothing separating room-plane from
viewer-plane, and outside `domain/chat` the convention has ALREADY failed once (F1: a sibling domain
re-derived chat visibility as membership-only). So: the chokepoint (`guard.ts::requireParticipant`), the
matrix (`substrate/auth/matrix.ts`), and the one-resolver clamp are good bones — keep them. What is
missing is the **hardening ladder** that makes the convention structural:

1. **Brand the floor.** `HistoryFloorSeq` (branded number, `@orb/kit/ids` `castId` style), minted ONLY by
   `resolveHistoryFloorSeq`. The three floor-reads + `isBelowHistoryFloor` + `toChatDetail` take the brand,
   not `number`. A new viewer-plane read that wants a floor must obtain it from the chokepoint; a
   fabricated `0` no longer typechecks. (Constitution §2: push enforcement to compile-time; branded types
   are the named tier-2 mechanism.)
2. **One cross-domain visibility op.** Chat exports ONE injected-op shape,
   `resolveViewerVisibility({chatId, userId}) → null | { role, historyFloorSeq: HistoryFloorSeq }`
   (compose-wired, the D38/injected-op discipline). Every non-chat domain that must ask "can this human
   see this chat thing" consumes THIS — membership and floor arrive as one value, so forgetting the floor
   is unrepresentable. First consumer: the plugin fan-out (F1 fix). Future consumers: member-facing memory
   recall, member search, export, notifications-with-content.
3. **Bus anchor allowlist (positive).** The existing D19 secret test
   (`tests/contracts/chat/index.test-d.ts:26`) is a deny-list of key NAMES — it cannot catch a new
   content-bearing member. Add a positive type-level pin: every `ChatBusEvent` member's key set ⊆ a closed
   scalar vocabulary, where the ONLY content carriers are `view` (MessageView) and `delta`+`slotSeq`. A new
   member with a free-text field is RED until it carries a canon anchor — the clamp's carrier-key design
   (`canonAnchorSeq`) then covers it automatically.
4. **Matrix-keyed reader gate (ts-morph).** `CHAT_VERB_AUTHORITY` already classifies every verb. Gate: a
   verb factory whose matrix entry is `member`/`author-or-host` may not call the room-plane canon readers
   (the floorless family). Keyed off the matrix (a live single source of truth), not a hardcoded path list
   (the path-keyed-gates-die-on-rename lesson). Room-plane callers (engine/assembly/compaction/previews
   classified `host`) stay untouched.
5. **Firehose import allowlist.** `subscribeAllChatEvents` importable only by the compose root (today:
   `entry/compose/automation-watcher.ts`). Dep-cruiser or ts-morph gate; probe it to bite.

**What is explicitly NOT the model:** a viewer-scoped repository object, a phantom-typed clamped DB
handle, or a redaction membrane at the domain edge. Those invert the persistence layer to buy the same
guarantee the five items above reach with the existing chokepoint — a rewrite whose payoff is elegance
alone, which the calibrated directive puts on the not-building list.

---

## CONFIRMED FINDINGS (evidence produced this session)

### F1 — MEDIUM (leak class): plugin event fan-out bypasses the join floor
- **Defect:** a plugin installed by a clamped (`from-join`) member receives pre-join canon CONTENT that
  every direct read path withholds from that same member.
- **Path (every link read this session):**
  1. Host edits/re-voices a PRE-join slot → engine emits `messageEdited`/`variantSelected` with that
     row's id (`packages/contracts/src/chat/index.ts:772,776`).
  2. `entry/compose/automation-watcher.ts:115` tails the UNCLAMPED firehose
     (`transport/trpc/chat-events-bus.ts:35`).
  3. `domain/automation/substrate/fact-resolver.ts` (`FACT_SHAPE`: `messageEdited: "message"`) →
     `resolveMessage` → `getMessageFact` (`entry/compose/automation-watcher.ts:35-50`) re-reads the
     selected variant's **`content`** + `seq`.
  4. `domain/automation/substrate/plugin-subscribers.ts:50-65` gates delivery on
     `canInstallerSeeFact` → `domain/automation/persistence/canon-reads.ts:79-82`, which for a chat fact
     is **`loadCallerRole(...) !== undefined` — membership ONLY, no floor**.
  5. `sub.deliver(fact, …)` hands the pre-join `content` to the installer's guest code (which the
     installer controls and can read back, e.g. via plugin storage).
- **Preconditions:** multi-human room; the installer is a global admin (`domain/plugin/verbs/install.ts:17`
  gates install on `can(caller,"admin",{kind:"global"})`) who is a from-join member of someone else's
  room; the plugin declared `events.on("messageEdited"|"variantSelected"|"messageCommitted")`. Narrow but
  real, and admins are NOT floor-exempt anywhere else in the system (the floor ignores global role; a
  non-member admin gets `ChatNotFoundError` like anyone).
- **Why it matters beyond the instance:** it is the proof that the floor is a convention outside
  `domain/chat` — the exact "next domain forgets" event.
- **Remediation (safe):** replace the chat arm of `canInstallerSeeFact` with the compose-injected
  `resolveViewerVisibility` op; a `message`-shaped fact delivers only when
  `fact.message.seq >= floor` (id-only/chatScope facts unchanged — the activity plane). Regression test:
  clamped installer + host edit of a pre-join row → zero deliveries; post-join row → delivered.

### F2 — MEDIUM (coherence hole): host-handoff produces a clamped host the design assumes cannot exist
- **Defect:** `acceptHostHandoffSwapStatements` (`persistence/participant.ts:166-181`) swaps `role` only;
  `resolveHistoryFloorSeq` (`substrate/auth/clamp.ts:44-46`) reads only
  `joinSeq`/`joinHistoryVisibility`. A `from-join` member promoted to host therefore keeps a positive
  floor — while every host-gated surface hands them room-plane content: `chat.compact`
  (`verbs/compaction.ts:178-187`) returns `result.summary` — a distillation of canon from seq 1 —
  **directly to a caller whose own `getChat` clamps `compactSummary` to null**
  (`substrate/chat-detail.ts:48-70`); `peekPrompt`/`previewAssembly` (host-gated) return assembly products
  built from full canon. Meanwhile their `listMessages` still withholds pre-join rows. The clamp comments
  assume the case away ("a host is never clamped", "floor 0 = host + every born-here seat",
  `clamp.ts:30-31`) — but a handoff host is not born-here.
- **Consequence:** same viewer, same rows — withheld on one verb, handed over on the next. Incoherent, and
  the inconsistency IS the spec bug (whichever direction the owner wants).
- **Remediation:** derive, don't stamp — `resolveHistoryFloorSeq` takes `role`; `role === "host"` ⇒
  `NO_HISTORY_FLOOR`. One home (`guard.ts` already loads role in the same membership); every consumer
  inherits. Principle: **authority over the room implies visibility of the room** — the host funds,
  steers, compacts, and previews the full-canon prompt; a floor that survives promotion is theater.
  Owner-ratifiable (it means promotion reveals pre-join history; the doctrine in Q6 already concedes the
  host can extract it via the model anyway).

### F3 — LOW (structure): the floor discipline is a convention beyond the three floor-reads
- `persistence/queries.ts` holds floor-REQUIRED reads (`loadMessagesPage:540`, `loadStreamReplay:569`,
  `loadMessageSlots:739`) beside seven floorless canon readers with no type/gate separation. Full
  enumeration of floorless-reader call sites this session (ast-grep): `assemble-gather.ts:238`,
  `extract-quiet.ts:30`, `engine.ts:756,792`, `turn.ts:186,845`, `read.ts:418` (host-gated
  getShapeTrace), `read.ts:501` (previewContextFit — content not returned, numbers only),
  `compaction.ts:143` — ALL currently room-plane/host-gated, so **no live leak in-domain**; but nothing
  makes the next `member` verb that reaches for `loadCanonHistory` (the most natural name) RED.
  Remediation = the brand + matrix-keyed gate (model items 1 & 4).

### F4 — LOW (contract gap): a future content-bearing bus member bypasses the clamp silently
- `canonAnchorSeq` (`clamp.ts:84-89`) keys on the carrier NAMES `view`/`slotSeq`; an event member carrying
  canon text under any other key returns `undefined` → rides through both clamp halves. The existing
  contract pin (`tests/contracts/chat/index.test-d.ts:26-34`) is a secret-key deny-list and would pass it.
  Remediation = the positive key allowlist pin (model item 3).

### F5 — INFO (id-plane, ratified visible): `previewContextFit` can name a pre-join row id
- `resolveContextFitPreview` (`verbs/read.ts:465-489`): for a clamped member `boundaryMessageId =
  fitted.earliestKeptMessageId` — potentially a pre-join slot id; the fit numbers are deliberately
  room-wide (documented, `read.ts:539-541`). Same class as Q2's id-only payloads: ids resolve only through
  clamped reads. No change; covered by the Q2 principle.

### F6 — LOW (correctness artifact + edge leak): floored fork's variable carry is a hybrid
- `verbs/fork.ts:220-253`: the refold drops pre-floor SLOT deltas (slots below floor aren't copied) but
  carries ALL pre-floor STANDALONE batches (`loadStandaloneVariableDeltas` unfloored, filtered only by
  `throughSeq`). Two consequences: (a) the fork's `runtimeVariables` ≠ the room's real current values for
  a clamped forker (missing pre-floor slot deltas) — a silent gameplay-state reset; (b) a pre-join
  standalone batch whose value was later overwritten is carried VERBATIM into a chat the forker hosts —
  values the forker could never observe via `getVariables` can resurface after copied-slot deletions
  trigger a refold. Remediation in ruling #8.

---

## (B) RULINGS 1–8

**#1 — `joinSeq` inclusive vs exclusive: KEEP INCLUSIVE.**
- Principle: **one interval algebra** — presence is `[joinSeq, leftSeq)` (closed at join, open at left)
  for EVERY consumer of the horizon columns. `spanWitnessed` (`witnessing.ts:16-23`) is already
  joinSeq-inclusive for character recall; the floor (`seq >= joinSeq`) matches it. Exclusive would make
  the same stored number mean "present from here" for characters and "present after here" for humans —
  a forked convention, plus a founder special case (founders are `joinSeq 0`,
  visibility-default `from-join`, and rely on `max(0, 0) = 0` ⇒ unclamped; `gt` would need
  `joinSeq === 0 ? 0 : joinSeq + 1`).
- Product reading: the row at `joinSeq` is the entry context — the state of the room as you walked in.
  One row of pre-join visibility is the price of one comparator convention; exclusive buys nothing
  principled.
- Change: contract wording only — `contracts/src/chat/index.ts:1059` and the `clamp.ts` TSDoc say
  explicitly: "from-join = rows with `seq >= joinSeq` (inclusive; the `[joinSeq, leftSeq)` presence
  interval, one convention with character witnessing)."

**#2 — Id-only bus payloads: RIDE THROUGH (ratify).**
- Principle: **the floor governs canon CONTENT (bytes and content-derived prose), never room-activity
  facts.** Ids, counts, lifecycle, and resume control are the activity plane; ids resolve only through
  equally-clamped reads, and withholding them would blind a member to their OWN post-join events on a
  view-raced delete (the clamp's own argument, `clamp.ts:66-68`). The existence-oracle is accepted and
  bounded.
- Same principle answers #4 and F5 — that is the shared mechanism.
- Change: none in code; the principle is minted in the D-entry.

**#3 — Delta streaming: RATIFY the landed `slotSeq` shape (the uncommitted lane is right).**
- Principle: **raw canon bytes must carry a canon anchor; the anchor is stamped by the one emit site that
  knows it.** `resolveSlotSeq` (`engine.ts:899-901`) is truthful (loaded target seq / allocated tail), and
  the seq-race skew errs toward withholding. The floor already rides the SUBSCRIPTION (via the
  `chatEventBounds` probe) — moving the whole verdict to subscription-time is impossible because one
  stream interleaves pre-join-slot deltas (host swiping an old row) with post-join turns; the verdict is
  inherently per-event. Turn-target scoping is the same anchor one join away (a turn writes into exactly
  one slot; `slotSeq` IS the turn target, already in seq space where the floor lives).
- The delta type split is also right: `ChatDeltaEvent` (provider-level) must NOT carry seq — a provider
  cannot know it (`contracts:587-593`); the anchor rides the bus member.
- Change: complete it with F4's positive allowlist pin so the NEXT content-bearing member cannot ship
  anchorless.

**#4 — `historyTruncated`: LEAVE AS-IS; reclassify, don't clamp.**
- Principle: same as #2. It is a subscription-synthesized RESUME-CONTROL signal about the EVENT-LOG
  retention window ("your cursor predates what the log retains — refetch state"), never logged, carrying
  chatId only (`contracts:819`, transport `chat.ts:563-569`). It asserts nothing about transcript rights;
  the refetch it triggers (`listMessages`) is floor-clamped. Computing it from a per-member floor would
  make the CURSOR semantics per-member — a genuinely incoherent hybrid (the cursor is a log coordinate,
  not a rights coordinate).
- Change: one comment line at the synthesis site naming it activity-plane resume control (kills the
  standing "incoherent?" question).

**#5 — `subscribeAllChatEvents`: unclamped BY TYPE, but the comment is not the guarantee.**
- Principle: **the firehose is a room-plane source; per-member egress from it must pass the visibility
  seam.** Two structural belts, replacing "a comment":
  1. Import allowlist — only the compose root may import `subscribeAllChatEvents` (dep-cruiser/ts-morph
    gate, probed to bite). Today's sole consumer verified: `entry/compose/automation-watcher.ts:115`
    (repo-wide grep, live code only).
  2. The per-member egress that ALREADY EXISTS downstream of it is F1 — fix it with the
    `resolveViewerVisibility` op. That op is the standing answer for every future firehose-fed
    per-member delivery (buddy observer, notification-with-content, plugin read API).
- One mechanism answers #5 and F1.

**#6 — Turn assembly unclamped: RIGHT DOCTRINE — ratify it with its consequences named.**
- Verdict: "the prompt is the room's; the transcript is the reader's" is correct, not a costume — but only
  if stated with its consequences:
  1. A turn is ONE shared utterance broadcast to every member. Per-reader assembly is incoherent: you
    cannot clamp a shared reply per reader, and forking the reply per reader forks canon itself.
  2. Therefore the floor is a **transcript right, not a knowledge wall**: a from-join member may learn
    pre-join FACTS through the model's mouth (or another member's). What they can never do is READ the
    pre-join bytes verbatim — the same distinction human groups have (a newcomer hears the story
    retold; they don't get the group's chat log).
  3. The assembly ALREADY leaks-by-design through: `{{memory}}` recall (digests distilled from seq 1),
    the compact marker in the top history slot, and the model's own answers. Clamping any one path while
    the others stand would be theater.
  4. If real secrecy is ever the product need, the correct shape ALREADY EXISTS: the floored fork
    (`forkChat` copies only `seq >= floor`) — a new room whose canon IS the member's visible slice.
    Never per-reader prompts.
- The coherence completion is F2: **authority ⇒ visibility** (host floor = 0, derived in the one
  resolver). A host who commands the room-plane machinery cannot simultaneously be viewer-plane-clamped.
- Owner call: ratify (2) and the F2 derive explicitly — this is a product-semantics ruling, minted in the
  D-entry so it is never re-litigated.

**#7 — memory recall + search/embeddings: SWEPT — no current leak; the future seam is named.**
- Evidence (all read this session):
  - Recall (`memory/recall/recall.ts`) feeds `{{memory}}` in ASSEMBLY only — room plane, covered by #6.
    Witnessing gates characters, correctly (it is presence semantics for the recalling SEAT, not reader
    authz).
  - The omnibox (`transport/routers/search.ts` → `domain/search/verbs/search.ts`): `digests` are
    owner-belted via the `characters.ownerId` join (`persistence/scope.ts:25-31`); `segments` are gated
    against `ownedChatIds` (`verbs/search.ts:136-159`); `documents` chat scope is transport-refused and
    reachable only via the compose-injected, membership-authorized gather op (`search.ts:199-208`). A
    clamped member (who owns no seated character — `addCharacterToChat` is host-only + single-owner) gets
    `[]` from every chat-scoped lens. **No member-facing recall/search surface returns message bodies at
    all today** — the cluster is closed by the ownership axis.
  - BUT it is closed by the WRONG AXIS for the future: the day a member-facing "search this room" lands,
    the owner belt is exactly what must be widened to membership — and widening it without the floor
    ships the leak. Ruling: that surface, when built, consumes `resolveViewerVisibility` and applies the
    SPAN projection — `spanWitnessed(blockSpan, [[floor, ∞)])` — the predicate that already exists.
    Digests/segments carry block spans (`loadSegmentSpans`), so the mechanism is already in the tree.
    Nothing is built now; the D-entry pins the rule so it cannot be forgotten.
- The genuinely open cluster was not memory/search — it was automation/plugins (F1).

**#8 — variables (both paths, ruled together): VALUES are room-state; delta HISTORY is
transcript-adjacent.**
- Principle: **the current fold is the room's present state** — every member plays against it and
  post-join turns render it into text anyway (`{{getvar}}`), so clamping `getVariables` /
  `getStoredVariables` (member, no floor — `matrix.ts:91-94`) would be theater. Leave them as-is.
- The **history of deltas** is different: it encodes when/what changed, including values later
  overwritten — that is transcript-shaped data. Concrete change (fixes F6, one mechanism):
  - On a fork under a floor (`historyFloorSeq > 0`): compute the TRUE fold of the source chain at
    `min(throughSeq, head)` (all slot deltas ∪ all standalone batches — the value the forker could
    already read via `getVariables`), write it as ONE synthetic baseline standalone batch stamped at
    `floor - 1`… replaced by: stamped at the floor boundary; then carry only `seq >= floor` standalone
    batches and let the copied (already-floored) slots contribute as today. The fork's fold is then
    byte-equal to the room's real state at the fork point, no pre-join batch contents are carried, and
    no pre-join seq stamps survive.
  - This is the **variables twin of the compaction-checkpoint rule** the fork already applies to prose
    (`fork.ts:241-243`): invisible history collapses into a visible present-state marker. Same shape,
    second instance — the pattern is now a rule, not a coincidence.
- `standaloneVariableDeltas` remains non-member-readable directly (verified: only fork + the refold read
  it); `getVariables` unchanged.

**Where one mechanism answers several questions (the elegance map):**
- #2 + #4 + F5 → ONE principle: content-plane vs activity-plane.
- #5 + F1 → ONE op: `resolveViewerVisibility` (membership+floor inseparable).
- #6 + F2 → ONE derivation: authority ⇒ visibility, in the one resolver.
- #1 + character witnessing → ONE interval algebra: `[joinSeq, leftSeq)`.
- #8 + compaction-on-fork → ONE pattern: invisible history collapses to a visible present-state baseline.
- #3 + F4 → ONE contract: canon bytes always carry a canon anchor; the anchor set is closed and pinned.

---

## (C) ORDERED PLAN

1. **F1 fix (small, security-first).** Mint `resolveViewerVisibility` as chat's exported viewer-visibility
   op (compose-wired into automation deps); replace the chat arm of `canInstallerSeeFact`; message-shaped
   facts deliver only at `fact.message.seq >= floor`. Int test: clamped installer × pre-join edit → zero
   deliveries. *Route to `security-executor` (authz change).* 
2. **F2 fix (one-line + ratification).** `resolveHistoryFloorSeq({role, joinSeq, joinHistoryVisibility})`;
   `host` ⇒ `NO_HISTORY_FLOOR`. Tests: handoff-promoted host reads full history; compact-result coherence.
   *Needs the owner's explicit yes (promotion reveals history).* 
3. **Brand the floor (small).** `HistoryFloorSeq` branded type; minted only by the resolver; consumed by
   the three floor-reads, `isBelowHistoryFloor`, `toChatDetail`, the new op. Mechanical; typecheck is the
   proof.
4. **Bus anchor allowlist (small).** Positive per-member key-set pin in `index.test-d.ts` (closed scalar
   vocabulary; content carriers = `view` | `delta`+`slotSeq`). Prove it bites with a scratch member.
5. **Matrix-keyed reader gate + firehose import gate (medium).** ts-morph gate keyed off
   `CHAT_VERB_AUTHORITY` (member-classified verb ↛ floorless canon readers); importer allowlist for
   `subscribeAllChatEvents`. Follow the new-gate four-coupled-sites checklist; probe both to bite.
6. **#8 fork baseline batch (medium).** The synthetic baseline standalone delta on floored forks; tests:
   fork state byte-equals room state at fork point; no pre-floor batch survives the copy.
7. **Docs/ledger (small).** Mint the D-entry (below); #1 wording fix in contracts + clamp TSDoc; #4
   one-line reclassification comment at the synthesis site.

**Owner decisions (not engineering):**
- #6/#2 doctrine ratification + the F2 "authority ⇒ visibility" derive (product semantics).
- **Presence-ERAS retention (schema seam only — flagged, not designed here):** the re-join upsert
  (`participant.ts:118`) OVERWRITES `joinSeq`, destroying prior presence intervals forever. Characters
  keep multi-interval witnessing; humans cannot, retroactively, ever — if "you may read what was committed
  while you were present" (the honest generalization Slack/Matrix users expect) is ever wanted, the data
  must exist from now. An append-only `chat_participant_eras` write (join/leave stamps; zero read-side
  change; floor stays latest-join) is the irreversibility-priced seam. Schema change ⇒ SQUASH into
  `0000_baseline.sql` if taken.

## What NOT to build (the YAGNI list — shape is built, volume is not)

- **No viewer-scoped repository / phantom-typed DB handle / domain-edge redaction membrane.** The
  chokepoint + matrix + brand + gates reach correct-by-construction without inverting persistence.
- **No per-reader turn assembly and no per-reader event redaction** — incoherent per #6.
- **No clamping of:** `getVariables`/`getStoredVariables`, `historyTruncated`, id-only payloads,
  `previewContextFit`'s numbers/boundary id, invite previews. All activity-plane.
- **No blanket delta withholding** (dead; superseded by `slotSeq`).
- **No member-facing recall/search surface now** — only the rule for when one lands (#7).
- **No multi-era floor READ semantics** — only the write-side eras seam question goes to the owner.
- **No second clamp home anywhere** — memory/search/export/plugins consume the op; a mirrored floor
  computation in another domain is the defect class F1 just demonstrated.

---

## (D) D-LEDGER ENTRY TEXT (ready to mint; assign the next free D-number)

> **D«n» — Chat read-visibility: presence-interval clamp, two planes, one verdict.**
> The unit of visibility is the canon row (`messages.seq`); every derived artifact (event, live delta,
> summary, digest, variable delta) classifies by the seq-span of the canon it derives from; an artifact
> with no canon anchor (ids, counts, lifecycle, resume control, current variable values) is room-activity
> metadata and is NEVER clamped. Two planes: the ROOM plane (assembly, engine, compaction, arbitration,
> automation fact resolution, the all-chats firehose) reads full canon under host authority, unclamped BY
> TYPE; the VIEWER plane (any bytes toward a specific human) is clamped by that human's own floor.
> **Membership and visibility are one inseparable answer**: no verb, persistence read, injected op, or
> delivery gate may report chat membership without the floor — cross-domain consumers use chat's
> `resolveViewerVisibility` op; a membership-only visibility check in another domain is a defect (the
> plugin fan-out precedent). The floor is derived in ONE home
> (`domain/chat/substrate/auth/clamp.ts::resolveHistoryFloorSeq`, minting the branded `HistoryFloorSeq`),
> stamped at the ONE chokepoint (`guard.ts::requireParticipant`), and projected exactly three ways: SQL
> `seq >= floor`; per-event `isBelowHistoryFloor` keyed on the closed anchor-carrier set (`view.seq` /
> `slotSeq` — a bus member carrying canon bytes MUST carry an anchor; the contract test pins the closed
> key vocabulary); per-span `spanWitnessed(span, [floor, ∞))` — the member floor and character witnessing
> share the ONE interval algebra `[joinSeq, leftSeq)` (join-inclusive; founders are `joinSeq 0`).
> **Authority implies visibility**: `role === "host"` resolves floor 0 (a handoff-promoted host is not
> viewer-clamped — the host commands the room-plane machinery). **The prompt is the room's; the
> transcript is the reader's**: turn assembly is deliberately unclamped — the floor is a transcript
> right, not a knowledge wall; real secrecy is a floored fork (a new room), never a per-reader prompt.
> On a floored fork, invisible history collapses into a visible present-state baseline (the compaction
> checkpoint for prose; the synthetic baseline standalone batch for variables) — never carried verbatim,
> never half-carried. Live and durable delivery MUST return one verdict for one seq (one emit = one
> logged + fanned row). Homes: clamp + resolver `substrate/auth/clamp.ts`; chokepoint `guard.ts`;
> matrix `substrate/auth/matrix.ts` (member-classified verbs may not call room-plane canon readers — the
> matrix-keyed gate); firehose `transport/trpc/chat-events-bus.ts` (importable only by the compose root);
> cross-domain op `resolveViewerVisibility` (compose-wired).

---

## Verification log (what my silence covers)

- **Law read IN FULL:** `.claude/agent-doctrine.md`, `docs/architecture/core/AGENTS.md`,
  `Core-Laws-and-Precedents.md`, `Documentation-Law.md`, `docs/Mission.md`,
  `Spine-Identity-and-Auth.md`, `docs/retro-workboard.md` (all 921 lines).
- **Code read IN FULL:** `substrate/auth/clamp.ts`, `guard.ts`, `verbs/read.ts`, `verbs/fork.ts`,
  `verbs/invites.ts`, `verbs/compaction.ts`, `persistence/queries.ts`, `persistence/participant.ts`,
  `bus.ts`, `substrate/chat-detail.ts`, `substrate/auth/matrix.ts`, `substrate/variable-ops.ts`,
  `transport/trpc/routers/chat.ts`, `transport/trpc/chat-events-bus.ts`,
  `entry/compose/automation-watcher.ts`, `domain/automation/substrate/plugin-subscribers.ts`,
  `domain/automation/contract/plugin-subscribers.ts`, `domain/search/verbs/search.ts`,
  `domain/search/verbs/segments.ts`, `domain/search/persistence/scope.ts`,
  `domain/chat/memory/recall/recall.ts`, `memory/build/substrate/witnessing.ts` (predicate),
  `transport/trpc/routers/search.ts`.
- **Code read in targeted region:** `contracts/src/chat/index.ts` (580–870, 1030–1160),
  `db/schema/chat.ts` (360–470), `engine/engine.ts` (870–1100 + emit-site greps),
  `verbs/turn.ts` (178–195, 838–855), `verbs/extract-quiet.ts` (header+read),
  `automation/persistence/canon-reads.ts` (`canInstallerSeeFact`), `plugin/verbs/install.ts` (gate line),
  `automation/substrate/fact-resolver.ts` (first 120 lines), `tests/contracts/chat` (allowlist pins),
  `verbs/start-chat.ts` + `verbs/roster.ts` (joinSeq stamp greps).
- **Structural sweeps (ast-grep, `-l ts`, whole `packages/server/src`):** every call site of
  `loadCanonHistory` / `loadCanonHistoryAfter` / `loadMessagesPage` / `loadMessageSlots` /
  `loadStreamReplay` / `loadChatEventReplay` (results enumerated in F3); every live importer of
  `subscribeAllChatEvents` (`/usr/bin/grep -a`, non-test: contract comment, compose watcher, bus def,
  barrel); every `historyFloorSeq` consumer (fork/read/views/guard/transport — exactly the claimed set).
- **NOT done, deliberately:** `pnpm check` / `pnpm test` — two lanes are concurrently editing
  `packages/server` and `tests/e2e` (read-only mandate; shared-tree contention protocol: a battery run
  now would attribute cross-lane reds to nobody). This is a design ruling, not a diff review; the
  workboard's claim "neutering the floor → 8 tests red" was NOT re-verified this session.
- **Regions NOT read:** `engine/engine.ts` 1–870 and 1100–1305; `verbs/turn.ts` outside the two regions;
  `memory/build/*` beyond witnessing; the notifications domain internals; client-side consumers
  (`packages/client/src/data/invalidation.ts` uncommitted diff); the uncommitted test files' contents;
  `domain/search/verbs/{digests,documents,corpus}.ts` bodies (scope conditions read via
  `persistence/scope.ts` + the dispatch); `persistence/invites.ts` beyond the joinSeq greps.

## Unconfirmed / low priority (explicitly NOT findings)

- The `chat-events-bus.ts` header cites "the buddy observer's chat source" as the firehose motivation;
  only the automation watcher consumes it today. Possibly a stale comment (buddy purged in retro) —
  did not verify buddy's retro status.
- Workboard's "reconnect mid-turn loses the partial token stream" (functional, not security) — out of
  the 8 questions; not investigated.
- Whether `AssembledPrompt` (peekPrompt product) embeds verbatim canon rows or only static/dynamic
  halves — not fully traced; F2 does not depend on it (the `compact` result path is sufficient and
  fully traced).
- `previewInvite`'s pre-membership surface (title/host handle/member count/mode label) — content-free by
  inspection; no deeper probe.
