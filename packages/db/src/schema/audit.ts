// schema/audit — the append-only audit log. Reserved cross-cutting (the `logAudit` WRITER lives in
// foundation/observability; the TABLE stays here). PK is a TypeID (`audit_log`).
//
// D24 SOLE SANCTIONED SOFT-REF: `entity_id` is plain TEXT with NO FK and NO cascade. An audit record
// must OUTLIVE the entity it describes (deleting a character must not delete its history), so a real FK
// + cascade would be wrong here. This is the ONE exception to "every cross-entity ref is a typed FK"
// (D24) — every other table uses real FKs. `actor_user_id` is likewise soft (a deleted user's actions
// remain logged), so it carries the brand but no `.references()`.

import type { AuditLogId, UserId } from "@orb/kit/ids";
import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").$type<AuditLogId>().primaryKey(),
  // The verb/event recorded (e.g. "character.delete", "owner.grant-admin"). Free-form by design.
  action: text("action").notNull(),
  // The acting principal — soft (no FK): the log survives the user's deletion. plain-id: append-only
  // audit must outlive its referents (D24).
  actorUserId: text("actor_user_id").$type<UserId>(),
  // The kind of entity acted on (paired with the soft entity_id below). Nullable for global actions.
  entityType: text("entity_type"),
  // The D24 SOLE soft-ref: no FK, no cascade — the record outlives the entity. Polymorphic by entity_type.
  entityId: text("entity_id"),
  // Structured context for the event (free JSON; parsed at the read seam if ever surfaced).
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>(),
  createdAt: integer("created_at").notNull(),
});
