// domain/rpg/chat-ops/flush — the turn-completion FLUSH (rpg-design/05 §2.4-2.5 + the delivery-model amendment
// §4.6). At `onTurnCompleted` the turn's staged state + journal are written as a clone-forward snapshot keyed to
// the COMMITTED assistant variant, born `committed=0` (the next user send's `onUserCommit` locks it in). THE
// DELIVERY FORK picks the VEHICLE that produces this turn's delta; both funnel through ONE flush tail:
//   • cheap    — the flush runs `runToolRound` (a dedicated post-commit tool round: parallel tool calls,
//     `tool_choice:"required"` + a no_changes escape), whose parsed calls fold to the delta shape. On an
//     agent-sdk wire (no wire `tools[]`) that op degrades INSIDE itself to ONE structured-output call
//     producing the identical delta — a routing detail of the round, not a mode of its own.
//   • folded   — NO post-commit model call at all (R1): the CHARACTER turn already carried the same 7 tools
//     with `tool_choice:"auto"` and co-emitted its state alongside its prose, so the flush just folds the calls
//     the engine handed it. One model call per exchange instead of two. A folded turn whose connection could
//     not carry wire tools arrives with a `null` channel and falls back to `cheap`'s round — same delta, one
//     extra call, LOGGED (`onStateRoundPath`), never a silently dropped state write.
//   Identical durable outcome — the accumulator is the one flush home (W1a invariant); both vehicles share
//   the `stageStateRound` signature (input ids + base → delta).
//
// A turn that staged NOTHING (no tools fired, extraction returned an empty delta) writes NO snapshot — the take
// is `undefined` and the flush is a no-op (a byte-identical non-writing turn). Journal entries stamp the
// committed `{variantId, sourceMessageId}` (§2.5 — abort-atomic, lineage-keyed).
//
// THE WRITE BASE IS READ AT FLUSH START AND THE ROUND TAKES 0.8-2.9s — so a HAND EDIT can land inside the
// flight, and by D124 the hand row it writes OUTRANKS this slot's turn row (the human edited on top of that
// beat). Left alone that would shadow the turn's writes on every plane, including ones the human never touched.
// `writeFlush` therefore FOLDS its state into that hand row, arbitrated by
// the auto-locks the edit stamped — the human keeps what they claimed, the turn keeps the rest. Neither writer
// can erase the other any more; see `foldIntoShadowingHandRow` below and `snapshot-edit.ts`.
//
// WHAT A LOCK ATE IS PART OF THE TURN'S RECORD (#77). A pinned path drops this turn's write at either of two
// merges — the accumulator's (the base already carried the lock) or the fold's (a hand row landed mid-flight) —
// and the durable tool-call row must say so rather than report `applied` about a write no state carries. Both
// sites report their drops from `substrate/merge.ts` itself; the flush unions them onto the record below.
//
// CANCELLATION: the round is cancelable through `turn.signal`, minted by the flush
// barrier (see `../flush-barrier.ts` for why the character turn's own signal cannot serve). THE INVARIANT: a
// CANCELLED ROUND IS BYTE-IDENTICAL TO A NON-WRITING TURN — it refuses to write and discards its staging, and
// it never rolls back a write that already landed. `flushTurn` below states the reasoning.

import { coEmitsProseWithTools } from "@orb/contracts/connection";
import type { RpgExtractionMode, RpgFoldFallbackReason, RpgRecordedToolCall } from "@orb/contracts/rpg";
import { markLockSuppressions, recordToolCalls, rpgJournalTypeSchema } from "@orb/contracts/rpg";
import type { ChatTurnId, MessageId, MessageVariantId, RpgSnapshotId } from "@orb/kit/ids";
import type { RpgTurnContext } from "../../chat/index.ts";
import type { StagedPatch, StagedTurnFlush } from "../contract/params.ts";
import type { RpgContext, RpgGameRow, RpgRunToolRound } from "../contract/service.ts";
import type { RpgFlushOutcome } from "../contract/trace.ts";
import { findMessageSeq, writeStagedSnapshotAndJournal } from "../persistence/snapshots.ts";
import { recordTurnToolCalls } from "../persistence/turn-tool-calls.ts";
import { currentSnapshotState, foldTurnWriteIntoHandHead, snapshotStateBeforeSlot } from "../snapshot-edit.ts";
import { deriveTrackersReadOnly } from "../substrate/readonly-axis.ts";
import { isReconcileBeat } from "./reconcile-cadence.ts";

