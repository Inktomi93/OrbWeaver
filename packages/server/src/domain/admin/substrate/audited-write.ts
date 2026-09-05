// domain/admin/substrate — THE ONE SEAM THAT COMMITS A PRIVILEGED WRITE (#1691).
//
// Every admin verb that mints an account, rotates a credential, or moves authority routes its durable write
// through here, and the reason is a failure mode that four verbs shared: the privileged UPDATE/INSERT ran
// FIRST and its security-relevant tails ran afterwards as separate awaits. Both directions of that were
// broken. In production the audit tail is `logAudit`, which suppresses → counts → drops, so a dead audit
// channel returned 200 for an account that exists with NO forensic record. The session-revoke tail is a real
// DB write that CAN reject, so a failed kick rejected the endpoint with the new password already committed —
// the credential rotated and every old session still live, which is the exact state a password reset exists
// to end.
//
// The fix is one atomic batch per verb: [privileged write, guarded audit insert, …DB tails]. `db.batch` is
// the only atomic unit available (`db.transaction()` is banned in product code; see `@orb/db/kit`'s
// TRANSACTION-MODE note) and these batches are WRITES ONLY — no SELECT rides ahead of them, so the DEFERRED
// snapshot upgrade the note warns about is unreachable.
//
// THE AUDIT INSERT IS ALWAYS STATEMENT 2, and that is why the assembly lives here rather than at each verb:
// its guard is SQLite `changes()`, which is connection-local and reports the IMMEDIATELY preceding statement
// (`buildAuditStatementIfPrecedingWrote`). Statement 2 makes the audit row a biconditional with the write —
// a write that matched nothing (a lost owner-immutability race, a row deleted under the pre-check) leaves no
// row claiming it happened, and a write that landed cannot lose its record. Put a tail between them and the
// audit silently reads the TAIL's row count instead: `resetPassword`'s kick legitimately changes 0 rows when
// the target holds no sessions, which would have dropped the audit row for every reset of a signed-out user.
// `tests/server/domain/admin/verbs/reset-password.int.test.ts` pins exactly that case.
//
// NON-DB tails do not belong in `tails` and are the caller's, AFTER the returned promise resolves: the W7a
// socket eviction (`sessions.evictUserSockets`) and the `identityChanged` user-bus emit. Both are
// synchronous, void and total by construction, and neither is a durable fact — the committed rows are.

import type { AwaitableBatchStmt, BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { AuditEntry } from "#foundation/observability";
import type { AdminContext } from "../context.ts";

/** File-local (never exported — a shape a domain exports belongs in `contract/`): what one audited privileged
 *  write is made of. `write` is UNEXECUTED and carries `.returning(...)`; `at` is the one instant stamping the
 *  whole batch (the caller's injected clock); `tails` are further DB writes that must not outlive the write. */
interface AuditedWrite<TRow> {
  readonly write: AwaitableBatchStmt<TRow[]>;
  readonly entry: AuditEntry;
  readonly at: number;
  readonly tails?: readonly BatchStmt[];
}

/**
 * Commit one privileged write, its audit row, and any DB-side tails as a single atomic batch; resolves to
 * the write's own `RETURNING` rows (EMPTY when a conditional write matched nothing — the caller owns that
 * refusal, and no audit row was written for it).
 */
export async function commitAuditedWrite<TRow>(ctx: AdminContext, args: AuditedWrite<TRow>): Promise<TRow[]> {
  const results = await ctx.db.batch(batchMany([args.write, ctx.auditStatementAfterWrite(args.entry, args.at), ...(args.tails ?? [])]));
  // Statement 1 is the primary write; `batchMany` erases the tuple type, so the first result is re-narrowed
  // to its RETURNING shape here (the house shape — `domain/chat/verbs/claim-chat.ts`).
  return results[0] as TRow[];
}
