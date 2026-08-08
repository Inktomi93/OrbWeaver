---
kind: review
status: active
updated: 2026-08-03
---

# Stickler design review — the STATE-ANCHOR ROW leak (owner-ordered, 2026-08-03)

**Charge:** every rpg hand-door write on a committed head clone-forwards a snapshot FK'd to a message
variant, so each door posts a content-less assistant row to anchor it. The flagship demo's authored
setup produced 8 blank rows stamped to the synthetic "Group" character (model=None); they render as
blank bubbles, export to ST as `"mes":""` rows named "Group", and the TRANSCRIPTS lane patched the
SEEDER to drop them at replay. Owner: "that's a sloppy fix — permanently fix that issue the clean way,
by construction, not per-consumer filtering."

**Verdict up front: the anchor is GAME-plane data wearing a canon-row costume, and every leak in the
census follows from the costume. The permanent shape is arm (b): re-anchor NON-TURN snapshots off the
message plane entirely — a snapshot row is variant-keyed IFF it was produced by that variant's own
turn flush; every hand-door/resync/populate write becomes a message-less snapshot row ordered by an
"as-of" reference. The row class that leaks then does not exist to be filtered.** Arm (a) (a row KIND
+ gate-forced filters) is the honest fallback but is structurally still per-consumer filtering with a
cop; arm (c) (batching) is a mitigation rider, not a fix, and is unnecessary under (b).