/** The committed assistant slot a completed turn flushes onto (the snapshot key + the journal lineage stamp)
 *  PLUS the character turn's already-resolved route + consent verdict the state round rides (F1/F2). */
interface CompletedTurn {
  readonly turnId: ChatTurnId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly turnConnection: RpgTurnContext;
  /** The round's cancellation, minted by the flush barrier (which is also this flush's in-flight registration —
   *  `flush-barrier.ts` explains why the character turn's own signal cannot serve). Threaded onto every arm that
   *  can SPEND, and re-read at the write boundary below. */
  readonly signal: AbortSignal;
}

/** Stage a state DELTA (from the dedicated post-commit tool round, or from the folded turn's own calls) into
 *  the turn's accumulator: ensure the bucket from the pre-slot base, overlay the state patch, append
 *  the journal entries. An EMPTY delta (no state keys, no journal) stages NOTHING — a "nothing changed this
 *  turn" round must not write a redundant clone-forward snapshot (the take then stays `undefined`,
 *  byte-identical to a non-writing turn). The delta is resolved by the mode's injected op below. */
// `runRound` is the mode's injected op (`RpgRunToolRound`) or the folded turn's own fold — they share this
// exact signature (`RpgStateRoundInput` → delta), so one param type covers both. `turn.turnConnection`
// (the character turn's already-resolved route + consent verdict) is threaded straight through to the round.
async function stageStateRound(
  ctx: RpgContext,
  game: RpgGameRow,
  turn: CompletedTurn,
  runRound: RpgRunToolRound,
): Promise<readonly RpgRecordedToolCall[] | undefined> {
  // A continuation's canon and reminder INCLUDE the selected slot, and its variant is extended in place. Its
  // delta therefore rebases on the current head. Every other turn creates a new variant and must exclude its
  // own slot (VER-1a), especially a swipe whose rejected sibling already has consequences. This mirrors the
  // gather's `regenSlotMessageId` fork so what the model was told and what its writes land on stay identical.
  const baseState = turn.turnConnection.kind === "continue" ? await currentSnapshotState(ctx, game) : await snapshotStateBeforeSlot(ctx, game, turn.messageId);
  const reconcile = await isReconcileBeat(ctx.db, game);
  const delta = await runRound({
    chatId: game.chatId,
    gameId: game.id,
    turnId: turn.turnId,
    messageId: turn.messageId,
    variantId: turn.variantId,
    baseState,
    turnConnection: turn.turnConnection,
    signal: turn.signal,
    reconcile,
  });
  const hasStatePatch = Object.keys(delta.statePatch).length > 0;
  if (!hasStatePatch && delta.journal.length === 0) {
    return delta.recordedToolCalls; // no state write, but a dropped/no_changes call still belongs in the trail
  }
  ctx.staging.ensure(turn.turnId, baseState);
  if (hasStatePatch) {
    ctx.staging.stage(turn.turnId, delta.statePatch);
  }
  for (const entry of delta.journal) {
    ctx.staging.stageJournal(turn.turnId, entry);
  }
  return delta.recordedToolCalls;
}

/** Re-READ a signal's LIVE abort flag. Deliberately a call, not a bare `signal.aborted`: the checker models
 *  `aborted` as a plain boolean and narrows it, so a second direct test after an earlier one is reported as
 *  always-false dead code — while in reality the flag flips ASYNCHRONOUSLY, mid-round, which is the entire
 *  point of re-reading it at the write boundary. Going through a call keeps the re-read honest instead of
 *  suppressing the rule that is (reasonably) confused by a mutable getter. */
function isCancelled(signal: AbortSignal): boolean {
  return signal.aborted;
}

/** The DEDICATED post-commit round each mode falls back to — a mapped Record, so a new `RpgExtractionMode`
 *  member without a row is a tsc error (§5.5). `folded` shares `cheap`'s round BY DESIGN: when the character
 *  turn could not carry the terminal tools, the honest thing is the same tool-vehicle round one beat later
 *  (the identical delta at the cost of one extra call), never a silent drop of the state write. */
const POST_COMMIT_ROUND: Readonly<Record<RpgExtractionMode, (ctx: RpgContext) => RpgRunToolRound>> = {
  cheap: (ctx) => ctx.runToolRound,
  folded: (ctx) => ctx.runToolRound,
};

