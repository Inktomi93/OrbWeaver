import type { auditLogs } from "@orb/db";
import type { StatementToken } from "@orb/db/wiring";

/** One audit event; null actor identifies a system operation rather than a user. */
export interface AuditEntry
  extends Pick<typeof auditLogs.$inferSelect, "actorUserId" | "action">,
    Partial<Pick<typeof auditLogs.$inferSelect, "entityType" | "entityId">> {
  metadata?: NonNullable<(typeof auditLogs.$inferSelect)["metadata"]>;
}

export interface AuditFailureSnapshot {
  count: number;
  firstFailureAt: (typeof auditLogs.$inferSelect)["createdAt"] | null;
  lastFailureAt: (typeof auditLogs.$inferSelect)["createdAt"] | null;
}

export interface AuditWiring {
  readonly log: (entry: AuditEntry, at: number) => Promise<void>;
  readonly statement: (entry: AuditEntry, at: number) => StatementToken;
  readonly statementAfterWrite: (entry: AuditEntry, at: number) => StatementToken;
}
