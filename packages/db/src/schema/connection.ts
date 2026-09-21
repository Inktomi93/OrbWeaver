// schema/connection — the CONNECTION is the unit (inference program §5.3; producer: domain/connection for
// this table AND the two in `connection-bindings.ts` — split across two files only because the bindings
// FK `automation_rules`/`plugins`, whose files import `chat.ts`, which FKs `user_connections` here: one file
// would be an import cycle). A user's `user_connections` row = provider + credential + model + declared overrides
// + extras + transport + the background-spend flag; EVERY actor's pick of a connection for a task is a
// `connection_bindings` ROW (D61-B6 — a real FK junction, never a JSON id-array; replaces the settings
// blob's `roleDefaults.<task>` leaves); runtime provider rows (plugin-shipped / admin-added) persist in
// `provider_rows` beside the built-ins (F9). A chat is NOT an actor and neither is an rpg game (F20/§5.3):
// every turn runs on the TRIGGERING principal's connection, so no room binds one.
//
// THE THREE JSON COLUMNS, each defended (§5.3 "defend or strike"): `declared` is a parsed single-owner
// capability DOCUMENT in `declaredCapabilitySchema` (never queried by field); `extras` is OPEN by definition
// (the user's own body fields — its ratchet is the belt denylist applied on write AND read); `transport` is a
// CLOSED zod object (headers / includeBody / excludeBody / responseMap), one owner, never queried. NO
// `budget` column (YAGNI — a ceiling arrives with a real one), NO per-binding `model` override (the model
// has ONE home, `user_connections.model` — "the connection IS the pick", §7.1).
//
// `provider_rows` is REAL COLUMNS for every scalar of `ProviderDef` with JSON only for `features` (a parsed
// document) and the two closed-tuple arrays `apis`/`serves` — never a KV blob. Its `id` IS the registry id
// (`plugin:<name>/<id>` for a plugin row, bare for an admin row; a built-in id can never be shadowed — the
// registry refuses it at `register()`, §5.9-1).

import type { ConnectionApi, ConnectionExtrasDoc, ConnectionTransportDoc, DeclaredCapability, ProviderId } from "@orb/contracts/inference";
import { CHAT_APIS } from "@orb/contracts/inference";
import type { ModelId, UserConnectionId, UserCredentialId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
import { check, index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { userCredentials } from "./credentials.ts";
import { users } from "./users.ts";

/** The `api` column's vocabulary: a chat protocol, or `auto` (the provider's first api). CHECK-listed. */
const CONNECTION_APIS = [...CHAT_APIS, "auto"] as const;

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// user_connections — one per (owner, label); several may share one credential (two OpenRouter connections,
// different models). `credentialId` is NULL for an `auth: none` row (local-light) or an open box; SET NULL
// so a revoked/deleted key leaves the row (it reads `no-connection` at send until re-keyed).
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const userConnections = sqliteTable(
  "user_connections",
  {
    // TypeID PK (`user_connection_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<UserConnectionId>().primaryKey(),
    // The owning user (D23 — KEEP ownerId: a connection is a true producer, single-owned; the binding fold
    // reads ONLY the funder's rows and the resolver refuses a binding that names a stranger's).
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    // The provider REGISTRY id — validated at the domain against the registry (built-ins ∪ `provider_rows`),
    // CHECK-free because plugin rows are runtime data (§5.3c class 2).
    providerId: text("provider_id").$type<ProviderId>().notNull(),
    credentialId: text("credential_id")
      .$type<UserCredentialId>()
      .references(() => userCredentials.id, { onDelete: "set null" }),
    // For `auth: endpoint` providers; NULL when the provider row fixes it. Validated as a URL by the domain on
    // write and by the egress guard on use (§5.3c class 4).
    baseUrl: text("base_url"),
    // The picked model id — NEVER defaulted (F16); the picker is the only way it gets set.
    model: text("model").$type<ModelId>().notNull(),
    // ∈ PROVIDER.apis (coherence is data, re-checked at resolve); `auto` ⇒ the provider's first api.
    api: text("api", { enum: CONNECTION_APIS }).$type<ConnectionApi>().notNull().default("auto"),
    // Per-connection capability OVERRIDES in `declaredCapabilitySchema` (kind, modalities, window, dims,
    // turns, reasoning, tools, pricing, and `features`) — the top rung of `EVIDENCE_TIERS`.
    declared: text("declared", { mode: "json" }).$type<DeclaredCapability>(),
    // Extra BODY fields (today's preset `customParameters`, moved to the connection where the quirk lives).
    extras: text("extras", { mode: "json" }).$type<ConnectionExtrasDoc>(),
    // The endpoint's request/response shaping — only on `auth: endpoint` rows.
    transport: text("transport", { mode: "json" }).$type<ConnectionTransportDoc>(),
    // `true` when `model` came from the provider's list; `false` = the typed fallback (the pane says why).
    modelListed: integer("model_listed", { mode: "boolean" }).notNull().default(true),
    // May a `spend: "background"` task (summaries, captions, digests) run on this row unattended? (F5)
    allowBackground: integer("allow_background", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
    updatedAt: integer("updated_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    // `(owner, label)` unique — the seed's idempotency key and the pane's collision suffix; it also serves
    // the owner-scoped list read (`owner_id` leads it).
    uniqueIndex("user_connections_owner_label_unique").on(t.ownerId, t.label),
    // The SET-NULL parent scan on a credential delete (`fk-columns-indexed` gate).
    index("user_connections_credential_idx").on(t.credentialId),
    check("user_connections_api_check", sql.raw(`api in (${checkList(CONNECTION_APIS)})`)),
  ],
);
