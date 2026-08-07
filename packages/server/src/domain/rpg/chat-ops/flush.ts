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
// CANCELLATION (RPG-SIGNAL, 2026-08-03): the round is cancelable through `turn.signal`, minted by the flush
// barrier (see `../flush-barrier.ts` for why the character turn's own signal cannot serve). THE INVARIANT: a
// CANCELLED ROUND IS BYTE-IDENTICAL TO A NON-WRITING TURN — it refuses to write and discards its staging, and
// it never rolls back a write that already landed. `flushTurn` below states the reasoning.

import { coEmitsProseWithTools } from "@orb/contracts/connection";
import type { RpgExtractionMode, RpgFoldFallbackReason } from "@orb/contracts/rpg";
import { recordToolCalls, rpgJournalTypeSchema } from "@orb/contracts/rpg";
import type { ChatTurnId, MessageId, MessageVariantId } from "@orb/kit/ids";
import type { RpgTurnContext } from "../../chat/index.ts";
import type { StagedTurnFlush } from "../contract/params.ts";
import type { RpgContext, RpgGameRow, RpgRunToolRound } from "../contract/service.ts";
import { insertJournalEntry } from "../persistence/journal.ts";
import { writeStagedSnapshot } from "../persistence/snapshots.ts";
import { recordTurnToolCalls } from "../persistence/turn-tool-calls.ts";
import { snapshotStateBeforeSlot } from "../snapshot-edit.ts";
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
async function stageStateRound(ctx: RpgContext, game: RpgGameRow, turn: CompletedTurn, runRound: RpgRunToolRound): Promise<void> {
  // The state as of the slot BEFORE this turn (VER-1a — the base EXCLUDES this turn's own slot, so a reroll
  // never re-applies onto its own rejected sibling). The gather resolved the SAME reader for the turn's
  // reminder (VER-1b), so what the model was told and what its writes land on are one state.
  const baseState = await snapshotStateBeforeSlot(ctx, game, turn.messageId);
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
    return; // nothing extracted — do not stage (and thus do not write) an unchanged snapshot
  }
  ctx.staging.ensure(turn.turnId, baseState);
  if (hasStatePatch) {
    ctx.staging.stage(turn.turnId, delta.statePatch);
  }
  for (const entry of delta.journal) {
    ctx.staging.stageJournal(turn.turnId, entry);
  }
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
 *  terminal tools at all, or whose wire would go MUTE if they rode (`terminalToolCalls === null`: a
 *  tools-incapable model, an unbuildable mount, or the fold-guarded local engine) — runs its dedicated post-commit
 *  round exactly as before. An EMPTY call array is NOT a fallback: the fold ran and the model recorded nothing,
 *  which is a legitimate quiet beat the fold op logs as such.
 *
 *  The resolution is ANNOUNCED on every flush (`onStateRoundPath`) — a fork that resolves silently would let a
 *  folded game quietly pay the second call forever with nothing in the trail to say so. */
/** WHY this flush is not folding, read off the TURN's own connection (the wire that actually ran — never a
 *  re-resolve). `null` = nothing was downgraded (the knob got what it asked for). The two causes are distinct and
 *  both are the point of the WARN: a wire that co-emits but handed back no channel had no terminal capability at
 *  all; a wire that SILENCES prose under tool attachment was deliberately never mounted (D112's fold guard, gated
 *  PRE-commit at the gather off the same capability fact). Same round, same delta — different diagnosis. */
function foldFallbackReason(turn: CompletedTurn, mode: RpgExtractionMode, calls: readonly unknown[] | null): RpgFoldFallbackReason | null {
  if (mode !== "folded" || calls !== null) {
    return null;
  }
  return coEmitsProseWithTools(turn.turnConnection.connection.capability) ? "no-terminal-channel" : "local-engine-fold-guard";
}

