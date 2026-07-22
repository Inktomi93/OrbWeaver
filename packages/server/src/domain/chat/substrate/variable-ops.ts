// domain/chat/substrate/variable-ops — the STANDALONE (out-of-turn) runtime-variable write (automation-
// design/03 §1.1). The IN-TURN half is LIVE (a `{{setvar}}` records a `VarOp` on `assembleContext.opLog`,
// flushed to the produced variant's `variable_delta` at commit → `foldVarOps` → `chats.runtime_variables`).
// THIS is the half chat shipped without: an `applyVariableOps` made with NO turn in flight (an automation
// `set_variable` between turns) has no variant to attach to, so it appends a SEQ-STAMPED batch to
// `chats.standalone_variable_deltas` and refolds the cache in the SAME atomic batch — exactly like a swipe's
// re-fold. Seq-stamped at the chat's max message seq so a turn committed AFTER still overrides it (the fold
// interleaves by seq). Generic + principal-free (the injected op automation wires at compose; teaches chat
// nothing automation-shaped — the rpg/expressions op precedent).

import type { StandaloneVariableDelta } from "@orb/contracts/chat";
import { batchMany } from "@orb/db/kit";
import type { ChatId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { ChatContext } from "../context";
import { loadMaxMessageSeq, loadVariableDeltas } from "../persistence/queries";
import { foldChain, runtimeVariablesUpdateStatement, standaloneVariableDeltasUpdateStatement } from "./runtime-variables";

/**
 * Apply `ops` as a standalone (out-of-turn) delta on the chat's runtime variable state: append a seq-stamped
 * batch to `chats.standalone_variable_deltas` and rewrite `chats.runtime_variables` = the fold of every
 * message-variant delta ∪ every standalone batch (incl. this one), in ONE atomic batch. An empty `ops` is a
 * no-op (no write). The refold is byte-identical to the mutator refolds (swipe/delete/move) — the runtime
 * cache stays DERIVED, never authored.
 */
export async function applyStandaloneVariableOps(ctx: ChatContext, chatId: ChatId, ops: readonly VarOp[]): Promise<void> {
  if (ops.length === 0) {
    return;
  }
  // `loadVariableDeltas` returns the UNIFIED fold source (message deltas ∪ the existing standalone batches —
  // the null-`messageId` entries). Stamp the new batch at the current head seq so it folds after the last
  // committed message.
  const [maxSeq, current] = await Promise.all([loadMaxMessageSeq(ctx.db, chatId), loadVariableDeltas(ctx.db, chatId)]);
  const batch: StandaloneVariableDelta = { seq: maxSeq, delta: [...ops] };
  const nextStandalone: StandaloneVariableDelta[] = [
    ...current.flatMap((e): StandaloneVariableDelta[] => (e.messageId === null ? [{ seq: e.seq, delta: [...e.delta] }] : [])),
    batch,
  ];
  const folded = foldChain([...current, batch]);
  await ctx.db.batch(
    batchMany([standaloneVariableDeltasUpdateStatement(ctx.db, chatId, nextStandalone), runtimeVariablesUpdateStatement(ctx.db, chatId, folded)]),
  );
}
