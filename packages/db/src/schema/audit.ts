// schema/audit — the append-only audit log. Reserved cross-cutting (the `logAudit` WRITER lives in
// foundation/observability; the TABLE stays here). PK is a TypeID (`audit_log`).
//
// FORENSIC RECORD, DATABASE-ONLY: the app has no reader and none is planned — no verb, route or screen selects
// from this table. An operator reads it with database tools on a copy of the file. A reader added here turns a
// free-form record into a product surface: `action` and `metadata` would need a closed shape first.
// RETENTION: a row is kept for the life of the database. Nothing prunes, rotates or exports it, and deleting
// the actor or the entity leaves the row in place (below).
//
// D24 SOLE SANCTIONED SOFT-REF: `entity_id` is plain TEXT with NO FK and NO cascade — the ONE exception
// to "every cross-entity ref is a typed FK" (D24). An audit record must OUTLIVE the entity it describes
// (deleting a character must not delete its history), so a real FK + cascade would be wrong there.
// `actor_user_id` is the COUNTER-CASE: it is a REAL FK with `onDelete: "set null"` (write-time referential
// integrity, yet the log survives the actor's deletion with a null actor). D24 sanctions exactly ONE
// soft-ref — `entity_id` — so the actor must NOT be a second one.

import type { AuditLogId, UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { nulFreeText } from "../custom-types/index.ts";
import { users } from "./users.ts";

export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: nulFreeText("id").$type<AuditLogId>().primaryKey(),
    // The verb/event recorded (e.g. "character.delete", "owner.grant-admin"). Free-form by design.
    action: nulFreeText("action").notNull(),
    // The acting principal — the D24 counter-case (see header). Nullable for SET NULL and for global
    // actor-less actions.
    actorUserId: nulFreeText("actor_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    // The kind of entity acted on (paired with the soft entity_id below). Nullable for global actions.
    entityType: nulFreeText("entity_type"),
    // The D24 sole soft-ref (see header). Polymorphic by entity_type.
    entityId: nulFreeText("entity_id"),
    // Structured context for the event, free-form per action: each of the many audit writers names its own
    // fields and no reader decodes them, so the column holds any JSON value and nothing narrower.
    metadata: text("metadata", { mode: "json" }).$type<JsonValue>(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    // The forensic queries an operator runs with database tools: scan by time window, by actor, and by the
    // polymorphic (entity_type, entity_id) target.
    index("audit_logs_time_idx").on(t.createdAt),
    index("audit_logs_actor_idx").on(t.actorUserId),
    index("audit_logs_entity_idx").on(t.entityType, t.entityId),
  ],
);
