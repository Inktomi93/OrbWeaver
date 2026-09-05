// The audit-log writer. THREE spellings, one row shape: `logAudit` is the best-effort default — it writes
// one audit_logs row but never breaks the primary channel (suppress → count → drop), so an ordinary caller's
// action survives a degraded audit channel. The two `build*Statement` seams are the opposite bargain, for the
// privileged writes that must NOT survive it: they hand back an UNEXECUTED insert that rides the primary
// write's own `db.batch`, so the write and its forensic row commit together or not at all.
// ASSUMES(single-replica): the suppressed-failure window is module-scope, per-process. Surfaced on
// /api/_debug/db/stats via getAuditFailureSnapshot().

import type { Db } from "@orb/db";
import { auditLogs } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { getLog } from "./logger.ts";

let auditFailureCount = 0;
let firstFailureAt: number | null = null;
let lastFailureAt: number | null = null;
// Re-raise the suppressed failure as a structural warn every Nth occurrence.
const ALERT_EVERY = 25;

export interface AuditFailureSnapshot {
  count: number;
  firstFailureAt: number | null;
  lastFailureAt: number | null;
}

/** One audit event. `actorUserId` is null for system-initiated events (GC, cron, no real user).
 *  `entityId`/`entityType` are a soft-ref (no FK), both nullable for a global action. */
export interface AuditEntry {
  actorUserId: UserId | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export function getAuditFailureSnapshot(): AuditFailureSnapshot {
  return { count: auditFailureCount, firstFailureAt, lastFailureAt };
}

/** @internal — test seam for resetting the failure window between cases. */
export function resetAuditFailureCount(): void {
  auditFailureCount = 0;
  firstFailureAt = null;
  lastFailureAt = null;
}

function auditRow(entry: AuditEntry, createdAt: number): typeof auditLogs.$inferInsert {
  return {
    id: mintTypeId(ID_PREFIX.auditLog),
    action: entry.action,
    actorUserId: entry.actorUserId,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    metadata: entry.metadata ?? null,
    createdAt,
  };
}

/** Build one unexecuted audit insert for a primary workflow that must commit its forensic row atomically.
 *  Ordinary callers keep using {@link logAudit}; this narrow seam does not weaken its best-effort contract. */
export function buildAuditStatement(db: Db, entry: AuditEntry, createdAt: number): BatchStmt {
  return batchStmt(db.insert(auditLogs).values(auditRow(entry, createdAt)));
}

/**
 * {@link buildAuditStatement}'s CONDITIONAL twin: the row lands IF AND ONLY IF the statement IMMEDIATELY
 * BEFORE it in the same batch changed at least one row. For a privileged write whose own WHERE can match
 * nothing (an owner-immutability re-assertion, a row that vanished under the pre-check) this makes the
 * audit log a biconditional — the write without its forensic row is impossible, AND a refused write leaves
 * no row claiming it happened.
 *
 * `changes()` is CONNECTION-local and reports the immediately preceding statement, so ORDER IS THE WHOLE
 * CONTRACT: this must be the statement directly after the privileged write, in the same `db.batch`. Placed
 * anywhere else it reads some other statement's count — first in a batch it reads whatever that connection
 * last wrote, which is a phantom row. Callers do not assemble that order by hand: `domain/admin`'s
 * `commitAuditedWrite` is the one seam that builds the pair (house precedent for the guard itself:
 * `domain/automation/persistence/rules.ts::stampRuleFiredAfterReservationStatement`).
 *
 * The values are projected POSITIONALLY through `insert().select()`, which drizzle renders with the table's
 * full column list in declared order — so a new `audit_logs` column makes this a loud column-count error at
 * runtime (and `tests/server/foundation/observability/audit.int.test.ts` pins guarded ≡ unguarded row), never
 * a silently mis-bound column. `metadata` is hand-serialized because a raw `sql` param bypasses the column's
 * json mode.
 */
export function buildAuditStatementIfPrecedingWrote(db: Db, entry: AuditEntry, createdAt: number): BatchStmt {
  const row = auditRow(entry, createdAt);
  const metadata = row.metadata === null || row.metadata === undefined ? null : JSON.stringify(row.metadata);
  return batchStmt(
    db
      .insert(auditLogs)
      .select(sql`select ${row.id}, ${row.action}, ${row.actorUserId}, ${row.entityType}, ${row.entityId}, ${metadata}, ${row.createdAt} where changes() > 0`),
  );
}

/**
 * Best-effort audit write. The audit channel must never break the primary channel: log + count + drop.
 * `db` and `createdAt` are injected — no ambient `Date.now()` here.
 */
export async function logAudit(db: Db, entry: AuditEntry, createdAt: number): Promise<void> {
  try {
    await db.insert(auditLogs).values(auditRow(entry, createdAt));
  } catch (err) {
    auditFailureCount += 1;
    if (firstFailureAt === null) {
      firstFailureAt = createdAt;
    }
    lastFailureAt = createdAt;
    getLog().error({ err, action: entry.action, entityType: entry.entityType, entityId: entry.entityId }, "audit: write failed (suppressed)");
    if (auditFailureCount % ALERT_EVERY === 0) {
      getLog().warn(
        {
          security: true,
          event: "audit_sustained_failure",
          count: auditFailureCount,
          firstFailureAt,
          lastFailureAt,
        },
        `audit: ${auditFailureCount} writes have failed since boot — the audit channel is degraded`,
      );
    }
  }
}
