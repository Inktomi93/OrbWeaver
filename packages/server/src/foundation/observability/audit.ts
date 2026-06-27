// foundation/observability/audit — the best-effort audit-log writer (MOVED here from neo's `_shared`;
// shared-dissolution §6). `logAudit` writes one `audit_logs` row but NEVER breaks the primary channel:
// suppress → count → drop. The `db` handle is INJECTED (passed in), so foundation closes over no db
// singleton; the `Db` type + the `audit_logs` table are imported DOWN from @orb/db (a lower package — the
// `foundation-reaches-up-to-nothing` rule explicitly permits @orb/db).
//
// ASSUMES(single-replica): the failure window is module-scope, per-process (cleared by restart, not by a
// success). Surfaced on /api/_debug/db/stats via `getAuditFailureSnapshot()`.

import type { Db } from "@orb/db";
import { auditLogs } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { getLog } from "./logger";

// Sticky failure-of-the-audit-channel record (process-lifetime) — the mode behind "audits silently stopped
// landing." A sustained problem also trips a warn below so it surfaces without polling.
let auditFailureCount = 0;
let firstFailureAt: number | null = null;
let lastFailureAt: number | null = null;
// Re-raise the suppressed failure as a structural warn every Nth occurrence — high enough that one rare
// flap doesn't spam, low enough that a sustained outage trips within seconds of real audit traffic.
const ALERT_EVERY = 25;

/** The audit-channel failure window (count + first/last timestamps). Foundation-internal; surfaced as JSON
 *  by the debug stats probe. */
export interface AuditFailureSnapshot {
  count: number;
  firstFailureAt: number | null;
  lastFailureAt: number | null;
}

/** One audit event. `actorUserId` is the resolved acting principal (null for system-initiated events — GC,
 *  cron, anything without a real user). `entityId` is the D24 SOLE soft-ref (no FK), paired with
 *  `entityType`; both nullable for a global action. `metadata` is free structured context. */
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

/**
 * Best-effort audit write. The audit channel must NEVER break the primary channel — pre-fix (neo), a
 * failure here bubbled through 38 call sites and 500'd the user's real operation. Now: log + count + drop.
 * The `db` handle AND `createdAt` (epoch-ms) are INJECTED — the caller supplies the timestamp from its
 * injected clock (no ambient `Date.now()` here; the same determinism seam tests use). The failure-window
 * stamps reuse `createdAt` (the attempted-write time).
 */
export async function logAudit(db: Db, entry: AuditEntry, createdAt: number): Promise<void> {
  try {
    await db.insert(auditLogs).values({
      id: mintTypeId(ID_PREFIX.auditLog),
      action: entry.action,
      actorUserId: entry.actorUserId,
      entityType: entry.entityType ?? null,
      entityId: entry.entityId ?? null,
      metadata: entry.metadata ?? null,
      createdAt,
    });
  } catch (err) {
    auditFailureCount += 1;
    if (firstFailureAt === null) {
      firstFailureAt = createdAt;
    }
    lastFailureAt = createdAt;
    getLog().error(
      { err, action: entry.action, entityType: entry.entityType, entityId: entry.entityId },
      "audit: write failed (suppressed)",
    );
    if (auditFailureCount % ALERT_EVERY === 0) {
      // Sustained-failure alarm. `warn` (the per-write error already fired at error level) tagged
      // `security:true` so an operator can grep for it.
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
