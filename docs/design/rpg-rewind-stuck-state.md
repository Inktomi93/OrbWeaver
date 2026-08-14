# RPG-LITE REWIND/SWIPE — "state stuck" — diagnosis + game plan

> **Status: DIAGNOSED AND FIXED (arm A).** The mechanism below was confirmed deterministically at the
> integration tier — no live generation was needed. The fix was an architecture fork over the snapshot
> resolution ladder; the lane stopped, filed the fork, and the orchestrator ruled **arm A — walk the selected
> lineage** (2026-08-13), on the grounds that the current ladder *violated* recorded law (D26/D124) rather
> than merely underperforming, so this is enforcement, not new policy. Filed by the rpg dogfood lane against
> the owner's class report "rewinding swipes leaves state stuck" (no single repro).
>
> The diagnosis is kept in full because the *evidence* is the durable part: §3's measured arm receipts are
> what distinguish "answered correctly" from "answered correctly by accident", and that distinction is the
> whole defect.

## 1. The verdict in one paragraph

The head of the snapshot resolution ladder inspects **exactly one story slot**. When that slot's selected
variant carries no snapshot row — which is the *normal* case, because a beat that changed nothing writes no
snapshot — both ladder arms go dark and the head is answered by a **game-wide, story-position-blind
fallback ordered by `createdAt`**. In linear play that accidentally returns the right row. After any rewind
it returns a row from the abandoned future, **including the snapshot belonging to the very sibling variant
the swipe just navigated away from**. The panel, the steering reminder and every hand-edit base then read
that row. This contradicts D26/D124's stated promise that "each variant's snapshot is its truth; a swipe
rewinds by construction".

## 2. The mechanism, with receipts

All line references are `packages/server/src/domain/rpg/persistence/snapshots.ts` unless stated.

### 2a. The turn arm inspects ONE slot and does not walk back

`turnRung` (`snapshots.ts:195`) selects the last visible assistant slot, reads its `selectedVariantId`, and
looks up that variant's snapshot:

```ts
const slot = rows[0];                                   // the LAST assistant slot, full stop
const variantId = slot?.selectedVariantId ?? null;
if (slot === undefined || variantId === null) return;
const row = await findSnapshotByVariant(db, variantId);
return row === undefined ? undefined : { row, pos: {...} };   // ← no walk to the previous slot
```

A selected variant with no snapshot yields `undefined` for the whole arm. There is no descent to the
previous slot on the same selected lineage.

### 2b. A snapshot-less variant is the NORMAL case, not an edge

`chat-ops/flush.ts` states it in its own header (lines 17-19) and enforces it at
`flush.ts:303-305` / `stageStateRound`'s early return (`flush.ts:86-88`):

> "A turn that staged NOTHING (no tools fired, extraction returned an empty delta) writes NO snapshot — the
> take is `undefined` and the flush is a no-op (a byte-identical non-writing turn)."

Games are born in `folded` mode (owner ruling 2026-08-01, `tests/.../_support.ts::liteConfig`), where a beat
whose character turn co-emitted no tool calls stages nothing. **Most beats change no tracked state.** So the
turn arm is dark for most of a real game, not occasionally.

Other reachable producers of the same hole: a game created mid-chat (every earlier variant predates the
game), a flush dropped by the F1 write-boundary backstop (`flush.ts:178`), and a cancelled state round
(`flush.ts:291`).

### 2c. The fallback that answers instead is position-blind and has no slot exclusion

`resolveSnapshotHead` (`snapshots.ts:316`):

```ts
const head = laterRung(await turnRung(db, game.chatId), await handRung(db, game.id));
if (head !== undefined) { ... }
const row = await latestSnapshot(db, game.id);          // ← no excludeMessageId here
return row === undefined ? undefined : { row, arm: "fallback", seq: NO_SEQ };
```

`latestSnapshot` (`snapshots.ts:269`) orders by `desc(createdAt), desc(id)` over the whole GAME, preferring
`committed=1`. It takes an `excludeMessageId` parameter — but **only `resolveSnapshotBeforeSlot` passes it**
(`snapshots.ts:349`). The HEAD walk passes nothing, so the head is free to resolve a snapshot keyed to a
variant that is *not selected*, at the very slot the user just swiped.

