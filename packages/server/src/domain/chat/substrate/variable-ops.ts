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
// THE SNAPSHOT IS ONE READ. The rebuilt array and the predicate's bytes must come from the same statement —
// two reads of the guarded column reopen the same lost update INSIDE the guard (#1634 item 1). See the loop.
//
// A LOSS IS PROGRESS, NOT CONTENTION: every retry here is caused by ANOTHER writer having committed, so the
// loop cannot livelock — a bound exists only to convert a hypothetical unbounded spin (a bug elsewhere) into
// a loud, coded refusal instead of a hung caller.
//
// THE CAS ABOVE GUARDS THE LOG, NOT THE VALUE (#1555), and those are different promises. It guarantees that no
// batch is dropped: two writers that both `set clock=2/6` BOTH land, and the fold takes the later one. That is
// exactly right for an unconditional assignment and exactly wrong for a READ-MODIFY-WRITE — a caller that read
// `1/6` and computed `2/6` needs the write to fail when somebody else already moved it. So the caller may
// attach `VariablePrecondition`s: beliefs about the CURRENT fold, checked against the same snapshot the ops are
// derived over, INSIDE the retry loop (a CAS loss re-derives the fold, so the beliefs are re-judged against the
// winner's state — never against the stale one that lost). A violated belief writes nothing and answers
// `{ outcome: "stale", actual }`; `actual` is the live value of each precondition key so the caller retries
// without a second read (a second read is its own window).

import type { StandaloneVariableDelta, VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import type { ChatContext } from "../context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import { loadMaxMessageSeq, loadMessageVariableDeltas, loadStandaloneVariableDeltasWithRaw, toStandaloneFoldRow } from "../persistence/queries.ts";
import { foldChain, standaloneVariableCasStatement } from "./runtime-variables.ts";

/** The live value of every precondition key in `fold` (`null` = unset) — what a `stale` refusal hands back so
 *  the caller re-derives from the winner's state instead of taking a second read of its own. Scoped to the keys
 *  the caller ASKED about: a refusal is not a licence to dump the room's whole variable plane. */
function actualOf(fold: Record<string, string>, expect: readonly VariablePrecondition[]): Record<string, string | null> {
  return Object.fromEntries(expect.map((p) => [p.key, Object.hasOwn(fold, p.key) ? (fold[p.key] ?? null) : null]));
}

/** Does every belief still hold against `fold`? An absent key reads as `null`, so "I believe this is unset" is
 *  expressible and is not the same claim as "I believe this is the empty string". */
function preconditionsHold(fold: Record<string, string>, expect: readonly VariablePrecondition[]): boolean {
  return expect.every((p) => (Object.hasOwn(fold, p.key) ? (fold[p.key] ?? null) : null) === p.expected);
}

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
 *
 * `expect` (#1555) is the caller's optional compare-and-set over the VALUES: every precondition is judged
 * against the fold this call is writing over, and a violated one refuses `{ outcome: "stale", actual }` having
 * written nothing. See the header for why the log-level CAS above does not cover this.
 */
export async function applyStandaloneVariableOps(
  ctx: ChatContext,
  chatId: ChatId,
  ops: readonly VarOp[],
  expect: readonly VariablePrecondition[] = [],
): Promise<VariableWriteResult> {
  if (ops.length === 0) {
    return { outcome: "applied" };
  }
  for (let attempt = 0; attempt < MAX_CAS_ATTEMPTS; attempt += 1) {
    // ONE READ OF THE GUARDED COLUMN, and that is the whole correctness of the guard (#1634 item 1): the
    // rebuilt array and the predicate's bytes come from the SAME `loadStandaloneVariableDeltasWithRaw` row.
    // Reading the column twice (once parsed for the derivation, once raw for the predicate) let a sibling
    // commit BETWEEN the two — the CAS would then pass against the sibling's bytes while `nextStandalone` was
    // rebuilt from the pre-sibling chain, dropping the sibling's batch through the guard. The MESSAGE half is
    // a different table and is read separately; a turn committing beside this write refolds the whole chain
    // from the durable log at commit, which is what heals that (narrower, pre-existing) interleaving.
    // Stamp the new batch at the current head seq so it folds after the last committed message.
    const [maxSeq, messageEntries, stored] = await Promise.all([
      loadMaxMessageSeq(ctx.db, chatId),
      loadMessageVariableDeltas(ctx.db, chatId),
      loadStandaloneVariableDeltasWithRaw(ctx.db, chatId),
    ]);
    if (stored === undefined) {
      // The chat row is gone (a racing delete) — the same silent no-op an unguarded UPDATE gave, reported as
      // `applied` because there is no longer a reader who could tell the difference (a `stale` here would send
      // a retrying caller round the loop against a chat that no longer exists).
      return { outcome: "applied" };
    }
    const chain = [...messageEntries, ...stored.deltas.map(toStandaloneFoldRow)];
    if (expect.length > 0) {
      // JUDGED ON THE SAME SNAPSHOT THE OPS FOLD OVER — the fold WITHOUT this call's batch is exactly the state
      // the caller claims to have read. Inside the loop deliberately: a CAS loss re-reads, so a retry re-judges
      // against the winner rather than landing a computation derived from the state that just lost.
      const live = foldChain(chain);
      if (!preconditionsHold(live, expect)) {
        return { outcome: "stale", actual: actualOf(live, expect) };
      }
    }
    const batch: StandaloneVariableDelta = { seq: maxSeq, delta: [...ops] };
    const nextStandalone: StandaloneVariableDelta[] = [...stored.deltas.map((e) => ({ seq: e.seq, delta: [...e.delta] })), batch];
    const folded = foldChain([...chain, batch]);
    const applied = await standaloneVariableCasStatement(ctx.db, chatId, { deltas: nextStandalone, cache: folded, expectedRaw: stored.raw });
    if (applied.length > 0) {
      return { outcome: "applied" };
    }
  }
  throw new ChatOperationError(
    CHAT_OP_CODES.variableWriteContended,
    `chat ${chatId}: a standalone variable write lost ${MAX_CAS_ATTEMPTS} compare-and-set attempts`,
  );
}