/** The observability NAME of each mode's post-commit vehicle (the `path` reported when the fold didn't run) —
 *  a mapped Record beside the round table above, so the two can never disagree about what actually fired. */
const POST_COMMIT_PATH: Readonly<Record<RpgExtractionMode, "tool-round">> = {
  cheap: "tool-round",
  folded: "tool-round",
};

/** THE DELIVERY FORK (R1). `folded` mode takes the character turn's OWN co-emitted tool calls and folds them
 *  with ZERO further model calls; every other mode — and a `folded` turn whose connection could not carry
 *  terminal tools at all, whose wire would go MUTE if they rode, or whose declarations collided with registry
 *  tool names (`terminalToolCalls === null`: a tools-incapable model, an unbuildable mount, the fold-guarded
 *  local engine, or #1617's withheld channel) — runs its dedicated post-commit
 *  round exactly as before. An EMPTY call array also falls back: a quiet folded beat must explicitly emit
 *  `no_changes`, otherwise zero calls is indistinguishable from a model that ignored its bookkeeping tools.
 *
 *  THE ARRAY MAY CARRY MORE THAN ONE RECURSION DEPTH'S CALLS (#1604, since #1404). The pipeline partitions each
 *  depth's model-emitted calls by tool identity and ACCUMULATES the terminal half across the whole recurse loop
 *  (`engine/pipeline.ts::runRecurseLoop`), rather than re-reading the final aggregate economics — which keeps
 *  only the LAST depth's `toolCalls` and therefore ERASED a terminal call co-emitted with a registry call at
 *  depth 0. So a folded game that also attaches registry tools hands this fold several depths' worth of calls,
 *  in EMISSION ORDER (depth 0 first).
 *
 *  That is the right shape, and the fold needs no depth-awareness to honor it: `toolCallsToExtraction` folds
 *  the array exactly as it folds one completion's PARALLEL calls — same-plane calls ACCUMULATE (three
 *  `update_party` calls become three party entries) and the single-valued `scene` plane is LAST-WINS. Under
 *  emission order that reads correctly for a recursion: a later depth saw the earlier depth's tool RESULTS, so
 *  its scene supersedes, while every plane-array write from every depth survives. They are all genuine state
 *  calls from ONE turn; nothing about the depth they were emitted at makes one less true than another, and the
 *  depth itself is deliberately not carried — there is no rule here that would read it.
 *
 *  The resolution is ANNOUNCED on every flush (`onStateRoundPath`) — a fork that resolves silently would let a
 *  folded game quietly pay the second call forever with nothing in the trail to say so. */
/** WHY this flush is not folding, read off the TURN's own connection (the wire that actually ran — never a
 *  re-resolve). `null` = nothing was downgraded (the knob got what it asked for). The causes are distinct and
 *  each is the point of the WARN: a wire that co-emits but handed back no channel had no terminal capability at
 *  all; a wire that SILENCES prose under tool attachment was deliberately never mounted (D112's fold guard, gated
 *  PRE-commit at the gather off the same capability fact); and a COLLIDED declaration means the wire was fine
 *  and a contributor re-spelled a registry tool's name, so the channel was withheld on purpose (#1617 — read
 *  FIRST, because a collision also arrives as a `null` channel and would otherwise be reported as the
 *  wire's fault). Same round, same delta — different diagnosis, and they point at different people. */
function foldFallbackReason(turn: CompletedTurn, mode: RpgExtractionMode, calls: readonly unknown[] | null): RpgFoldFallbackReason | null {
  if (mode !== "folded") {
    return null;
  }
  if (calls !== null) {
    return calls.length === 0 ? "no-terminal-calls" : null;
  }
  if (turn.turnConnection.terminalToolsCollided.length > 0) {
    return "terminal-declaration-collided";
  }
  return coEmitsProseWithTools(turn.turnConnection.connection.capability) ? "no-terminal-channel" : "local-engine-fold-guard";
}