`handRung` at the head is likewise **unbounded** (`snapshots.ts:317` — no `HandWalkBound`), so a hand row
stamped at a later as-of slot also survives a rewind. Same class, second door.

## 3. The instrumented evidence

A temporary probe (`tests/server/domain/rpg/zz-rpgdog-ladder-probe.int.test.ts`, run and then deleted —
probes do not live in the tree) drove the real persistence layer over a real DB and logged the resolved
`{arm, seq, location}` at each step.

**PROBE-C — ordinary LINEAR play, quiet tail beat (the control):**

```
beat 1 assistant → snapshot "the ford", committed
beat 2 assistant → QUIET, no snapshot
[PROBE-C] head: {"arm":"fallback","seq":-1,"location":"the ford"}   ✓ passes
```

The ladder is already dark in normal play. The answer is right **by accident** — `createdAt` order happens
to agree with story order while nothing has been rewound. This is why the bug has no single repro and why
nobody caught it: the failing machinery is load-bearing on every quiet beat and silently correct.

**PROBE-A — swipe the tail slot to a quiet sibling:**

```
before swipe: {"arm":"turn","seq":2, location:"the keep"}
after  swipe: {"arm":"fallback","seq":-1, location:"the keep"}
resolved location after swipe: "the keep"
AssertionError: expected 'the keep' to be ''
```

The row the head resolves after the swipe is `rpg_snapshot_A`, keyed to `variant_chat_a_2_0` — **the
variant that is no longer selected**. The honest answer for a variant that established nothing is the state
as of before its slot (here, the born default `""`).

**PROBE-B — same swipe with a real earlier beat present:**

```
beat 1 → "the ford" (committed, on the selected lineage)
beat 2 → "the keep" (committed)
swipe beat 2 to a quiet sibling
[PROBE-B] head after swipe: {"arm":"fallback","seq":-1, location:"the keep"}
AssertionError: expected 'the keep' to be 'the ford'
```

This is the sharpest form: **the correct row exists, is committed, and sits on the currently selected
lineage — and the walk never reaches it.** The user rewound past beat 2 and the panel kept beat 2's state.

## 4. Candidate mechanisms, ranked

| # | Candidate | Verdict |
|---|---|---|
| 1 | **The turn arm does not walk down the lineage; the head's fallback is `createdAt`-ordered and slot-blind** | **CONFIRMED** — §2, §3. Explains the class, the absence of a single repro, and why linear play looks fine. |
| 2 | `handRung` unbounded at the head, so a hand row survives a rewind | **RETRACTED — this is RULED BEHAVIOUR, not a defect.** It was a reading-only inference and it was wrong; see §5b for the two verbatim texts and the pre-existing test that pin it. Kept in the table because a future reader will re-derive it and should find the refusal, not repeat it. |
| 3 | `updateConfig` rebuilding features resets panel-local state on a swipe | **NOT IMPLICATED** for this symptom. `mergeConfig` threads every field keep-on-omit and is not on the swipe path at all. |
| 4 | The staging accumulator leaking one turn's writes into the next | **NOT IMPLICATED** — `onTurnAborted` and the cancel path both clear staging (`flush.ts:291-295`); the stuck value comes from a *persisted* row, which the probe reads directly. |
| 5 | Client cache not invalidating on a swipe | **NOT THE ROOT** — the server hands the client the wrong state; a correct invalidation refetches the same wrong row. Worth a separate check only after #1 is fixed. |

## 5. The fork — RULED: arm A

All three arms change the head of the ladder, which feeds the panel, the steering reminder/gather, every
hand-edit write base (`snapshot-edit.ts::resolveHead`), the flush's rank comparison
(`foldTurnWriteIntoHandHead`) and checkpoint restore. That is a codebase-wide consequence, so the lane
stopped here.

