// schema/credentials — the per-user encrypted credential store (producer: domain/credentials). One
// row = one backend = N roles. The `provider` enum DERIVES the canonical `CRED_PROVIDERS` tuple from
// `@orb/contracts/credentials` (D31 — the broader STORAGE axis `openrouter|anthropic|openai|
// custom_openai`, NOT the narrower dispatch `CRED_SOURCES`); the column never re-spells
// the union, and a CHECK built from the same tuple enforces it at the SQL level (a test-mirror pins
// db === contracts). `anthropic`/`openai` are storable forward-compat slots with no
// resolver arm yet — a row may persist under them.
//
// AES-256-GCM AAD invariant (load-bearing): the at-rest ciphertext is
// bound to `${userId}|${provider}`, byte-identical. The AAD itself is a DOMAIN concern (built in
// `domain/credentials/persistence/aad.ts`, never a column), but the `provider` column is the binding
// half — which is exactly why it MUST stay the canonical enum (a slot move = a GCM decrypt failure).
// The secret material lives in `ciphertext`/`iv`/`tag`; `CredentialView` never exposes them.
//
// UNDER CONNECTIONS-AS-THE-UNIT (inference program §5.3, F7): the `provider` column is becoming the provider
// REGISTRY id (a string validated at the domain, CHECK-free — plugin rows are runtime data) and WHICH key
// resolves is the CONNECTION's `credentialId`, never an active-per-slot flag. So the SQL-level `provider`
// CHECK and the `(owner_id, provider) WHERE active` partial unique are GONE from the DDL here. The `active`
// column and the `{ enum: CRED_PROVIDERS }` typing survive only until the credentials domain's cut-over
// (`loadActiveCredential`/`setActive` still read them); that lane deletes both. A credential row is a sealed
// secret with a label; connections give it meaning.

import type { ProviderMetadata } from "@orb/contracts/credentials";
import { CRED_REVOKED_REASONS } from "@orb/contracts/credentials";
import type { ProviderId } from "@orb/contracts/inference";
import type { UserCredentialId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { users } from "./users.ts";

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
    // The provider REGISTRY id (`ProviderId`, inference program §5.3c class 2) — validated at the domain against
    // the registry, CHECK-free because plugin rows are runtime data. It is HALF THE AAD, so a respelling
    // orphans the ciphertext by construction.
    provider: text("provider").$type<ProviderId>().notNull(),
    // AES-256-GCM at-rest secret material (AAD = `${userId}|${provider}`, supplied by the domain).
    ciphertext: text("ciphertext").notNull(),
    iv: text("iv").notNull(),
    tag: text("tag").notNull(),
    // Set when the credential is revoked; null = live. THE POLICY (#1373, wired end to end — adapter
    // `ProviderErrorKind` → post-generation hook → this row → the Connections pane): ONE provider
    // `auth_failed` revokes (there is no strike COUNTER on this table and none is wanted — a key the
    // provider has rejected is dead now, not on the third try); the health probe's 3-strike UNREACHABLE
    // limit and an explicit user revoke are the other two writers. No `rate_limit`/`billing`/`moderation`/
    // `forbidden`/network/server failure ever revokes.
    revokedAt: integer("revoked_at"),
    // WHICH of those wrote `revoked_at`, so the pane can say "the provider rejected it" vs "you revoked it"
    // instead of a bare Revoked chip. Derives `CRED_REVOKED_REASONS` (never re-spelled). Written in the same
    // statement as `revokedAt` and cleared with it (`setRevokedById` requires it; `CLEARED_REVOCATION` nulls
    // the pair at every clear site) — the pairing is a property of the writer SET, enforced by tsc.
    revokedReason: text("revoked_reason", { enum: CRED_REVOKED_REASONS }),
    // Provider-specific JSON (custom_openai baseUrl/headers). Parsed at
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
    // The tuple is CHECK-bound like every other closed enum column (`db-enum-from-tuple` form); the TS
    // `enum:` alone never reached SQLite, and the schema pin that asserted a refusal passed on nothing.
    check("user_credentials_revoked_reason_check", sql.raw(`revoked_reason is null or revoked_reason in (${checkList(CRED_REVOKED_REASONS)})`)),
  ],
);
