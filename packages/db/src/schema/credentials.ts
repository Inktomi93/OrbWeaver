// schema/credentials — the per-user encrypted credential store (producer: domain/credentials). One
// row = one backend = N roles. The `provider` enum DERIVES the canonical `CRED_PROVIDERS` tuple from
// `@orb/contracts/credentials` (D31 — the broader STORAGE axis `openrouter|anthropic|openai|
// google_vertex|custom_openai`, NOT the narrower dispatch `CRED_SOURCES`); the column never re-spells
// the union, and a CHECK built from the same tuple enforces it at the SQL level (a test-mirror pins
// db === contracts). `anthropic`/`openai`/`google_vertex` are storable forward-compat slots with no
// resolver arm yet — a row may persist under them.
//
// AES-256-GCM AAD invariant (load-bearing): the at-rest ciphertext is
// bound to `${userId}|${provider}`, byte-identical. The AAD itself is a DOMAIN concern (built in
// `domain/credentials/persistence/aad.ts`, never a column), but the `provider` column is the binding
// half — which is exactly why it MUST stay the canonical enum (a slot move = a GCM decrypt failure).
// The secret material lives in `ciphertext`/`iv`/`tag`; `CredentialView` never exposes them.
//
// one-active-per-(user,provider): a PARTIAL UNIQUE index on (owner_id, provider) WHERE active — at most
// one active credential per user per provider; `setActive` flips the flag, inactive rows coexist (the
// health UI probes them by id).

import type { ProviderMetadata } from "@orb/contracts/credentials";
import { CRED_PROVIDERS } from "@orb/contracts/credentials";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

// A freshly-added credential is active (the domain's `add`/`upsert` deactivates any prior active row
// for the same slot first; the partial unique index below is the backstop).
const DEFAULT_ACTIVE = true;
// CHECK list derived from the canonical tuple (NOT re-spelled): `provider in ('openrouter', …)`.
// A static fragment because a CHECK is DDL and cannot carry bound parameters (mirrors users.ts).
const PROVIDER_CHECK_LIST = CRED_PROVIDERS.map((provider) => `'${provider}'`).join(", ");

export const userCredentials = sqliteTable(
  "user_credentials",
  {
    id: text("id").$type<UserCredentialId>().primaryKey(),
    // The owning user (D23 — KEEP ownerId; credentials are single-owned). Hard-deleting the user
    // takes their secrets with them.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // Derives CRED_PROVIDERS (the STORAGE axis). The `enum` option is type-only; the CHECK below is the
    // SQL-level guard.
    provider: text("provider", { enum: CRED_PROVIDERS }).notNull(),
    // AES-256-GCM at-rest secret material (AAD = `${userId}|${provider}`, supplied by the domain).
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    // The one-active-per-(owner,provider) flag (enforced by the partial unique index).
    active: integer("active", { mode: "boolean" }).notNull().default(DEFAULT_ACTIVE),
    // Set when the credential is revoked (auth_failed strike-out or user action); null = live.
    revokedAt: integer("revoked_at"),
    // Provider-specific JSON (custom_openai baseUrl/headers, google_vertex project/region). Parsed at
    // the read seam via `parseProviderMetadata` (@orb/contracts/credentials). Nullable: most providers
    // have a fixed base URL and carry no metadata.
    metadata: text("metadata", { mode: "json" }).$type<ProviderMetadata>(),
    // User-facing label (also the seam API tokens reuse).
    label: text("label"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // Owner-scoped reads (fetchOwned / list).
    index("user_credentials_owner_idx").on(table.ownerId),
    // one-active-per-(user,provider): SQLite UNIQUE ignores rows failing the WHERE predicate, so any
    // number of inactive rows for a slot coexist with the single active one.
    uniqueIndex("user_credentials_active_unique")
      .on(table.ownerId, table.provider)
      .where(sql`${table.active} = 1`),
    check("user_credentials_provider_check", sql.raw(`provider in (${PROVIDER_CHECK_LIST})`)),
  ],
);
