// domain/rpg/chat-ops/flush — the turn-completion FLUSH (rpg-design/05 §2.4-2.5 + the delivery-model amendment
// §4.6). At `onTurnCompleted` the turn's staged state + journal are written as a clone-forward snapshot keyed to
// the COMMITTED assistant variant, born `committed=0` (the next user send's `onUserCommit` locks it in). BOTH
// delivery modes run a DEDICATED post-commit STATE ROUND (owner ruling 2026-07-27 — the char turn is always
// tool-less prose; state is captured by its own request), then funnel through ONE flush tail:
//   • reliable — the flush runs `runExtraction` (a dedicated structured-output turn over the resolution-ladder
//     base), stages its delta into the accumulator, THEN takes + writes.
//   • cheap    — the flush runs `runToolRound` (a dedicated tool round: parallel tool calls, `tool_choice`
//     "required" + a no_changes escape), whose parsed calls fold to the SAME delta shape, stages, THEN writes.
//   Identical durable outcome — the accumulator is the one flush home (W1a invariant); the two rounds share the
//   `stageStateRound` signature (input ids + base → delta).
//
// A turn that staged NOTHING (no tools fired, extraction returned an empty delta) writes NO snapshot — the take
// is `undefined` and the flush is a no-op (a byte-identical non-writing turn). Journal entries stamp the
// committed `{variantId, sourceMessageId}` (§2.5 — abort-atomic, lineage-keyed).

import type { RpgSnapshotState } from "@orb/contracts/rpg";
import { rpgJournalTypeSchema } from "@orb/contracts/rpg";
import type { ChatTurnId, MessageId, MessageVariantId } from "@orb/kit/ids";
import type { RpgTurnContext } from "../../chat";
import type { StagedTurnFlush } from "../contract/params";
import type { RpgContext, RpgGameRow, RpgRunExtraction } from "../contract/service";
import { snapshotRowToState } from "../contract/service";
import { insertJournalEntry } from "../persistence/journal";
import { countSnapshots, resolveSnapshotForTurn, writeStagedSnapshot } from "../persistence/snapshots";
import { defaultSnapshotState } from "../substrate/default-state";
import { deriveTrackersReadOnly } from "../substrate/readonly-axis";

/** The committed assistant slot a completed turn flushes onto (the snapshot key + the journal lineage stamp)
 *  PLUS the character turn's already-resolved route + consent verdict the state round rides (F1/F2). */
interface CompletedTurn {
  readonly turnId: ChatTurnId;
  readonly messageId: MessageId;
  readonly variantId: MessageVariantId;
  readonly turnConnection: RpgTurnContext;
}

/** Resolve the reliable-mode extraction BASE — the resolution-ladder head for this turn (or the synthesized
 *  default for a turnless game). The extraction reasons against this; it is never re-resolved by the op. */
async function extractionBase(ctx: RpgContext, game: RpgGameRow): Promise<RpgSnapshotState> {
  const row = await resolveSnapshotForTurn(ctx.db, { id: game.id, chatId: game.chatId });
  return row === undefined ? defaultSnapshotState() : snapshotRowToState(row);
}

/** The RECONCILE-CADENCE beat check (crunchy-cluster §1.3): is THIS flush the `reconcileEveryBeats`-th? Derived
 *  from a cheap snapshot COUNT (never a stamped counter) — the count read BEFORE this flush's own write is the
 *  number of PRIOR beats, so this beat's ordinal is `count + 1`. A reconcile fires when `(count + 1) % N === 0`
 *  (beat N, 2N, 3N…); `N === 0` is OFF (opt-out — never reconcile, byte-identical to the pre-cadence round).
 *  On a reconcile beat the round re-emits the full refreshable planes so a deep story's panel self-heals against
 *  drift; locks stay lock-protected at the merge (a reconcile never clobbers a hand-pin). */
