// audit.int — the append-only audit_logs slice against a real libSQL :memory: db (FK enforcement ON via
// createDb). Covers the D24 split: `entity_id` is the SOLE soft-ref (plain TEXT, no FK — an audit row
// inserts against a non-existent entity, and survives the entity's deletion), while `actor_user_id` is a
// REAL FK with SET NULL (deleting the actor nulls the column but keeps the log).

import { auditLogs, users } from "@orb/db";
import type { AuditLogId, Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db.ts";
import { expect, test } from "../../support/fixtures.ts";

// epoch-ms literal — createdAt is a plain integer NUMBER (audit has no default; the writer supplies it).
const CREATED_AT = 1_900_000_000_000;

test("an audit row inserts with an entity_id that references no existing row (D24 soft-ref, no FK)", async () => {
  const db = await freshDb();

  // entity_id is plain TEXT with no FK — it may point at an id that has no row (e.g. a record written
  // about an entity that was never persisted, or already gone).
  await db.insert(auditLogs).values({
    id: castId<AuditLogId>("audit_log_softref"),
    action: "character.delete",
    entityType: "character",
    entityId: "character_ghost",
    createdAt: CREATED_AT,
  });

  const rows = await db.select().from(auditLogs);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.entityId).toBe("character_ghost");
});

test("deleting a referenced entity leaves the audit row intact (the log outlives its referents)", async () => {
  const db = await freshDb();
  const entityUser = castId<UserId>("user_audit_entity");
  await db.insert(users).values({ id: entityUser, handle: castId<Handle>("user_audit_entity") });

  // The audit row points at the user via the SOFT entity_id (no FK, no cascade).
  await db.insert(auditLogs).values({
    id: castId<AuditLogId>("audit_log_entity"),
    action: "user.disable",
    entityType: "user",
    entityId: entityUser,
    createdAt: CREATED_AT,
  });

  await db.delete(users).where(eq(users.id, entityUser));

  // The log survives the referent's deletion, with the now-dangling entity_id preserved.
  const rows = await db.select().from(auditLogs);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.entityId).toBe(entityUser);
});

test("deleting the actor user nulls actor_user_id but keeps the audit row (real FK, SET NULL)", async () => {
  const db = await freshDb();
  const actor = castId<UserId>("user_audit_actor");
  await db.insert(users).values({ id: actor, handle: castId<Handle>("user_audit_actor") });

  // actor_user_id is a REAL FK with onDelete SET NULL.
  await db.insert(auditLogs).values({
    id: castId<AuditLogId>("audit_log_actor"),
    action: "owner.grant-admin",
    actorUserId: actor,
    createdAt: CREATED_AT,
  });

  await db.delete(users).where(eq(users.id, actor));

  // The log outlives the actor; the FK drives the actor column to null rather than deleting the row.
  const rows = await db.select().from(auditLogs);
  expect(rows).toHaveLength(1);
  expect(rows[0]?.actorUserId).toBeNull();
});
