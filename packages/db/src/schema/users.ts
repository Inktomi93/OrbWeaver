// schema/users — the identity root. Every single-owned table FKs `users.id`; it is reserved
// cross-cutting (no single producing domain). The `role` enum DERIVES the canonical `USER_ROLES` tuple
// from `@orb/contracts/identity` (D17 — owner|admin|user); the column never re-spells the union, and a
// CHECK built from the same tuple enforces it at the SQL level (a test-mirror pins db === contracts).
//
// `users.id` is DELIBERATELY a PLAIN `Branded<"UserId">` nanoid, NOT a prefix-validated TypeID (Tier-1-DB.md
// esoteric #4): inbound `ownerId`/`userId` FKs inherit that plainness. It still carries a `.$type<UserId>()`
// brand (the schema-branding gate + type-safety), the brand is just not a `prefix_…` TypeID.
//
// AGENT PRINCIPALS (D60; agent-principal-design/01 §1): `kind` (`human|agent`) + `ownerUserId` (self-FK
// CASCADE) are born at AP0 with three CHECKs. `kind` defaults `'human'` — every existing row is a valid human,
// so there is no backfill; the CHECKs are free at creation and impossible to retrofit cheaply on a populated
// identity root. The agent flavor is loginless / unprivileged / owned BY DDL. The BEHAVIOR the columns unlock
// — the `provisionAgentPrincipal` mint, the seating chokepoint, `canAgent` — is AP1+ (FLAG[PD-17]).

import { USER_KINDS, USER_ROLES } from "@orb/contracts/identity";
import type { ExternalId, Handle, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { check, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// The default global role for a freshly-provisioned user (owner/admin are granted explicitly — D17).
const DEFAULT_ROLE = "user";
// CHECK list derived from the canonical tuple (NOT re-spelled): `role in ('owner', 'admin', 'user')`.
// Built as a raw fragment because a CHECK is static DDL and cannot carry bound parameters.
const ROLE_CHECK_LIST = USER_ROLES.map((role) => `'${role}'`).join(", ");
// CHECK list derived from the canonical KIND tuple (D60, NOT re-spelled): `kind in ('human', 'agent')`.
const KIND_CHECK_LIST = USER_KINDS.map((kind) => `'${kind}'`).join(", ");

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
    // The principal-kind axis (D60). Defaults 'human' — every existing row is a valid human, no backfill. The
    // `users_agent_shape` CHECK (below) makes the agent flavor loginless/unprivileged/owned by DDL.
    // FLAG[PD-17]: born at AP0; the ONLY writer of a non-'human' row is `provisionAgentPrincipal` (AP1).
    kind: text("kind", { enum: USER_KINDS }).notNull().default("human"),
    // The human responsible for an agent principal (D60). NULL for humans (CHECK-tied to `kind`). Self-FK
    // CASCADE: owner hard-delete → agent row deleted → (existing FKs) roster CASCADE + `messages.authorUserId`
    // SET NULL, with NO reaper (referential physics — agent-principal-design/01 §1). The explicit
    // `AnySQLiteColumn` return type is required for a self-reference (drizzle can't infer mid-definition).
    ownerUserId: text("owner_user_id")
      .$type<UserId>()
      .references((): AnySQLiteColumn => users.id, { onDelete: "cascade" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    uniqueIndex("users_handle_unique").on(table.handle),
    // UNIQUE-when-set: SQLite's UNIQUE ignores NULL rows, so multiple null-externalId users coexist.
    uniqueIndex("users_external_id_unique")
      .on(table.externalId)
      .where(sql`${table.externalId} is not null`),
    // D17/D40 "exactly one owner" enforcer: a partial unique index over `role` scoped to owner rows makes a
    // SECOND `role='owner'` row unrepresentable (the invariant `Principal`/D17 assert but nothing enforced —
    // D40 tracked it "open, needs its enforcer"). SQLite ignores non-owner rows (the WHERE), so admin/user
    // are unconstrained. The single owner is the immutable bootstrap identity; `admin.setRole` already
    // refuses to grant/revoke owner, so the only writers are boot `seed-owner` + SSO `provisionIdentity`
    // (both under the single-owner OWNER_HANDLES default) — this index is the DDL floor beneath them.
    uniqueIndex("users_single_owner_unique").on(table.role).where(sql`${table.role} = 'owner'`),
    check("users_role_check", sql.raw(`role in (${ROLE_CHECK_LIST})`)),
    check("users_kind_check", sql.raw(`kind in (${KIND_CHECK_LIST})`)),
    // The structural no-login core (agent-principal-design/01 §1/§3.1): an agent is loginless (no
    // `password_hash` to verify), unlinkable-by-SSO (no `external_id` can ever match), unprivileged
    // (`role='user'` — never satisfies requireAdmin/requireOwner), and owned. Unrepresentable, not just refused.
    check(
      "users_agent_shape",
      sql.raw(
        "kind <> 'agent' OR (role = 'user' AND password_hash IS NULL AND external_id IS NULL AND owner_user_id IS NOT NULL)",
      ),
    ),
    // A human never carries an owner link — the kind axis is coherent both ways.
    check("users_human_shape", sql.raw("kind <> 'human' OR owner_user_id IS NULL")),
  ],
);
