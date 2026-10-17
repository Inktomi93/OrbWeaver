// The audit-log writer. THREE spellings, one row shape: `logAudit` is the best-effort default — it writes
// one audit_logs row but never breaks the primary channel (suppress → count → drop), so an ordinary caller's
// action survives a degraded audit channel. The two `build*Statement` seams are the opposite bargain, for the
// privileged writes that must NOT survive it: they hand back an UNEXECUTED insert that rides the primary
// write's own `db.batch`, so the write and its forensic row commit together or not at all.
// ASSUMES(single-replica): the suppressed-failure window is module-scope, per-process. Surfaced on
// /api/_debug/db/stats via getAuditFailureSnapshot().

import type { Db } from "@orb/db";
import { auditLogs } from "@orb/db";
import type { BatchStmt } from "@orb/db/query";
import { batchStmt } from "@orb/db/query";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner, statementToken } from "@orb/db/wiring-owner";
import type { IdSource } from "@orb/kit/ids";
import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { AuditEntry, AuditWiring } from "./contract/audit-wiring.ts";
import { getLog } from "./logger.ts";

export type { AuditEntry } from "./contract/audit-wiring.ts";

let auditFailureCount = 0;
let firstFailureAt: number | null = null;
let lastFailureAt: number | null = null;
// Re-raise the suppressed failure as a structural warn every Nth occurrence.
const ALERT_EVERY = 25;

// @orb-waive no-inline-package-interface(AuditFailureSnapshot): baselined when the gate landed; burn-down item 952.
export interface AuditFailureSnapshot {
  count: number;
  firstFailureAt: number | null;
  lastFailureAt: number | null;
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

function auditRow(entry: AuditEntry, createdAt: number, idSource: IdSource): typeof auditLogs.$inferInsert {
  return {
    id: idSource.typeId(ID_PREFIX.auditLog),
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
export function buildAuditStatement(db: Db, entry: AuditEntry, createdAt: number, idSource: IdSource = createIdSource()): BatchStmt {
  return batchStmt(db.insert(auditLogs).values(auditRow(entry, createdAt, idSource)));
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
 * runtime (and `tests/legacy/server/foundation/observability/audit.int.test.ts` pins guarded ≡ unguarded row), never
 * a silently mis-bound column. `metadata` is hand-serialized because a raw `sql` param bypasses the column's
 * json mode.
 */
export function buildAuditStatementIfPrecedingWrote(db: Db, entry: AuditEntry, createdAt: number, idSource: IdSource = createIdSource()): BatchStmt {
  const row = auditRow(entry, createdAt, idSource);
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
export async function logAudit(db: Db, entry: AuditEntry, createdAt: number, idSource: IdSource = createIdSource()): Promise<void> {
  try {
    await db.insert(auditLogs).values(auditRow(entry, createdAt, idSource));
  } catch (err) {
    auditFailureCount += 1;
    firstFailureAt ??= createdAt;
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

/** Bind the guarded unexecuted audit insert; the privileged caller owns its adjacent batch position. */
export function createAuditStatementAfterWrite(db: Db, idSource: IdSource = createIdSource()): (entry: AuditEntry, at: number) => BatchStmt {
  return (entry, at) => buildAuditStatementIfPrecedingWrote(db, entry, at, idSource);
}

/** Bind audit operations without handing composition an executable co-statement. */
export function createAuditWiring(handle: DatabaseHandle, idSource: IdSource = createIdSource()): AuditWiring {
  const db = databaseForOwner(handle);
  return {
    log: (entry, at) => logAudit(db, entry, at, idSource),
    statement: (entry, at) => statementToken(buildAuditStatement(db, entry, at, idSource)),
    statementAfterWrite: (entry, at) => statementToken(buildAuditStatementIfPrecedingWrote(db, entry, at, idSource)),
  };
}
