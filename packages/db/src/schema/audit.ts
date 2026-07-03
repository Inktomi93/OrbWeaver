// schema/audit — the append-only audit log. Reserved cross-cutting (the `logAudit` WRITER lives in
// foundation/observability; the TABLE stays here). PK is a TypeID (`audit_log`).
//
// D24 SOLE SANCTIONED SOFT-REF: `entity_id` is plain TEXT with NO FK and NO cascade — the ONE exception
// to "every cross-entity ref is a typed FK" (D24). An audit record must OUTLIVE the entity it describes
// (deleting a character must not delete its history), so a real FK + cascade would be wrong there.
// `actor_user_id` is the COUNTER-CASE: it is a REAL FK with `onDelete: "set null"` (write-time referential
// integrity, yet the log survives the actor's deletion with a null actor). D24 sanctions exactly ONE
// soft-ref — `entity_id` — so the actor must NOT be a second one.

import type { AuditLogId, UserId } from "@orb/kit/ids";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: text("id").$type<AuditLogId>().primaryKey(),
    // The verb/event recorded (e.g. "character.delete", "owner.grant-admin"). Free-form by design.
    action: text("action").notNull(),
    // The acting principal — the D24 counter-case (see header). Nullable for SET NULL and for global
    // actor-less actions.
    actorUserId: text("actor_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The kind of entity acted on (paired with the soft entity_id below). Nullable for global actions.
    entityType: text("entity_type"),
    // The D24 sole soft-ref (see header). Polymorphic by entity_type.
    entityId: text("entity_id"),
    // Structured context for the event (free JSON; parsed at the read seam if ever surfaced).
    metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    // Admin/forensics hot paths on this append-only table: scan by time window, by actor, and by the
    // polymorphic (entity_type, entity_id) target.
    index("audit_logs_time_idx").on(t.createdAt),
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);
