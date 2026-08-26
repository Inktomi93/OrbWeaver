// The best-effort audit-log writer. `logAudit` writes one audit_logs row but never breaks the primary
// channel: suppress → count → drop. ASSUMES(single-replica): the failure window is module-scope,
// per-process. Surfaced on /api/_debug/db/stats via getAuditFailureSnapshot().

import type { Db } from "@orb/db";
import { auditLogs } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchStmt } from "@orb/db/kit";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
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
