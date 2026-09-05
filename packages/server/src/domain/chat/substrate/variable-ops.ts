// domain/chat/substrate/variable-ops — the STANDALONE (out-of-turn) runtime-variable write (automation-
// design/03 §1.1). The IN-TURN half is LIVE (a `{{setvar}}` records a `VarOp` on `assembleContext.opLog`,
// flushed to the produced variant's `variable_delta` at commit → `foldVarOps` → `chats.runtime_variables`).
// THIS is the half chat shipped without: an `applyVariableOps` made with NO turn in flight (an automation
// `set_variable` between turns) has no variant to attach to, so it appends a SEQ-STAMPED batch to
// `chats.standalone_variable_deltas` and refolds the cache in the SAME atomic statement — exactly like a
// swipe's re-fold. Seq-stamped at the chat's max message seq so a turn committed AFTER still overrides it (the
// fold interleaves by seq). Generic + principal-free (the injected op automation wires at compose; teaches
// chat nothing automation-shaped — the rpg/expressions op precedent).
//
// THE WRITE IS A COMPARE-AND-SET, because this plane has no lock and never will (#1463 item 1). Its callers
// are an automation arm executor, the analysis arm and the plugin-host membrane, all fire-and-forget on their
// own clocks; a read-modify-write with nothing guarding the write loses one of two concurrent ops outright —
// out of the FOLD and out of the durable log the fold is derived from, so nothing later heals it.
// `db.transaction` is banned and a batch may not read before it writes (`@orb/db/kit::batch`'s TRANSACTION
// MODE note), so the reachable shape is the predicate riding the write: rebuild from a snapshot, write it
// only if the log still holds that snapshot, and re-derive from the winner's state when it does not.
//
// A LOSS IS PROGRESS, NOT CONTENTION: every retry here is caused by ANOTHER writer having committed, so the
// loop cannot livelock — a bound exists only to convert a hypothetical unbounded spin (a bug elsewhere) into
// a loud, coded refusal instead of a hung caller.

import type { StandaloneVariableDelta } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { ChatContext } from "../context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import { loadMaxMessageSeq, loadStandaloneVariableDeltasRaw, loadVariableDeltas } from "../persistence/queries.ts";
import { foldChain, standaloneVariableCasStatement } from "./runtime-variables.ts";

/** How many times a standalone write re-derives after losing the CAS. Each loss means a sibling COMMITTED, so
 *  this is not a contention bound — it is the tripwire that turns an impossible spin into a coded refusal. */
const MAX_CAS_ATTEMPTS = 8;

/**
 * Apply `ops` as a standalone (out-of-turn) delta on the chat's runtime variable state: append a seq-stamped
 * batch to `chats.standalone_variable_deltas` and rewrite `chats.runtime_variables` = the fold of every
 * message-variant delta ∪ every standalone batch (incl. this one), in ONE atomic guarded statement. An empty
 * `ops` is a no-op (no write). The refold is byte-identical to the mutator refolds (swipe/delete/move) — the
 * runtime cache stays DERIVED, never authored.
 *
 * Concurrency: the write lands only if the delta log still holds the bytes this call derived from; otherwise
 * the whole derivation is redone against the winner's state (never merged from the stale snapshot — the
 * chain is the source of truth and a second writer's batch must fold into it, not beside it).
 */
export async function applyStandaloneVariableOps(ctx: ChatContext, chatId: ChatId, ops: readonly VarOp[]): Promise<void> {
  if (ops.length === 0) {
    return;
  }
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    // `loadVariableDeltas` returns the UNIFIED fold source (message deltas ∪ the existing standalone batches —
    // the null-`messageId` entries); `loadStandaloneVariableDeltasRaw` is the same column as STORED, which is
    // what the guard compares. Stamp the new batch at the current head seq so it folds after the last
    // committed message.
    const [maxSeq, current, stored] = await Promise.all([
      loadMaxMessageSeq(ctx.db, chatId),
      loadVariableDeltas(ctx.db, chatId),
      loadStandaloneVariableDeltasRaw(ctx.db, chatId),
    ]);
    if (stored === undefined) {
      return; // the chat row is gone (a racing delete) — the same silent no-op an unguarded UPDATE gave.
    }
    const batch: StandaloneVariableDelta = { seq: maxSeq, delta: [...ops] };
    const nextStandalone: StandaloneVariableDelta[] = [
      ...current.flatMap((e): StandaloneVariableDelta[] => (e.messageId === null ? [{ seq: e.seq, delta: [...e.delta] }] : [])),
      batch,
    ];
    const folded = foldChain([...current, batch]);
    const applied = await standaloneVariableCasStatement(ctx.db, chatId, { deltas: nextStandalone, cache: folded, expectedRaw: stored.raw });
    if (applied.length > 0) {
      return;
    }
  }
  throw new ChatOperationError(
    CHAT_OP_CODES.variableWriteContended,
    `chat ${chatId}: a standalone variable write lost ${MAX_CAS_ATTEMPTS} compare-and-set attempts`,
  );
}