function resolveStateRound(ctx: RpgContext, game: RpgGameRow, turn: CompletedTurn, mode: RpgExtractionMode): RpgRunToolRound {
  const calls = mode === "folded" ? turn.turnConnection.terminalToolCalls : null;
  const shouldRound = calls === null || calls.length === 0;
  ctx.onStateRoundPath({
    chatId: game.chatId,
    gameId: game.id,
    turnId: turn.turnId,
    mode,
    path: shouldRound ? POST_COMMIT_PATH[mode] : "folded",
    fallbackReason: foldFallbackReason(turn, mode, calls),
  });
  if (shouldRound) {
    return POST_COMMIT_ROUND[mode](ctx);
  }
  return (input): ReturnType<RpgRunToolRound> => ctx.foldTurnToolCalls({ ...input, toolCalls: calls });
}

/** Write a taken flush: the clone-forward snapshot keyed to the committed variant + the staged journal entries
 *  stamped with that variant (§2.5). `now`/`snapshot id` are injected (determinism).
 *
 *  STRUCTURAL BACKSTOP (stickler F1): `writeStagedSnapshot` returns `{ok:false, reason}` when the assembled
 *  state is contract-INVALID (a `max <= 0` pool from a buggy applier, present or future). On refusal the ENTIRE
 *  flush is DROPPED — no snapshot, no journal, no bus emits — errors-as-data, mirroring the extraction's
 *  non-conforming empty-delta path — AND the drop is LOGGED with the field-level reason (never silent). The
 *  journal rides the SAME atomic drop: an entry keyed to a snapshot that never landed would be an orphan beat
 *  referencing a state the panel can't resolve. Canon stays uncorrupted by construction.
 *
 *  RETURNS the dotted paths the FOLD's hand locks suppressed (#77) — empty on every arm that folded nothing.
 *  The caller unions them with the accumulator's own and records the pair on the turn's tool calls — paired
 *  with the backstop's `droppedReason` (`null` ⇒ the flush WROTE), which the caller publishes on the settle
 *  event (#1493), the only place a reader learns this boundary is done. */
async function writeFlush(
  ctx: RpgContext,
  game: RpgGameRow,
  flush: StagedTurnFlush,
  turn: CompletedTurn,
): Promise<{ readonly suppressed: readonly string[]; readonly droppedReason: string | null }> {
  const snapshotId = ctx.ids.snapshot();
  // Parse and mint every journal row before the batch starts. A corrupt type therefore writes neither plane;
  // once valid, the snapshot statement and every journal insert share one same-DB commit boundary.
  const journal = flush.journal.map((entry) => ({
    id: ctx.ids.journal(),
    gameId: game.id,
    type: rpgJournalTypeSchema.parse(entry.type),
    title: entry.title,
    content: entry.content,
    variantId: turn.variantId,
    sourceMessageId: turn.messageId,
    createdAt: ctx.now(),
  }));
  const written = await writeStagedSnapshotAndJournal(
    ctx.db,
    flush.state,
    { id: snapshotId, gameId: game.id, messageId: turn.messageId, variantId: turn.variantId, now: ctx.now() },
    journal,
  );
  if (!written.ok) {
    // The state was contract-invalid — drop the whole flush (no snapshot, no journal, no emits). SURFACE the
    // drop (the F1 backstop staying silent is the exact visibility violation this program kills): the model
    // fired, produced applicable output, and it vanished — the log names WHICH field the write contract
    // rejected so the mismatch is root-causable from the provider trail, not a dark panel with no signal.
    ctx.onFlushDropped({ chatId: game.chatId, gameId: game.id, variantId: turn.variantId, reason: written.reason });
    return { suppressed: [], droppedReason: written.reason };
  }
  // HAND-EDIT-VS-FLUSH: a hand row may now OUTRANK the row we just wrote (the host edited the panel during
  // the round's 0.8-2.9s flight). Fold this turn's state into it, locks-honored, BEFORE the emits — so the
  // event names the row the panel will actually resolve. A durable write, hence its place here.
  const fold = await foldIntoShadowingHandRow(ctx, game, turn, { patches: flush.patches, snapshotId: written.row.id });

  // The tool/extraction flush wrote a clone-forward snapshot → the whole panel re-resolves (§4.9). A journal
  // flush additionally scopes the paged Journal. Emit AFTER the durable writes commit.
  ctx.emitBus({ type: "snapshotPatched", chatId: game.chatId, snapshotId: fold.headId });
  if (flush.journal.length > 0) {
    ctx.emitBus({ type: "journalChanged", chatId: game.chatId });
  }
  return { suppressed: fold.suppressed, droppedReason: null };
}