function resolveStateRound(ctx: RpgContext, game: RpgGameRow, turn: CompletedTurn, mode: RpgExtractionMode): RpgRunToolRound {
  const calls = mode === "folded" ? turn.turnConnection.terminalToolCalls : null;
  ctx.onStateRoundPath({
    chatId: game.chatId,
    gameId: game.id,
    turnId: turn.turnId,
    mode,
    path: calls === null ? POST_COMMIT_PATH[mode] : "folded",
    fallbackReason: foldFallbackReason(turn, mode, calls),
  });
  if (calls === null) {
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
 *  referencing a state the panel can't resolve. Canon stays uncorrupted by construction. */
async function writeFlush(ctx: RpgContext, game: RpgGameRow, flush: StagedTurnFlush, turn: CompletedTurn): Promise<void> {
  const snapshotId = ctx.ids.snapshot();
  const written = await writeStagedSnapshot(ctx.db, flush.state, {
    id: snapshotId,
    gameId: game.id,
    messageId: turn.messageId,
    variantId: turn.variantId,
    now: ctx.now(),
  });
  if (!written.ok) {
    // The state was contract-invalid — drop the whole flush (no snapshot, no journal, no emits). SURFACE the
    // drop (the F1 backstop staying silent is the exact visibility violation this program kills): the model
    // fired, produced applicable output, and it vanished — the log names WHICH field the write contract
    // rejected so the mismatch is root-causable from the provider trail, not a dark panel with no signal.
    ctx.onFlushDropped({ chatId: game.chatId, gameId: game.id, variantId: turn.variantId, reason: written.reason });
    return;
  }
  await Promise.all(
    flush.journal.map((entry) =>
      insertJournalEntry(ctx.db, {
        id: ctx.ids.journal(),
        gameId: game.id,
        // The staged type is a plain string (the accumulator is type-blind); re-validate ∈ the journal-type
        // vocabulary at the write boundary — a corrupt type is a loud parse error, never a silent bad row.
        type: rpgJournalTypeSchema.parse(entry.type),
        title: entry.title,
        content: entry.content,
        variantId: turn.variantId, // the committed variant — the model entry's lineage stamp (§2.5)
        sourceMessageId: turn.messageId,
        createdAt: ctx.now(),
      }),
    ),
  );

  // The tool/extraction flush wrote a clone-forward snapshot → the whole panel re-resolves (§4.9). A journal
  // flush additionally scopes the paged Journal. Emit AFTER the durable writes commit.
  ctx.emitBus({ type: "snapshotPatched", chatId: game.chatId, snapshotId });
  if (flush.journal.length > 0) {
    ctx.emitBus({ type: "journalChanged", chatId: game.chatId });
  }
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
export async function flushTurn(ctx: RpgContext, game: RpgGameRow, mode: RpgGameRow["config"]["extractionMode"], turn: CompletedTurn): Promise<void> {
  if (deriveTrackersReadOnly(mode, turn.turnConnection.connection.capability)) {
    return; // manual-steering: the resolved connection has no write path for this mode — no round, no failing call
  }
  // CANCELLED BEFORE WE EVEN START (the caller pressed Stop while an earlier speaker's round was still queued):
  // no reads, no round, no spend. Byte-identical to a non-writing turn.
  if (isCancelled(turn.signal)) {
    ctx.onStateRoundCancelled({ chatId: game.chatId, gameId: game.id, turnId: turn.turnId, discardedStagedWrites: false });
    return;
  }
  await stageStateRound(ctx, game, turn, resolveStateRound(ctx, game, turn, mode));
  // THE WRITE BOUNDARY, RE-READ (the cancellation ruling, RPG-SIGNAL 2026-08-03): REFUSE TO WRITE, NEVER ROLL
  // BACK. A round that was cancelled while in flight discards whatever it staged and writes nothing — so a
  // cancelled round is byte-identical to a non-writing turn, the same errors-as-data invariant a failed
  // extraction already satisfies. Staging is cleared here for the same reason `onTurnAborted` clears it: a dead
  // turn's writes must never leak into the next turn's bucket.
  //
  // The other direction — rolling back a flush that ALREADY landed its snapshot — is refused deliberately. rpg
  // has no transaction spanning the snapshot row and its journal inserts, so an "undo" could only produce a
  // snapshot with a truncated journal: a state strictly worse than either endpoint. Once `writeFlush` starts it
  // runs to completion; a landed row is keyed to a variant that is COMMITTED and on screen (D124's turn-row
  // arm), so it is not orphaned by the cancel.
  if (isCancelled(turn.signal)) {
    const staged = ctx.staging.take(turn.turnId) !== undefined;
    ctx.onStateRoundCancelled({ chatId: game.chatId, gameId: game.id, turnId: turn.turnId, discardedStagedWrites: staged });
    return;
  }
  // WHAT THE MODEL DID, recorded BEFORE the staged-nothing return (TOOLCALLS-INVISIBLE, arm A). Deliberately
  // not inside `writeFlush`: a folded turn whose calls ALL dropped stages nothing and returns below, and that
  // is precisely the turn a user most needs to see — "it called update_scene and the schema refused it" is
  // the answer to "why did nothing happen", while a record gated on a successful write would show only the
  // turns that already worked.
  await recordFoldedTurnCalls(ctx, game, turn);
  const flush = ctx.staging.take(turn.turnId);
  if (flush === undefined) {
    return; // nothing staged — a byte-identical non-writing turn
  }
  await writeFlush(ctx, game, flush, turn);
}

/** Record this turn's folded tool calls, keyed to the committed variant. A NON-folded turn (every other
 *  vehicle) has no co-emitted calls and records nothing — the dedicated round's calls are its own model call's,
 *  not a description of the turn the user watched. A folded turn that called NOTHING also records nothing: a
 *  quiet beat has no story, and an empty row would render an empty disclosure on every quiet turn.
 *
 *  The projection is `contracts/rpg`'s `recordToolCalls` — the SAME one the compose warn and the R-OBS ring
 *  read, so the row, the log and the trace cannot disagree about what was lost. */
async function recordFoldedTurnCalls(ctx: RpgContext, game: RpgGameRow, turn: CompletedTurn): Promise<void> {
  const calls = turn.turnConnection.terminalToolCalls;
  if (calls === null || calls.length === 0) {
    return;
  }
  await recordTurnToolCalls(ctx.db, {
    id: ctx.ids.turnToolCalls(),
    gameId: game.id,
    messageId: turn.messageId,
    variantId: turn.variantId,
    calls: recordToolCalls(calls),
    createdAt: ctx.now(),
  });
  // AFTER the durable write, like every other emit here. Its own event rather than `snapshotPatched`: a turn
  // whose calls all dropped writes this record and NO snapshot, so riding the snapshot event would leave the
  // failing turn's disclosure stale — exactly the turn the disclosure exists for.
  ctx.emitBus({ type: "turnToolCallsRecorded", chatId: game.chatId });
}
