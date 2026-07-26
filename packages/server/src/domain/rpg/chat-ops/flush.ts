// domain/rpg/chat-ops/flush — the turn-completion FLUSH (rpg-design/05 §2.4-2.5 + the delivery-model amendment
// §4.6). At `onTurnCompleted` the turn's staged state + journal are written as a clone-forward snapshot keyed to
// the COMMITTED assistant variant, born `committed=0` (the next user send's `onUserCommit` locks it in). BOTH
// delivery modes funnel through ONE flush tail:
//   • cheap    — the §4.5 tools staged into the accumulator DURING the turn; the flush just takes + writes.
//   • reliable — NO in-turn tools; the flush FIRST runs the injected `runExtraction` op (a dedicated
//     structured-output turn over the resolution-ladder base), stages its delta into the SAME accumulator, THEN
//     takes + writes. Identical durable outcome — the accumulator is the one flush home (W1a invariant).
//
// A turn that staged NOTHING (no tools fired, extraction returned an empty delta) writes NO snapshot — the take
// is `undefined` and the flush is a no-op (a byte-identical non-writing turn). Journal entries stamp the
// committed `{variantId, sourceMessageId}` (§2.5 — abort-atomic, lineage-keyed).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import { rpgJournalTypeSchema } from "@orb/contracts/rpg";
import type { ChatTurnId, MessageId, MessageVariantId } from "@orb/kit/ids";
import type { StagedTurnFlush } from "../contract/params";
import type { RpgContext, RpgGameRow } from "../contract/service";
import { snapshotRowToState } from "../contract/service";
import { insertJournalEntry } from "../persistence/journal";
import { resolveSnapshotForTurn, writeStagedSnapshot } from "../persistence/snapshots";
import { defaultSnapshotState } from "../substrate/default-state";

/** The committed assistant slot a completed turn flushes onto (the snapshot key + the journal lineage stamp). */
interface CompletedTurn {
  readonly turnId: ChatTurnId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
}

/** Resolve the reliable-mode extraction BASE — the resolution-ladder head for this turn (or the synthesized
 *  default for a turnless game). The extraction reasons against this; it is never re-resolved by the op. */
async function extractionBase(ctx: RpgContext, game: RpgGameRow): Promise<RpgSnapshotState> {
  const row = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
  return row === undefined ? defaultSnapshotState() : snapshotRowToState(row);
}

/** Reliable mode: run the extraction over the base, then stage its delta into the turn's accumulator (the SAME
 *  path cheap-mode tools use — ensure the bucket, overlay the state patch, append the journal entries). An EMPTY
 *  delta (no state keys, no journal) stages NOTHING — a "nothing changed this turn" extraction must not write a
 *  redundant clone-forward snapshot (the take then stays `undefined`, byte-identical to a non-writing turn). */
async function stageReliableExtraction(ctx: RpgContext, game: RpgGameRow, turn: CompletedTurn): Promise<void> {
  const baseState = await extractionBase(ctx, game);
  const delta = await ctx.runExtraction({
    chatId: game.chatId,
    gameId: game.id,
    turnId: turn.turnId,
    messageId: turn.messageId,
    variantId: turn.variantId,
    baseState,
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

/** Write a taken flush: the clone-forward snapshot keyed to the committed variant + the staged journal entries
 *  stamped with that variant (§2.5). `now`/`snapshot id` are injected (determinism).
 *
 *  STRUCTURAL BACKSTOP (stickler F1): `writeStagedSnapshot` returns `undefined` when the assembled state is
 *  contract-INVALID (a `max <= 0` pool from a buggy applier, present or future). On refusal the ENTIRE flush is
 *  DROPPED — no snapshot, no journal, no bus emits — errors-as-data, mirroring reliable-mode's non-conforming
 *  empty-delta path. The journal rides the SAME atomic drop: an entry keyed to a snapshot that never landed
 *  would be an orphan beat referencing a state the panel can't resolve. Canon stays uncorrupted by construction. */
async function writeFlush(ctx: RpgContext, game: RpgGameRow, flush: StagedTurnFlush, turn: CompletedTurn): Promise<void> {
  const snapshotId = ctx.ids.snapshot();
  const written = await writeStagedSnapshot(ctx.db, flush.state, {
    id: snapshotId,
    gameId: game.id,
    messageId: turn.messageId,
    variantId: turn.variantId,
    now: ctx.now(),
  });
  if (written === undefined) {
    return; // the state was contract-invalid — drop the whole flush (no snapshot, no journal, no emits)
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

/** The turn-completion flush (§2.4-2.5). Reliable mode runs the extraction into the accumulator first; then BOTH
 *  modes take + write. A turn that staged nothing is a no-op. */
export async function flushTurn(ctx: RpgContext, game: RpgGameRow, mode: RpgGameRow["config"]["extractionMode"], turn: CompletedTurn): Promise<void> {
  if (mode === "reliable") {
    await stageReliableExtraction(ctx, game, turn);
  }
  const flush = ctx.staging.take(turn.turnId);
  if (flush === undefined) {
    return; // nothing staged — a byte-identical non-writing turn
  }
  await writeFlush(ctx, game, flush, turn);
}