/** Fold this flush's state into a HAND ROW that shadows it, and return the snapshot id that is now HEAD (the
 *  fold's row when one landed, else the turn row's — the id the `snapshotPatched` event must carry, or the
 *  panel would re-resolve against a row it cannot see).
 *
 *  WHY a flush must do this at all: by D124 a hand row stamped at this slot outranks this slot's turn row — the
 *  human edited on top of that beat, and that ranking is CORRECT. But the hand row was cloned from a head that
 *  predates this flush's delta, so left alone it shadows the turn's writes on every plane, including the ones
 *  the human never touched. The fold is the merge this domain already has, arbitrated by the auto-locks the
 *  hand edit stamped (`snapshot-edit.ts::foldTurnWriteIntoHandHead`).
 *
 *  A REFUSED fold is LOGGED, never silent — the same posture as the write-boundary drop above: the turn's state
 *  stays shadowed (the pre-fix outcome), and the reason says so.
 *
 *  It also answers WHAT THE HAND'S LOCKS ATE (#77): only the `folded` arm can suppress anything, so every other
 *  arm returns nothing to say. */
async function foldIntoShadowingHandRow(
  ctx: RpgContext,
  game: RpgGameRow,
  turn: CompletedTurn,
  /** What this flush just wrote — the PATCHES it composed and the row it landed on (grouped: the two travel
   *  together and are meaningless apart). The patches, never the composed state: see the fold's own doc. */
  written: { readonly patches: readonly StagedPatch[]; readonly snapshotId: RpgSnapshotId },
): Promise<{ readonly headId: RpgSnapshotId; readonly suppressed: readonly string[] }> {
  const seq = await findMessageSeq(ctx.db, turn.messageId);
  if (seq === undefined) {
    // This turn's slot vanished (a racing delete) — there is no position to fold at.
    return { headId: written.snapshotId, suppressed: [] };
  }
  const outcome = await foldTurnWriteIntoHandHead(ctx, game, written, seq);
  if (outcome.kind === "refused" || outcome.kind === "shadowed") {
    // BOTH losing arms are LOUD. The `shadowed` arm is the one the verifier caught staying silent: the turn's
    // writes were erased and nothing in the trail said so, which is the exact blind spot `onFlushDropped`
    // exists to close (a round that produced applicable output and vanished). `refused` is the merge that was
    // attempted and rejected by the contract belt. The reason distinguishes them at the log.
    ctx.onFlushDropped({
      chatId: game.chatId,
      gameId: game.id,
      variantId: turn.variantId,
      reason: `hand-edit reconciliation ${outcome.kind}: ${outcome.reason}`,
    });
  }
  // EVERY arm answers with the row that is actually head — including the two losing ones, where it is NOT the
  // row this flush wrote. Emitting our own id there would point the panel at a row it cannot resolve.
  return { headId: outcome.headId, suppressed: outcome.kind === "folded" ? outcome.suppressed : [] };
}

/** The turn-completion flush (§2.4-2.5). A `cheap` game runs its DEDICATED post-commit tool round
 *  (`runToolRound`); a `folded` game folds the calls its character turn already co-emitted, and falls back to
 *  that same round when the fold could not ride. Each stages its delta into the accumulator; then take + write.
 *  A turn that staged nothing (empty delta / readonly / no-op) is a byte-identical non-writing turn.
 *
 *  READONLY GATE (stickler F2): a game whose RESOLVED connection has no write path for its mode
 *  (both surviving modes need `tools`) runs NO round — a per-turn model call that
 *  would predictably fail (`rpg.extraction.*`/`rpg.toolround.failed`) and, on hosted creds, cost real spend for
 *  a structurally-impossible write. The verdict is derived from the SAME connection the round would use (the
 *  character turn's `turnConnection`, F1) — never a re-resolve of the host's global default. The header law
 *  ("a game whose model has no writer capability never reaches here", compose/rpg.ts) is now ENFORCED here. */
