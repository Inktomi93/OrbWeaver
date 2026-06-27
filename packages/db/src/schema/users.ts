// schema/users — the identity root. Every single-owned table FKs `users.id`; it is reserved
// cross-cutting (no single producing domain). The `role` enum DERIVES the canonical `USER_ROLES` tuple
// from `@orb/contracts/identity` (D17 — owner|admin|user); the column never re-spells the union, and a
// CHECK built from the same tuple enforces it at the SQL level (a test-mirror pins db === contracts).
//
// `users.id` is DELIBERATELY a PLAIN `Branded<"UserId">` nanoid, NOT a prefix-validated TypeID (db.md
// esoteric #4): inbound `ownerId`/`userId` FKs inherit that plainness. It still carries a `.$type<UserId>()`
// brand (the schema-branding gate + type-safety), the brand is just not a `prefix_…` TypeID.
//
// DEFERRED (§8.6, NOT this pass): `users.isAgent` / `users.kind` (the agent-as-first-class-principal
// columns) — anticipated here only; do not add them until the agent-principal mint feature lands.

import { USER_ROLES } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The default global role for a freshly-provisioned user (owner/admin are granted explicitly — D17).
const DEFAULT_ROLE = "user";
// CHECK list derived from the canonical tuple (NOT re-spelled): `role in ('owner', 'admin', 'user')`.
// Built as a raw fragment because a CHECK is static DDL and cannot carry bound parameters.
const ROLE_CHECK_LIST = USER_ROLES.map((role) => `'${role}'`).join(", ");

export const users = sqliteTable(
  "users",
  {
    // PLAIN nanoid brand (not a TypeID) — see file header. App-minted; no DB default.
    id: text("id").$type<UserId>().primaryKey(),
    handle: text("handle").$type<Handle>().notNull(),
    // Stable SSO subject — nullable (the single-user / owner-fallback path has none); UNIQUE-when-set
    // via the partial index below.
    externalId: text("external_id").$type<ExternalId>(),
    role: text("role", { enum: USER_ROLES }).notNull().default(DEFAULT_ROLE),
    enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
    // Local-auth path only; null for SSO-only users.
    passwordHash: text("password_hash"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("users_handle_unique").on(table.handle),
    // UNIQUE-when-set: SQLite's UNIQUE ignores NULL rows, so multiple null-externalId users coexist.
    uniqueIndex("users_external_id_unique")
      .on(table.externalId)
      .where(sql`${table.externalId} is not null`),
    check("users_role_check", sql.raw(`role in (${ROLE_CHECK_LIST})`)),
  ],
);