async function isReconcileBeat(ctx: RpgContext, game: RpgGameRow): Promise<boolean> {
  const n = game.config.reconcileEveryBeats;
  if (n <= 0) {
    return false; // opt-out — reconcile disabled for this game
  }
  const priorBeats = await countSnapshots(ctx.db, game.id);
  return (priorBeats + 1) % n === 0;
}

/** Stage a state DELTA (from either dedicated state round — reliable's extraction OR cheap's tool round) into
 *  the turn's accumulator: ensure the bucket from the resolution-ladder base, overlay the state patch, append
 *  the journal entries. An EMPTY delta (no state keys, no journal) stages NOTHING — a "nothing changed this
 *  turn" round must not write a redundant clone-forward snapshot (the take then stays `undefined`,
 *  byte-identical to a non-writing turn). The delta is resolved by the mode's injected op below. */
// `runRound` is the mode's injected op — `RpgRunExtraction` (reliable) or `RpgRunToolRound` (cheap); they
// share this exact signature (`RpgStateRoundInput` → delta), so one param type covers both. `turn.turnConnection`
// (the character turn's already-resolved route + consent verdict) is threaded straight through to the round.
async function stageStateRound(ctx: RpgContext, game: RpgGameRow, turn: CompletedTurn, runRound: RpgRunExtraction): Promise<void> {
  const baseState = await extractionBase(ctx, game);
  const reconcile = await isReconcileBeat(ctx, game);
  const delta = await runRound({
    chatId: game.chatId,
    gameId: game.id,
    turnId: turn.turnId,
    messageId: turn.messageId,
    variantId: turn.variantId,
    baseState,
    turnConnection: turn.turnConnection,
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

/** Write a taken flush: the clone-forward snapshot keyed to the committed variant + the staged journal entries
 *  stamped with that variant (§2.5). `now`/`snapshot id` are injected (determinism).
 *
 *  STRUCTURAL BACKSTOP (stickler F1): `writeStagedSnapshot` returns `{ok:false, reason}` when the assembled
 *  state is contract-INVALID (a `max <= 0` pool from a buggy applier, present or future). On refusal the ENTIRE
 *  flush is DROPPED — no snapshot, no journal, no bus emits — errors-as-data, mirroring reliable-mode's
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

/** The turn-completion flush (§2.4-2.5). BOTH write modes run a DEDICATED STATE ROUND post-commit (owner
 *  ruling 2026-07-27 — cheap + reliable are structurally symmetric): reliable → `runExtraction` (schema),
 *  cheap → `runToolRound` (parallel tool calls). Each stages its delta into the accumulator; then take + write.
 *  A turn that staged nothing (empty delta / readonly / no-op) is a byte-identical non-writing turn.
 *
 *  READONLY GATE (stickler F2): a game whose RESOLVED connection has no write path for its mode
 *  (`cheap` needs `tools`, `reliable` needs `output.structured`) runs NO round — a per-turn model call that
 *  would predictably fail (`rpg.extraction.*`/`rpg.toolround.failed`) and, on hosted creds, cost real spend for
 *  a structurally-impossible write. The verdict is derived from the SAME connection the round would use (the
 *  character turn's `turnConnection`, F1) — never a re-resolve of the host's global default. The header law
 *  ("a game whose model has no writer capability never reaches here", compose/rpg.ts) is now ENFORCED here. */
export async function flushTurn(ctx: RpgContext, game: RpgGameRow, mode: RpgGameRow["config"]["extractionMode"], turn: CompletedTurn): Promise<void> {
  if (deriveTrackersReadOnly(mode, turn.turnConnection.connection.capability)) {
    return; // manual-steering: the resolved connection has no write path for this mode — no round, no failing call
  }
  // `RpgExtractionMode` is exactly {reliable, cheap} — the else IS cheap (no redundant re-check).
  const round = mode === "reliable" ? ctx.runExtraction : ctx.runToolRound;
  await stageStateRound(ctx, game, turn, round);
  const flush = ctx.staging.take(turn.turnId);
  if (flush === undefined) {
    return; // nothing staged — a byte-identical non-writing turn
  }
  await writeFlush(ctx, game, flush, turn);
}