async function flushWritableTurn(
  ctx: RpgContext,
  game: RpgGameRow,
  turn: CompletedTurn,
  /** The round's inputs and its OUTPUT LEDGER, grouped because they travel together. `settle` is written as
   *  each arm LEARNS its verdict and read by `flushTurn`'s outermost `finally` (#1493 residual): a returned
   *  value could not work, because the caller must still publish an honest settle when this function THROWS,
   *  and the truth at that moment ("the write landed, the disclosure write blew up") exists only here. It is
   *  born `failed`, so an arm that never updates it reports the throw it took. */
  round: { readonly mode: RpgGameRow["config"]["extractionMode"]; readonly settle: { outcome: RpgFlushOutcome; droppedReason: string | null } },
): Promise<void> {
  const { mode, settle } = round;
  // CANCELLED BEFORE WE EVEN START (the caller pressed Stop while an earlier speaker's round was still queued):
  // no reads, no round, no spend. Byte-identical to a non-writing turn.
  if (isCancelled(turn.signal)) {
    settle.outcome = "cancelled";
    ctx.onStateRoundCancelled({ chatId: game.chatId, gameId: game.id, turnId: turn.turnId, discardedStagedWrites: false });
    return;
  }
  const roundCalls = await stageStateRound(ctx, game, turn, resolveStateRound(ctx, game, turn, mode));
  // THE WRITE BOUNDARY, RE-READ: REFUSE TO WRITE, NEVER ROLL
  // BACK. A round that was cancelled while in flight discards whatever it staged and writes nothing — so a
  // cancelled round is byte-identical to a non-writing turn, the same errors-as-data invariant a failed
  // extraction already satisfies. Staging is cleared here for the same reason `onTurnAborted` clears it: a dead
  // turn's writes must never leak into the next turn's bucket.
  //
  // The other direction — rolling back a flush that ALREADY committed — is refused deliberately. Snapshot and
  // journal now share one batch, so there is no partial beat to undo; once that commit returns, its variant is
  // COMMITTED and on screen (D124's turn-row arm), and a later cancel may not erase it.
  if (isCancelled(turn.signal)) {
    const staged = ctx.staging.take(turn.turnId) !== undefined;
    settle.outcome = "cancelled";
    ctx.onStateRoundCancelled({ chatId: game.chatId, gameId: game.id, turnId: turn.turnId, discardedStagedWrites: staged });
    return;
  }
  // WHAT THE MODEL DID (TOOLCALLS-INVISIBLE, arm A), recorded on EVERY arm from here down — a folded turn
  // whose calls all dropped stages nothing, and that is precisely the turn a user most needs to see ("it
  // called update_scene and the schema refused it" is the answer to "why did nothing happen"). The `finally`
  // is what keeps that unconditional: a write that REFUSES, a fold that loses, or a throw out of the write
  // boundary all still leave the calls recorded, exactly as a record written before the write did.
  //
  // IT RUNS AFTER THE WRITE because part of the verdict does not exist until then: a hand LOCK suppresses
  // writes at TWO points — the accumulator's merge (the base already carried the lock) and the fold's replay
  // onto a mid-flight hand row — and a row written first would have to claim `applied` and be corrected by a
  // second write, which is the same lie with a shorter life (#77).
  const flush = ctx.staging.take(turn.turnId);
  const suppressed: string[] = [...(flush?.suppressedByLocks ?? [])];
  try {
    if (flush === undefined) {
      // The quiet beat: the round ran, staged nothing, and that IS its terminal state.
      settle.outcome = "no-writes";
    } else {
      const written = await writeFlush(ctx, game, flush, turn);
      suppressed.push(...written.suppressed);
      // WRITTEN INTO THE LEDGER THE INSTANT IT IS KNOWN, before the disclosure write below can throw: a
      // committed snapshot reported as `failed` because the tool-call record blew up afterwards would be
      // the same lie in the other direction.
      settle.outcome = written.droppedReason === null ? "wrote" : "dropped";
      settle.droppedReason = written.droppedReason;
    }
  } finally {
    await recordTurnCalls(ctx, game, turn, { roundCalls, suppressed });
  }
}

/** Keep the live panel pending for the whole post-commit vehicle, including its quiet/cancel/failure arms.
 *  The narrative turn finishes before this async flush, so chat's streaming phase alone cannot represent the
 *  gap. `finally` is load-bearing: every started lifecycle gets its matching settle even when a provider or
 *  write boundary throws, and the turn id lets concurrent rounds settle independently.
 *
 *  IT IS ALSO THE ONE SETTLE SITE (#1493 residual, verifier v-L2-tooling). The first cut raised
 *  `onFlushSettled` inside the write boundary's own `finally` and AFTER `recordTurnCalls`, which made it
 *  neither total nor last-word: a failed disclosure write, a throw out of `stageStateRound`, both cancel
 *  arms and the readonly return below all skipped it, and a barrier polling for the settle hung to its
 *  timeout on exactly those turns. Here it sits beside `stateRoundSettled` — the lifecycle closer that was
 *  already total — and the ledger the inner function writes is what makes the event honest about WHICH arm
 *  ended the round. */