**A. Walk the selected lineage (recommended).** `turnRung` descends assistant slots until it finds one whose
*selected* variant has a snapshot. This is what "each variant's snapshot is its truth" actually means, and
it makes the `createdAt` fallback near-dead (it would then fire only for a game with no lineage rows at
all). Cost: the walk is N queries or one join; every consumer of `arm`/`seq` must be re-read, because a
row's rung would now be a real story position instead of `NO_SEQ`. Must be paired with bounding `handRung`
at the head (#2 above) or the second door stays open.

**B. Exclude non-selected variants from the fallback.** Add the missing `excludeMessageId` (or a
selected-variant join) to the head's `latestSnapshot` call. Smallest diff, kills PROBE-A/PROBE-B's exact
shape. Leaves the fallback position-blind, so a rewind past *several* beats can still land on a
chronologically-newer row from another slot.

**C. Never leave a variant snapshot-less.** Write a clone-forward row on every flush, quiet or not. The read
side then needs no change at all. Cost: reverses the explicit "a turn that staged NOTHING writes NO
snapshot — byte-identical to a non-writing turn" law (`flush.ts` header), and adds a row per beat per
variant.

### 5a. What was BUILT (arm A, ruled 2026-08-13)

- **`turnRung` walks the selected lineage.** One query: `messages ⋈ rpg_snapshots ON variantId =
  selectedVariantId`, assistant + visible + game-scoped, `order by seq desc limit 1`. A slot whose selected
  variant carries no row simply does not join, which IS the "keep walking" semantic. `rpg_snapshots.variantId`
  is UNIQUE among non-null, so the join is 1:1 and no loop is needed.
- **The `latestSnapshot` fallback is kept but scoped to the LIVE lineage.** Ruling condition 2 said demote,
  do not delete. Walking the lineage fixed the common shape, but the residue where BOTH arms are dark still
  handed back a dead variant's row (caught by this lane's own new tests going red against the half-built fix —
  see §6a). The fallback now refuses rows whose variant is selected nowhere; hand rows (`variantId IS NULL`)
  stay eligible unconditionally, because a hand write has no variant to rewind with.
- **The `inPlace` tip test is now EXPLICIT.** The 2026-08-07 HAND-EDIT-VS-FLUSH fix read `arm === "turn"` as
  "this row is at the ladder's tip" — true only *because* the arm inspected one slot. With the walk, an
  earlier uncommitted draft comes back wearing `turn`, which would have silently reopened that loss. The hand
  door now compares the head's `seq` against `findLatestAssistantSlotSeq`, the same "which beat is the story
  on" reader the flush's fold uses.

### 5b. REFUSED, with the receipt — bounding the hand arm at the head

The fork message listed "`handRung` is unbounded at the head" as a second door of the same class, and the
ruling asked for it in the same pass. **The lane refused it.** That finding was reading-only and it is wrong:
the behaviour is RULED, and two independent texts say so.

`persistence/snapshots.ts`, this file's own header, verbatim:

> "A hand row survives a swipe of any slot — the same semantics the anchor slot had (an anchor was its own
> slot, so swiping an earlier slot never rewound it)."

`db/schema/rpg.ts:142`, verbatim:

> "NULL on a hand row: a hand write has no variant to rewind with."

