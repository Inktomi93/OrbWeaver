// schema/sessions — the BFF (Backend-For-Frontend) browser session + the OIDC PKCE transaction store
// (producer: domain/sessions). NOT to be confused with `session_entries` (schema/sdk-session.ts) — the
// agent-sdk prompt-cache lineage (D8). These share only the word "session": separate tables, separate
// homes, separate tiers (sessions.md "BFF session ≠ SDK chat session"). This file has zero SDK-frame
// state.
//
// The token is NEVER stored — only its peppered hash (`token_hash`); `hashToken` lives in
// domain/sessions/tokens. The hash is the validate lookup key, so it is UNIQUE. `label` is reserved for
// the future long-lived API-token surface that reuses this store (sessions.md Open decisions).
//
// `oidc_transactions` is the db-backed PKCE/state KV (sessions.md / tiers/infra.md — db-backed, so it
// is domain/sessions persistence, NOT sealed db-free infra/auth). Natural-key PK on `state` (the OAuth
// state param), no brand, no FK (it is pre-auth — there is no user row yet). The `oidc-store` LOGIC
// lives in domain/sessions/persistence/oidc-store.ts; only the TABLE is here.

import type { SessionId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users";

export const sessions = sqliteTable(
  "sessions",
  {
    // The BFF session ROW id (NOT the opaque cookie token — that is hashed into `token_hash`).
    id: text("id").$type<SessionId>().primaryKey(),
    userId: text("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The peppered SHA-256 of the opaque cookie token (HMAC-SESSION_SECRET). The raw token is never
    // persisted; this is the per-request validate lookup key (constant-time compared upstream).
    tokenHash: text("token_hash").notNull(),
    // Slid forward on a throttle by `validate` (sessions.md — per-request gates take effect next request).
    expiresAt: integer("expires_at").notNull(),
    // Set by logout / admin-kick; null = live. Revoke is one atomic `UPDATE … WHERE revoked_at IS NULL`.
    revokedAt: integer("revoked_at"),
    // Reserved for the future API-token surface (same table, same revoke/list machinery).
    label: text("label"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (table) => [
    // Validate looks up by token hash — it MUST be unique (one session per minted token).
    uniqueIndex("sessions_token_hash_unique").on(table.tokenHash),
    // `listForUser` (the admin device list) + the kick-all sweep scope by user.
    index("sessions_user_idx").on(table.userId),
  ],
);

export const oidcTransactions = sqliteTable(
  "oidc_transactions",
  {
    // The OAuth `state` parameter — the natural key the callback echoes back. No brand (a pre-auth nonce).
    state: text("state").primaryKey(),
    // The PKCE code_verifier held until the callback's code-for-token exchange.
    codeVerifier: text("code_verifier").notNull(),
    // The OIDC nonce (replay defense), echoed in the id_token; nullable when the mode omits it.
    nonce: text("nonce"),
    // The redirect target to resume after a successful callback; nullable (defaults to the app root).
    redirectUri: text("redirect_uri"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // Short-lived; the store GC sweeps expired transactions.
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("oidc_transactions_expires_idx").on(table.expiresAt)],
);
