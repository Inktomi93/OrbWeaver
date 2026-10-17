import type { StatementToken } from "@orb/db/wiring";
import type { UserId } from "@orb/kit/ids";

/** One audit event; null actor identifies a system operation rather than a user. */
export interface AuditEntry {
  actorUserId: UserId | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
}

export interface AuditWiring {
  readonly log: (entry: AuditEntry, at: number) => Promise<void>;
  readonly statement: (entry: AuditEntry, at: number) => StatementToken;
  readonly statementAfterWrite: (entry: AuditEntry, at: number) => StatementToken;
}