And it is already pinned by a test that predates this lane —
`tests/server/domain/rpg/persistence/snapshots.int.test.ts`, *"a hand row SURVIVES a swipe of the tail slot
(today's semantics, pinned)"* — which passes both before and after this change.

A hand row is a HUMAN DECISION about the world, positioned at a beat; it is not a variant's consequence, so
there is nothing for a swipe to rewind. Bounding it would have reversed a recorded ruling to satisfy a
finding the lane itself had only *read*, never driven. Left alone. If the owner wants hand rows to rewind
with a swipe, that is a deliberate reversal of the two texts above and belongs to them, not to a lane.

## 6. The permanent regression tests

The probe is gone; four TRANSITION tests replaced it in
`tests/server/domain/rpg/persistence/snapshots.int.test.ts`, describe *"RPG-REWIND-STUCK — the turn arm WALKS
the selected lineage; a swipe rewinds"*. They assert both sides of the swipe, not endpoints
(merge-clear-needs-a-transition-test):

1. swiping to a quiet sibling rewinds to the previous beat — **and swiping BACK returns**;
2. the head never resolves a non-selected sibling's row, even when it is the only snapshot in the game;
3. linear play with a quiet tail beat resolves through the **`turn` arm at the right `seq`**, not the
   fallback — this pins the MACHINERY, because pinning the answer alone would not have caught the defect;
4. the walk stays on the selected lineage (an unselected earlier sibling is skipped, not picked up).

### 6a. Red-first receipt

Against `HEAD`'s source (both files restored via `git show`, run, restored): **4 failed | 27 passed**. The 27
pre-existing ladder/hand-arm assertions were green on the old source, so the new tests isolate the defect and
nothing existing was weakened to accommodate them. Against the fix: 31 passed. Whole rpg integration tree:
**44 files / 383 tests passed**, including `hand-edit-vs-flush.suite`, `swipe-consistency.suite`, `flush.int`,
`gather.int`, `checkpoints` and `restore-checkpoint`.

An intermediate receipt worth keeping: with the lineage walk in but the fallback un-scoped, tests 2 and 4 were
still RED. The walk alone did not finish the job — that is what produced §5a's second bullet.

## 7. The live probe an evening session should still run

The mechanism did **not** need live generation — §3 settled it, and §6 now guards it. What a live drive is
still owed is the *user-visible* confirmation: the tests prove the ladder resolves the right ROW, not that the
host SEES the right panel (`done ≠ rendered`, and the client's own invalidation is candidate #5, untested).

1. Start a lite game on a fresh chat, born `folded` (the default). Confirm the panel is engaged.
2. Play three beats that MOVE state — say a location change, an HP tick and a quest create. Confirm the panel
   shows beat 3's state.
3. Play one beat that changes nothing (a pure-dialogue reply). **Check `/api/_debug`** or the server log for
   `onStateRoundPath` — you want the `folded` path with no tool calls, i.e. a quiet beat that wrote no
   snapshot. This is the premise that the hole is common; it is worth confirming against a real model rather
   than a fixture, because how often a real turn goes quiet is an empirical question.
4. Swipe that quiet beat to a new variant. **Observe the panel.** It must rewind to beat 3's predecessor —
   never the abandoned sibling's state.
5. Swipe BACK to the original variant. The state must track the selection in both directions with zero writes.
   If the row is right (assert via the debug endpoint) but the panel is stale, the residue is client-side
   invalidation — candidate #5 — and that is a separate, smaller lane.
6. Repeat 4-5 with a HAND EDIT made at beat 3 first. The hand row MUST survive the rewind — that is ruled
   behaviour (§5b), so a hand edit that vanishes on a swipe is a NEW defect, not this one.

Capture, for each step: the panel's rendered location/tracker readings, and the resolved
`{arm, seq, snapshotId}` from the server. The `arm` value is the whole diagnosis — **a `"fallback"` on a game
that has lineage rows now means something has regressed.**

## 8. Blast radius — every consumer of the head, and what covers it

| Touched consumer | Why it moves | Its coverage |
|---|---|---|
| the PANEL (`chat-ops/tracker-view.ts` → `currentSnapshotState`) | reads the head for every plane | `tracker-view.int`, `get-tracker-view.int`, `swipe-consistency.suite` |
| the REMINDER / gather | same reader, so the model is told what the host sees | `gather.int`, `field-reachability.suite` (64 tests) |
| the FLUSH's rank comparison (`foldTurnWriteIntoHandHead`) | compares `arm`/`seq` against the head | `hand-edit-vs-flush.suite`, `flush.int` |
| the HAND DOOR's `inPlace` (`snapshot-edit.ts::resolveHead`) | `arm === "turn"` stopped implying "at the tip" (§5a) | `hand-edit-vs-flush.suite` (window B is exactly this), `edit-snapshot.int`, `patch-actor.int` |
| CHECKPOINTS | restore reads by id, not by ladder — unaffected, verified not merely assumed | `checkpoints.int`, `restore-checkpoint.int` |

All green: 44 files / 383 tests in the rpg integration tree. The surgery did not go outside these consumers,
which was the lane's stop-and-fall-back tripwire.
