// schema/sessions — the BFF (Backend-For-Frontend) browser session + the OIDC PKCE transaction store
// (producer: domain/sessions). NOT to be confused with `session_entries` (schema/sdk-session.ts) — the
// agent-sdk prompt-cache lineage (D8). These share only the word "session": separate tables, separate
// homes, separate tiers (docs/law/Spine-Identity-and-Auth.md "BFF session ≠ SDK chat session"). This file has
// zero SDK-frame state.
//
// The token is NEVER stored — only its peppered hash (`token_hash`); `hashToken` lives in
// domain/sessions/tokens. The hash is the validate lookup key, so it is UNIQUE. `label` is reserved for
// the future long-lived API-token surface that reuses this store (the committed
// identity decision: "API tokens = a sessions verb").
//
// `oidc_transactions` is the db-backed PKCE/state KV (docs/law/Tier-3-Infra.md — db-backed, so it
// is domain/sessions persistence, NOT sealed db-free infra/auth). Natural-key PK on `state` (the OAuth
// state param), no brand, no FK (it is pre-auth — there is no user row yet). The `oidc-store` LOGIC
// lives in domain/sessions/persistence/oidc-store.ts; only the TABLE is here.
//
// `oidc_pending_signups` (D259) holds a signed-out OIDC visitor who reached the callback with a valid signup
// invite while JIT provisioning is closed: the verified identity, frozen until the visitor confirms the join.
// It is keyed by a hash of a fresh secret that rides only the pending cookie, never by `state`, and the
// transaction `consume` never reads it.

import type { ExternalId, Handle, SessionId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { users } from "./users.ts";

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
    // Slid forward on a throttle by `validate` (per-request gates take effect next request).
    expiresAt: integer("expires_at").notNull(),
    // Last activity instant (epoch-ms number); born = mint time (a fresh session was just seen), then
    // bumped on the throttled activity slide alongside expiresAt.
    lastSeenAt: integer("last_seen_at").notNull().default(sql`(unixepoch() * 1000)`),
    // Set by logout / admin-kick; null = live. Revoke is one atomic `UPDATE … WHERE revoked_at IS NULL`.
    revokedAt: integer("revoked_at"),
    // The User-Agent captured at mint; null when the mint carried no UA header.
    userAgent: text("user_agent"),
    // ── The OIDC RP-initiated-logout hint (#141, owner ruling 2026-08-30) ────────────────────────────
    // AES-256-GCM sealed OIDC `id_token`, held for ONE purpose: the `id_token_hint` on the end-session
    // request, so authentik honours `post_logout_redirect_uri` and the user lands back on our /login
    // instead of the IdP's page. Without the hint that param makes authentik 400 BEFORE its invalidation
    // flow runs, which leaves the upstream SSO session alive (#437) — the two params are inseparable.
    //
    // WHAT THIS IS: a bearer-ish credential at rest. It is an ID token, not an access token — it grants
    // no API authority — but it names the subject and, replayed as a hint, identifies the session to the
    // IdP. So it is stored sealed, never in the clear:
    //   • KEY — HKDF-SHA256 over the existing `SESSION_SECRET` with its own `info` label (owner ruling:
    //     no new secret). The label is what keeps this key separate from the token-hash pepper's.
    //   • AAD — the session ROW id (`sessions.id`), byte-identical. A blob lifted into another session's
    //     row fails GCM tag verification LOUDLY instead of silently logging that session out elsewhere.
    //   • LIFETIME — the row's. Every revoke path NULLs these three columns in the same statement that
    //     sets `revoked_at`, so a dead session never keeps the hint at rest.
    // It is NEVER projected: `SessionView` (the admin device list) does not carry it, `selectForValidation`
    // does not select it, and the ONLY read is the logout revoke's own `RETURNING`.
    oidcIdTokenCiphertext: text("oidc_id_token_ciphertext"),
    oidcIdTokenIv: text("oidc_id_token_iv"),
    oidcIdTokenTag: text("oidc_id_token_tag"),
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
    // D259 — the peppered hash of a signup invite the visitor arrived with; the raw token is never stored.
    inviteTokenHash: text("invite_token_hash"),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    // Short-lived; the store GC sweeps expired transactions.
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [index("oidc_transactions_expires_idx").on(table.expiresAt)],
);

export const oidcPendingSignups = sqliteTable(
  "oidc_pending_signups",
  {
    // At most one live pending join per stable subject: a new callback replaces the old row.
    // `subject`, not `externalId`: this row binds nothing. The account insert in the sessions users
    // persistence is the one bind, and only after the confirm's batch takes this row.
    subject: text("external_id").$type<ExternalId>().primaryKey(),
    // The peppered hash of the fresh secret in the pending cookie — the only lookup key. Never the `state`.
    secretHash: text("secret_hash").notNull(),
    handle: text("handle").$type<Handle>().notNull(),
    email: text("email"),
    // The IdP groups as the callback saw them; the confirm re-derives access from exactly these.
    groups: text("groups", { mode: "json" }).$type<string[]>().notNull(),
    // The peppered hash of the signup invite the join spends.
    inviteTokenHash: text("invite_token_hash").notNull(),
    // The sealed OIDC id_token for the session the confirm mints (AAD = `secret_hash`); null when the IdP
    // sent none.
    idTokenCiphertext: text("id_token_ciphertext"),
    idTokenIv: text("id_token_iv"),
    idTokenTag: text("id_token_tag"),
    createdAt: integer("created_at").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (table) => [uniqueIndex("oidc_pending_signups_secret_hash_unique").on(table.secretHash), index("oidc_pending_signups_expires_idx").on(table.expiresAt)],
);