export async function flushTurn(ctx: RpgContext, game: RpgGameRow, mode: RpgGameRow["config"]["extractionMode"], turn: CompletedTurn): Promise<void> {
  if (deriveTrackersReadOnly(mode, turn.turnConnection.connection.capability)) {
    // Manual-steering: the resolved connection has no write path for this mode — no round, no failing call.
    // It STILL settles, with the arm named: this game will never extract, and a reader (or a barrier) that
    // learns that immediately is told the truth, where silence reads exactly like a round still in flight.
    // No bus lifecycle, though — nothing was ever pending on the panel.
    ctx.onFlushSettled({ chatId: game.chatId, gameId: game.id, turnId: turn.turnId, outcome: "readonly", droppedReason: null });
    return;
  }
  ctx.emitBus({ type: "stateRoundStarted", chatId: game.chatId, turnId: turn.turnId });
  // Born `failed`: if the round throws before any arm records its verdict, that is precisely what happened.
  const settle: { outcome: RpgFlushOutcome; droppedReason: string | null } = { outcome: "failed", droppedReason: null };
  try {
    await flushWritableTurn(ctx, game, turn, { mode, settle });
  } finally {
    // SETTLE FIRST, then close the live lifecycle: both are fire-and-forget, and the observability event is
    // the one a barrier is waiting on.
    ctx.onFlushSettled({ chatId: game.chatId, gameId: game.id, turnId: turn.turnId, ...settle });
    ctx.emitBus({ type: "stateRoundSettled", chatId: game.chatId, turnId: turn.turnId });
  }
}

/** Record the state vehicle's calls, keyed to the committed variant. A folded turn contributes the calls it
 *  co-emitted with prose; a cheap/fallback round contributes the calls returned with its delta. The latter is
 *  a separate model request, but it is still what changed this visible turn's RPG state — omitting it made the
 *  durable inspector lie by absence after the in-memory trace ring rolled over. A vehicle that called NOTHING
 *  records nothing, so a quiet beat still has no empty disclosure.
 *
 *  The projection is `contracts/rpg`'s `recordToolCalls` — the SAME one the compose warn and the R-OBS ring
 *  read, so the row, the log and the trace cannot disagree about what was lost. `suppressed` adds the ONE
 *  thing those two cannot know (#77): the paths this turn's writes lost to a hand lock at the merge, unioned
 *  from both suppression sites and folded onto the calls by `markLockSuppressions` (which owns the rule for
 *  which calls may carry it). The ring and the warn keep the schema-only projection by design — they fire
 *  before any state is composed. */
async function recordTurnCalls(
  ctx: RpgContext,
  game: RpgGameRow,
  turn: CompletedTurn,
  /** What this turn's vehicle produced, grouped: the round's own recorded calls (absent on a folded turn,
   *  whose calls ride `turnConnection`) and what the two merges suppressed. They travel together — the record
   *  is written from exactly this pair and nothing else. */
  produced: { readonly roundCalls: readonly RpgRecordedToolCall[] | undefined; readonly suppressed: readonly string[] },
): Promise<void> {
  const recorded = produced.roundCalls ?? (turn.turnConnection.terminalToolCalls === null ? undefined : recordToolCalls(turn.turnConnection.terminalToolCalls));
  if (recorded === undefined || recorded.length === 0) {
    return;
  }
  const calls = markLockSuppressions(recorded, produced.suppressed);
  await recordTurnToolCalls(ctx.db, {
    id: ctx.ids.turnToolCalls(),
    gameId: game.id,
    messageId: turn.messageId,
    variantId: turn.variantId,
    calls,
    createdAt: ctx.now(),
  });
  // AFTER the durable write, like every other emit here. Its own event rather than `snapshotPatched`: a turn
  // whose calls all dropped writes this record and NO snapshot, so riding the snapshot event would leave the
  // failing turn's disclosure stale — exactly the turn the disclosure exists for.
  ctx.emitBus({ type: "turnToolCallsRecorded", chatId: game.chatId });
}