Law checked before treating this as new territory: `Core-0-Architecture-and-Structure.md` §6 carries
NO ruling on the anchor storage shape (only D28's character_snapshots row, unrelated). The D-ledger
constrains but does not pre-decide: D111 W-A ruled only the RENDER half ("state-anchor slots render
silently by construction", `9905cbf1`); D108 ruled the FKs non-nullable as part of the NO-BORN-SEED
decision ("no schema delta, no baseline regen" was that decision's cost argument, not an eternal
property); D121-F documents the rewind asymmetry ON the variant-keyed mechanism; D26 defines the
message plane; Spine-Identity §2e registers the empty slot as by-design (a register entry this
redesign retires with its own D-entry, which is the sanctioned way — the owner ordered the reshape).

---

## 1. INVENTORY — the full scatter map (every consumer that sees or filters anchor rows)

### 1a. The minters (who creates anchor rows)

| # | Site | Mechanism |
| - | - | - |
| M1 | `packages/server/src/domain/rpg/snapshot-edit.ts:141` | `writeHandState` clone-forward tail: committed head or turnless game ⇒ `ctx.postNarratorMessage(chatId, "")` + `insertSnapshot` keyed to the posted variant. Serves SEVEN hand doors: `edit-snapshot.ts`, `patch-actor.ts`, `dismiss-actor.ts`, `promote-actor.ts`, `quest/upsert-quest.ts`, `quest/delete-quest.ts`, `chat-ops/handoff-heal.ts`. |
| M2 | `packages/server/src/domain/rpg/verbs/game/resync-from-story.ts:60,109` | `RESYNC_ANCHOR_CONTENT = ""` → `postNarratorMessage`. |
| M3 | `packages/server/src/domain/rpg/verbs/game/populate-from-character.ts:47,145` | `POPULATE_ANCHOR_CONTENT = ""` → `postNarratorMessage`. |
| (not an anchor) | `verbs/checkpoint/restore-checkpoint.ts:28` | posts a VISIBLE `RESTORE_MESSAGE` line; the restored snapshot keys to that variant. Real content — not part of the leak, but part of the uniform-law question (fork 4). |

The "Group" attribution artifact is minted at `domain/chat/verbs/post-narrator-message.ts:42` —
`mintSyntheticGroupCharacter` under the host, `model: null` on the variant → the ST export's
`"Group"` / model=None rows. `post-narrator-message.ts:71-73` also emits `messageCommitted` + fans
`chatsChanged` for every anchor post.

The 8-rows-in-a-row shape: each hand write clone-forwards because the PREVIOUS write's snapshot is
born `committed: 1` (`snapshot-edit.ts:150`), so the next write always sees a committed head and
mints a fresh slot. The authored demo setup is N consecutive hand writes ⇒ N anchor rows.

### 1b. Consumers that FILTER today (the per-consumer scatter the owner named)

| # | Site | Filter |
| - | - | - |
| F1 | `packages/contracts/src/chat/messages.ts:198-213` | `isStateAnchorSlot` (content.trim()==="") + `lastVisibleRow` + `lastVisibleAssistant` — the declared one-home selectors. |
| F2 | `packages/db/src/kit/canon-visibility.ts:25` | `notStateAnchor()` — the SQL twin (`trim(content) <> ''`), homed in db because two domains need it. |
| F3 | `packages/server/src/domain/chat/persistence/queries.ts:294,323` | chat-list message COUNTS + `lastMessageAt` recency exclude anchors. |
| F4 | `packages/server/src/domain/automation/persistence/canon-reads.ts:51` | CEL `chat.messageCount` excludes anchors. |
| F5 | `packages/server/src/domain/discovery/persistence/message-reads.ts:37` | discovery assistant-message reads exclude anchors AND `characters.synthetic` (a second scattered accommodation for the same artifact — the Group char). |
| F6 | `packages/client/src/features/chat/hooks/use-message-items.ts:46` | the render filter (D111 W-A). |
| F7 | **the seeder drop-patch** — TRANSCRIPTS lane worktree `.claude/worktrees/agent-a2b4358196be304d7`, uncommitted diff to `domain/chat/seeder/seed.ts` | a local `isStateAnchorSlot(m)` re-spell (role==="assistant" && content.trim()==="") filtering `parsed.messages` before the bulk write. The 7th filter, and the one that triggered this review. |

Tail-selector consumers (route through F1): `chat-room-surface.tsx:204` (swipe/action target),
`message-list-surface.tsx:199`, `use-guided-actions.ts:203,209`, `context-boundary.ts:26` (client);
`domain/chat/substrate/assemble-gather.ts:247` (server continue/guided anchor). Plus the generic wire
hygiene at `assembly/shape.ts:196` (`squashSameRole` / the empty-row filter) that keeps anchors out
of the assembled prompt — that one is NOT anchor-specific and survives any redesign.

The INVERSE consumer — the one that WANTS the anchor: the snapshot-resolution ladder,
`domain/rpg/persistence/snapshots.ts:113` (`lastVisibleAssistantSnapshot` — last assistant slot with
`excludedFromPrompt=false` → its selected variant's snapshot) and `resolveSnapshotBeforeSlot:176`
(VER-1a, seq-bounded lineage walk). The anchor's ONLY structural job is to give the hand-written
snapshot a position in this ladder.

### 1c. Consumers that SEE anchors UNFILTERED (the leak set — the defect class)

| # | Site | What leaks |
| - | - | - |
| L1 | `packages/server/src/domain/export/verbs/export-chat.ts:87-127` (`loadParsedMessages` — no anchor predicate anywhere in the file) → `#kit/serde/chat` `buildChatJsonl:537` (`mes: m.content`) and `buildChatTxt` | **both export formats** emit every anchor as a `"mes":""` row speaker-named via `resolveSpeakerName` → the synthetic Group card. This is the ST-parity leak the owner saw, and the source of the polluted flagship transcript. |
| L2 | `packages/server/src/domain/chat/memory/persistence/queries.ts:28-42` (`loadCanonThroughSeq` — unfiltered slot⋈variant read) | anchor rows enter DIGEST blocks: they occupy `blockSize` slots, perturb block boundaries + content hashes, and feed blank lines to the summarizer. |
| L3 | `packages/server/src/entry/compose/plugin-chat-reads.ts:46-57` | plugins read anchor rows as messages. |
| L4 | `packages/server/src/entry/compose/automation-watcher.ts:37-52` + the `messageCommitted` emit at `post-narrator-message.ts:71` | automation rules triggered on `messageCommitted` FIRE on anchor posts, with a `content:""` message fact — a hand tracker edit can trip a user's automation. |
| L5 | `packages/server/src/domain/discovery/themes/backfill.ts:29-49` (`readMessagesByChat` — unfiltered) | anchors count toward the position-median `msgMidAt` stamp (mild skew). |
| L6 | SSE fan-out: every client's query cache carries anchor rows (only the RENDER filters, F6) — 8 anchors = 8 cache rows + 8 committed events per demo game. |
| L7 | `domain/chat/verbs/fork.ts` copies anchor slots into every fork (necessarily — the game re-key `chat-ops/fork-game.ts` rides `slotIdMap`/`variantIdMap`). |
| L8 | Round-trip: `parseChatJsonl` keeps `mes:""` rows (only empty SWIPES drop, serde header line 9), and chat export carries NO game vertical — so an orb→orb export/import lands the anchors as permanent junk rows with no snapshots behind them. |
| L9 | `foundation/observability/debug/inspect/inspect-chat.ts` (raw, fine by design) and `domain/rpg/persistence/reveal.ts` (empty bodies yield no spans — harmless by construction). Listed for completeness. |

Counts/recency and search were checked and are already covered: chat-list stats filter (F3),
CEL count filters (F4), and `domain/search` operates over digests/segments/cards — no raw message
reads (`ls domain/search/persistence` = cards/digest-rows/display/image-nearest/nearest/scope), so
its only exposure is transitively via L2.

### 1d. Census side-findings (small, confirmed)

1. **Stale header** — `domain/rpg/persistence/snapshots.ts:105-107` (`findSnapshotById`): claims "a
   checkpoint may point at the BORN seed, whose `variantId` is null". No born seed exists (D108
   no-born-seed, confirmed at `verbs/game/create-game.ts:2` "NO born snapshot") and
   `rpg_snapshots.variantId` is `notNull` (`db/src/schema/rpg.ts:118-121`) — a null-variant row is
   unrepresentable today. Doc-rot from a pre-no-born-seed draft; the reader-by-id is still correct
   (restore reads by durable id), the RATIONALE sentence is fiction. Fix rides R1 (which makes the
   sentence true, ironically) or is a one-line header repair if (b) is not taken.
2. **The lane drop-patch re-spells the predicate** (F7) instead of importing `isStateAnchorSlot` —
   under the one-home law that is exactly the "new tail consumer hand-rolls findLast" regression the
   selector header names. Moot if the patch retires with this program; worth returning to the lane
   only if the patch is kept.

---

## 2. JUDGMENT — the shape

### What the anchor row actually is

The anchor has exactly ONE structural job: give a hand-written snapshot a POSITION in the
snapshot-resolution ladder, which orders by message `seq` and dereferences by `selectedVariantId`.
Everything else about it is costume: the role, the Group attribution, the empty variant, the
`excludedFromPrompt=false` flag held open so the ladder finds it. The costume is what leaks — every
plane that consumes "messages" (render, export, digest, plugin, automation, fork, seed, SSE, counts)
receives a non-message and must individually learn to spit it out. Seven filters exist today; L1-L8
are the planes that never learned.

Note what the anchor does NOT need from the message plane:

- **Swipe semantics — none.** An anchor slot has exactly one variant, never swiped (no reader can
  target it: swipe routes through `lastVisibleRow`, which skips it BY DESIGN). The variant-keying that
  is load-bearing for MODEL-flush snapshots (D121-F rewind: "a swipe rewinds BY CONSTRUCTION, each
  variant's snapshot is its truth" — schema header `rpg.ts:13`) is degenerate on an anchor.
- **Prompt participation — negative.** The shape stage deletes its body (`shape.ts:196`).
- **Recency/count participation — negative.** `canon-visibility.ts` exists to suppress it.
- **Attribution — negative.** The Group stamp is a liability, not a datum.

The one thing it needs is an ORDER STAMP relative to the story. An order stamp is a column, not a
fake message. And the rpg domain already has this exact pattern ratified: **`rpg_journal.variantId`
is nullable — a HAND journal entry stamps `variantId: NULL` (every-lineage) instead of minting an
anchor** (`schema/rpg.ts:204-236`, `RpgService.addJournalEntry` header). The hand-snapshot problem is
the same problem one plane over, solved the other way. Arm (b) is the journal's own precedent applied
to snapshots.

### Arm (b) — re-anchor non-turn snapshots off the message plane [RECOMMENDED]

**The law, one line: a snapshot row is variant-keyed IFF it was produced by that variant's own turn
flush. Every other snapshot write (the 7 hand doors, resync, populate — and, per fork 4, checkpoint
restore) is a HAND row: no messageId, no variantId, no posted message at all.**

Schema (`rpg_snapshots`): `messageId`/`variantId` become nullable; `variantId`'s unique index becomes
partial (`WHERE variant_id IS NOT NULL`); a new nullable `asOfMessageId` FK → `messages` with
`ON DELETE SET NULL`; a CHECK pins the two-arm shape (turn row: message+variant NOT NULL, asOf NULL ·
hand row: message+variant NULL). The discriminant is `variantId IS NULL` — the same XOR-shape
discipline as `rpg_sheets` (characterId XOR userId). `asOfMessageId` = the tail slot at write time
(NULL on a turnless game — orders before everything); ordering key = (seq of asOfMessageId, hand
rows AFTER the turn row of the same slot, then `createdAt`, then id), homed ONCE in
`persistence/snapshots.ts`.

Why `asOfMessageId` and not a bare `afterSeq` int: the FK rides the fork's existing `slotIdMap`
re-key machinery (`chat-ops/fork-game.ts`) with zero new mapping logic, and on a D106 FLOORED fork an
as-of slot that collapsed below the floor maps to nothing → SET NULL → the hand state orders "before
all visible history", which is exactly correct (state as of pre-baseline IS the baseline posture). A
seq int would need floor-offset remapping knowledge the fork op doesn't otherwise carry. SET NULL
also kills the standing footgun outright: today deleting an anchor row CASCADE-deletes its snapshot
(the `[[rpg-state-anchor-slots]]` "NEVER delete" warning); under (b) there is no message to delete
and a deleted as-of slot degrades ordering, never state.

Per-plane verdicts:

- **Swipe/rewind survival:** model-path snapshots byte-identical (untouched). Hand rows survive a
  swipe of any slot — which is TODAY'S semantics too (an anchor is its own slot; swiping an earlier
  slot never rewinds it). VER-1a/VER-1b (`resolveSnapshotBeforeSlot`, `resolveTurnSnapshotPair`)
  rework inside their one home: the lineage walk unions "hand rows with as-of seq strictly below the
  slot" — the same rows the current walk finds as anchor slots below the slot. D121-F's rewind
  asymmetry is unchanged in kind (the durable card/seat half was never swipe-volatile; the snapshot
  half stays variant-keyed where variants exist).
- **The ladder:** `resolveSnapshotForTurn` = the later of (rung-1's variant snapshot via the tail
  slot, the newest hand row); rungs 2-3 unchanged. ALL of this lands in `persistence/snapshots.ts` —
  the ladder was one-homed from birth, so (b)'s entire risk surface is one file plus the
  `snapshot-edit.ts` tail, guarded by the existing `swipe-consistency.suite.int.test.ts` +
  `persistence/snapshots.int.test.ts`.
- **Fork/export/import round-trip:** fork clones hand rows with gameId + asOf re-key (simpler than
  today — anchors no longer ride the message copy). Exports are clean BY CONSTRUCTION — no filter in
  `export-chat.ts`, ever. Round-trip imports carry no junk rows. ST parity: `"mes":""`/"Group" rows
  cannot exist because nothing mints them.
- **The seeder drop-patch retires** (F7): under (b) the predicate matches nothing — delete the
  patch, regenerate the flagship transcript (the TRANSCRIPTS lane is regenerating anyway; a
  transcript generated post-R1 exports clean).
- **Digests/search/automation/plugins/SSE/counts (L2-L6):** clean by construction; F2-F5's WHERE
  arms and F6's render filter are DELETED, not maintained. Hand edits stop emitting
  `messageCommitted`/`chatsChanged` entirely (rpg's own `emitBus` already carries the panel update)
  — automation phantom-fires (L4) die.
- **Which one-homed selectors collapse or die:** `isStateAnchorSlot` + `notStateAnchor` DIE (with
  their consumers' WHERE arms); `lastVisibleRow`/`lastVisibleAssistant` become trivial
  (`findLast`) — fork 3 decides keep-as-seam vs inline; the ladder's `lastVisibleAssistantSnapshot`
  is renamed to what it now is (last assistant slot's snapshot, no "visible" qualifier needed).
  Discovery's `synthetic` exclusion (F5) stays — the Group char still exists for RECAP/illustration
  narrator posts, which are real content.
- **`postNarratorMessage` gets its invariant enforced:** with the three ""-callers gone, every
  legitimate caller (restore notice, recaps, scene-merge, illustration, `[check:]` lines) posts real
  content — the op REFUSES blank content, making the leaking row class UNREPRESENTABLE at the write
  boundary (the §2.3 "every placement names its enforcer" answer; a `stamped-id write-boundary`
  -class test pins it).
- **Migration cost:** pre-launch NO-LEGACY — squash into `0000_baseline.sql` + regen (the doctrine's
  own DB rule), one D-entry (D123+) amending D108's non-nullable clause + superseding D111 W-A's
  mechanism (render-silent becomes moot) + retiring the Spine-Identity §2e register entry. Existing
  dev/demo DBs regenerate from seeds; the 8 live anchors in the demo db die with the regen. No data
  migration exists to write because pre-launch data is regenerable — this is exactly the window the
  NO-LEGACY posture exists to exploit.

Cost/risk, stated honestly: the ladder + VER-1a/1b rework is the highest-consequence code in the
domain (the duplicate-beat class was live-confirmed). Mitigation: the rework is confined to ONE
persistence file + one write tail; the swipe-consistency suite exists and extends; R3 below names
the proof set. This is also the arm the doctrine picks by default: KISS/YAGNI is suspended, one home
per concept is law, and "the shortcut impossible, not discouraged" is the stated design goal —
(b) makes the leak unrepresentable instead of policed.

### Arm (a) — a first-class row KIND [fallback, not recommended]

`messages.kind ∈ {message, state-anchor}` (or the anchor arm on a wider union), the predicate
becomes structural instead of the `trim()` heuristic, and a new gate forces every `from(messages)`
read outside an allowlist to carry the kind filter. Honest assessment: the predicate improves (no
content heuristic, no SQLite-vs-JS trim divergence risk — `canon-visibility.ts:14-17` documents that
exact fragility), the ladder/fork/VER code is untouched, and the gate culture here can genuinely
make the filter total. But: the rows still land on every plane (SSE cache, fork copies, round-trip
junk); the Group mint + model=None attribution remain; export/digest/plugin/automation each gain the
filter they're missing today — which is MORE per-consumer filtering, now merely enforced; and the
8-rows-per-burst explosion needs arm (c) grafted on. It is the scatter with a cop. Choose it only if
the ladder rework risk is judged unacceptable this close to the demo push.

### Arm (c) — coalesce N consecutive hand writes onto one anchor [mitigation rider only]

Mint the anchor's snapshot born `committed: 0` so the next hand write takes the existing in-place
branch (`snapshot-edit.ts:131`), and the next user send's `onUserCommit` locks it — 8 writes → 1
anchor. Cheap and mechanically sound (`commitSnapshotForVariant` already walks the tail slot), but
it leaves ≥1 blank row per burst on every plane, leaves every filter alive, and mutates a
potentially-checkpointed snapshot in place (a `createCheckpoint` between two writes of a burst would
have its labeled state silently edited — a new frozen-past violation of exactly the kind the
committed-head rule exists to prevent, fixable only with a checkpoint-reference check that adds
back the complexity it saved). Not a permanent fix; unnecessary under (b) where the burst costs N
invisible game-plane rows and nothing else.

### Arm (d) — anything better?

Considered and rejected: staging hand edits until the next turn flush (loses durability + violates
hand-edit-always-wins); in-place edit of committed heads with an undo log (violates the frozen-past
law checkpoints/swipes depend on); a dedicated `rpg_anchors` table (arm (b) with an extra table —
the nullable two-arm row IS the single-arm-union-seam shape the house style prefers, and the journal
already models it in-table). Nothing beats (b).

---

## 3. THE R-PROGRAM (staged, under arm (b))

- **R0 — the ruling.** Mint D123 (next free number): the variant-keyed-iff-turn-flush law, the
  two-arm `rpg_snapshots` shape, the `postNarratorMessage` no-blank refusal, the D108 FK-clause
  amendment, D111 W-A superseded-as-moot, the Spine-Identity §2e register entry retired. Baseline
  squash + regen in the same wave (D72 "a machine ships WITH its seal").
- **R1 — schema + the write tail.** `rpg_snapshots` two-arm shape (nullable message/variant,
  partial unique, `asOfMessageId` SET NULL, CHECK); `snapshot-edit.ts` clone-forward tail loses
  `postNarratorMessage` and inserts a hand row (as-of = current tail slot, NULL when turnless);
  `resync-from-story.ts` + `populate-from-character.ts` lose their `""` posts;
  `postNarratorMessage` refuses blank content; ladder + VER-1a/1b + `resolveTurnSnapshotPair` union
  the hand-row walk (ONE file, `persistence/snapshots.ts`); `fork-game.ts` clones hand rows
  (gameId + asOf re-key); the stale `findSnapshotById` header (§1d.1) becomes true — reword it.
- **R2 — the consumer collapse.** Delete `isStateAnchorSlot`, `notStateAnchor` +
  `canon-visibility.ts`, the F3/F4/F5 WHERE arms, the F6 render filter; simplify or inline the tail
  selectors (fork 3); retire the seeder drop-patch (coordinate landing order with the TRANSCRIPTS
  lane — the patch retires WITH the transcript regen, not before); regenerate the flagship + any
  fixture transcript that carries `"mes":""` rows.
- **R3 — the proof set.** Extend `swipe-consistency.suite.int.test.ts` + the persistence int tests:
  hand write on committed head mints ZERO message rows (assert message count unchanged across the
  write); 8-write burst → 8 hand rows, head = the last, panel state exact; ladder with interleaved
  turn/hand rows (hand-after-turn at the same as-of slot wins); VER-1a rebase with hand rows between
  slots; swipe of the tail slot with newer hand rows (hand state survives — today's semantics,
  pinned); turnless first hand write (NULL as-of); fork clone of hand rows incl. a floored fork
  (SET NULL arm); checkpoint create/restore round-trip on a hand-row head; export round-trip
  produces zero empty `mes` rows; `postNarratorMessage("")` refuses.

Retired debt on completion: F1-F7 (seven filters), L1-L8 (eight leak planes), the Group/model=None
attribution artifact on hand writes, the never-delete-anchor footgun, and the
`[[rpg-state-anchor-slots]]` memory's operational warnings (the orchestrator should retire/rewrite
that memory when R2 lands).

---

## 4. OWNER FORKS (each with the recommended arm marked)

1. **The arm.** (b) re-anchor off the message plane **[RECOMMENDED]** · (a) row KIND + gate-forced
   filters (fallback if ladder-rework risk is unacceptable right now) · (c) coalesce-only (declines
   the permanent fix; not what was asked).
2. **The hand row's order carrier.** `asOfMessageId` FK, SET NULL **[RECOMMENDED — rides the fork's
   slotIdMap, correct floored-fork degradation, kills the delete-cascade footgun]** · `afterSeq`
   int (simpler column, but needs fork floor-offset remap logic and keeps a seq-space liveness
   problem).
3. **The tail selectors after the collapse.** Keep `lastVisibleRow`/`lastVisibleAssistant` as the
   one-home tail seam with trivial impls (names become slightly dishonest — nothing is invisible
   anymore) · inline to plain `findLast` at the 6 consumers and delete the seam **[RECOMMENDED —
   the regression class the seam guarded dies with the rows; knip + no-dead-abstractions posture]**.
4. **Checkpoint restore.** Keep its snapshot variant-keyed to the visible notice line · make it a
   hand row too, notice stays pure prose **[RECOMMENDED — completes the one-line law "variant-keyed
   iff turn flush"; also means swiping a restore notice can never orphan the restored state]**.
5. **Transition sequencing with the LIVE TRANSCRIPTS lane.** Land R1 then regenerate transcripts and
   retire the drop-patch in the same wave **[RECOMMENDED]** · keep the drop-patch through one demo
   cycle as a belt (harmless — matches nothing post-R1 — but it is exactly the per-consumer filter
   class the owner ordered killed; if kept even briefly, it should at least import the contracts
   predicate rather than re-spelling it, §1d.2).

---

## 5. Verified clean / what my silence covers

- Read IN FULL this session: `.claude/agent-doctrine.md`, `AGENTS.md`, `Core-Laws-and-Precedents.md`,
  `Spine-Identity-and-Auth.md`, registry entries D1-D52 + D106-D122 (incl. D108/D109/D110/D111/D112
  verbatim and D121 all clauses), `contracts/chat/messages.ts`, `db/kit/canon-visibility.ts`,
  `domain/rpg/snapshot-edit.ts`, `domain/rpg/contract/service.ts`, `domain/chat/verbs/post-narrator-
  message.ts`, `domain/export/verbs/export-chat.ts`, `domain/chat/seeder/seed.ts` (+ the lane's
  uncommitted diff), `rpg_snapshots`/`rpg_journal` schema blocks, `persistence/snapshots.ts:100-230`
  (ladder + VER-1a/1b + insert paths), `fork-game.ts:1-80`, `memory/persistence/queries.ts:1-60`,
  `themes/backfill.ts:1-50`, `automation-watcher.ts:1-60`, `seed-demo-chats.ts`.
- Swept with ast-grep + literal grep (both, per the two-method absence rule): every
  `postNarratorMessage` / `isStateAnchorSlot` / `notStateAnchor` / `lastVisibleRow|lastVisibleAssistant`
  reference in `packages/**` (ts + tsx); every `from(messages)` reader in `packages/server/src`
  (12 files, each classified above); all `insertSnapshot` call sites (3 non-test); all
  `writeHandState`/`applyHandEdit` callers (7); all anchor-content minters (3).
- Confirmed: `domain/search` reads no raw messages; chat-list counts/recency and CEL messageCount
  are filtered; assembly drops anchor bodies; no born-seed snapshot exists; `onUserCommit` →
  `commitSnapshotForVariant` is the committed-lock mechanism; the TRANSCRIPTS drop-patch is
  uncommitted in worktree `agent-a2b4358196be304d7` only (not on main).
- NOT read (regions my census does not cover): `chat/engine/pipeline.ts` + `turn.ts` internals
  (the turn-flush snapshot write path — untouched by (b) by design, but its tests would catch a
  ladder regression), `chat/verbs/fork.ts` in full (only its role in L7/strip-belt confirmed via
  headers + fork-game.ts), the client CT suites, `chat-ops/flush.ts` + `staging.ts` internals,
  `demo-chats.ts` manifest details, the account-backup bundle's chat arm (assumed to ride the same
  serde — verify at R2 if it has a second chat serialization, which D121-D says it must not).
- `pnpm check` was NOT run: this is a design review of an owner-ordered reshape with no diff under
  review; the tree at `ef439b01` carries only an unrelated modified snap PNG.

## 6. Unconfirmed, low priority

- Whether any automation rule in the wild has actually fired on an anchor `messageCommitted` (L4 is
  a confirmed mechanism, not a confirmed occurrence).
- Whether the account-backup bundle exports chats through a path other than `#kit/serde/chat`
  (D121-D says one serialization core; not verified this session).
- Whether a floored fork re-seqs copied messages from 0 or preserves source seq (affects only the
  rejected `afterSeq` fork-2 arm; the recommended FK arm is indifferent).
