// domain/chat/substrate/runtime-variables — the D46 RUNTIME-PLANE cache derivation. The runtime variable state
// is the deterministic FOLD (`foldVarOps`) of each message's SELECTED-variant `variable_delta`, seq-ordered
// along the swipe chain (D26). It is materialized on `chats.runtime_variables` for O(1) reads and RECOMPUTED on
// every mutating event (turn commit / swipe select / delete / fork / move-reorder) — derive-don't-stamp, so a swipe/fork
// rewinds by re-folding (avoids the ST swipe-clobber issue #3263). This file owns the fold-composition + the cache UPDATE
// statement so the four mutators share ONE home (never diverge).
//
// TWO WRITE SHAPES, because the callers have different protection. The four canon MUTATORS refold inside the
// batch of a write they already serialize (a turn commit, a swipe/delete/move under the caller's own gate), so
// they take the bare {@link runtimeVariablesUpdateStatement}. The STANDALONE (out-of-turn) plane has no lock
// and never will — its callers are fire-and-forget automation/plugin ops — so it takes the guarded
// {@link standaloneVariableCasStatement}, which writes the log and its derived cache together, under a
// predicate that fails if another writer moved the log first (#1463 item 1).

import type { StandaloneVariableDelta } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chats } from "@orb/db";
import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { ChatId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { foldVarOps } from "@orb/kit/macro";
import { and, eq, sql } from "drizzle-orm";

/** The minimal fold input — a message's `seq` + the delta its selected variant applied. Structural so the
 *  `loadVariableDeltas` row (which also carries `messageId` for the mutators' override/filter) satisfies it. */
interface DeltaEntry {
  readonly seq: number;
  readonly delta: readonly VarOp[];
}

/** Fold seq-ordered per-message deltas into the runtime variable state (the `chats.runtime_variables` shape).
 *  Sorts by `seq` defensively (the query already orders, but a caller may splice an appended entry). */
export function foldChain(entries: readonly DeltaEntry[]): Record<string, string> {
  const ordered = entries.toSorted((a, b) => a.seq - b.seq);
  return foldVarOps(ordered.map((e) => e.delta));
}

/** Build the `chats.runtime_variables` cache UPDATE — rides the mutating event's EXISTING batch (atomic with the
 *  canon write / pointer flip / delete). An empty fold writes `null` (the "nothing folded" read contract, never
 *  a `{}` sentinel). */
export function runtimeVariablesUpdateStatement(db: Db, chatId: ChatId, cache: Record<string, string>): BatchStmt {
  const value = Object.keys(cache).length > 0 ? cache : null;
  return batchStmt(db.update(chats).set({ runtimeVariables: value }).where(eq(chats.id, chatId)));
}

/**
 * The standalone write's COMPARE-AND-SET: rewrite the delta log AND its folded cache in ONE statement, but
 * only if the log still holds the exact bytes the caller derived them from (`expectedRaw`, the stored TEXT —
 * `substrate/variable-ops.ts` owns the retry).
 *
 * ONE STATEMENT, not two, and that is load-bearing: the two columns are a log and its derivation, so a guard
 * on the log that let the cache write through unconditionally would publish a fold of a chain that is no
 * longer there. Splitting them across a batch cannot work either — the first statement changes the value the
 * second's predicate would test.
 *
 * THE PREDICATE IS THE VALUE (the house CAS idiom — `plugin-kv::compareAndSetKv`, `expectedContentHash` on
 * the edit doors), not a version column a future writer can forget to bump; `is` rather than `=` because the
 * column is nullable and NULL is the never-written state. `RETURNING` is POST-update, so a non-empty result
 * means THIS statement moved the row.
 */
export function standaloneVariableCasStatement(
  db: Db,
  chatId: ChatId,
  args: { readonly deltas: readonly StandaloneVariableDelta[]; readonly cache: Record<string, string>; readonly expectedRaw: string | null },
): AwaitableBatchStmt<{ readonly id: ChatId }[]> {
  const deltas = args.deltas.length > 0 ? args.deltas : null;
  const cache = Object.keys(args.cache).length > 0 ? args.cache : null;
  return db
    .update(chats)
    .set({ standaloneVariableDeltas: deltas, runtimeVariables: cache })
    .where(and(eq(chats.id, chatId), sql`${chats.standaloneVariableDeltas} is ${args.expectedRaw}`))
    .returning({ id: chats.id });
}
