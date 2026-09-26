// schema/connection-bindings — the OTHER two connection-domain tables (producer: domain/connection):
// `connection_bindings` (EVERY actor → connection pick, as FK physics — D61-B6: a real junction, never a JSON
// id-array; replaces the settings blob's `roleDefaults.<task>` leaves), `provider_rows` (the runtime provider
// REGISTRY: plugin-shipped / admin-added `ProviderDef` rows beside the built-ins, F9), and
// `plugin_provider_claims` (each user's binding of a plugin provider id to one definition). They live
// apart from `user_connections` (`connection.ts`) only to break an import cycle: the bindings FK
// `automation_rules` and `plugins`, whose schema files import `chat.ts`, which FKs `user_connections`.
//
// `provider_rows` is REAL COLUMNS for every scalar of `ProviderDef` with JSON only for `features` (a parsed
// document) and the two closed-tuple arrays `apis`/`serves` — never a KV blob. `providerDefSchema` is their
// ONE validation authority: the registry parses before persistence and reads re-parse before returning a
// row. Its `id` IS the registry id (`plugin:<name>/<id>` for a plugin row, bare for an admin row; a built-in
// id can never be shadowed — the registry refuses it at `register()`, §5.9-1).

import type { ChatApi, EndpointFeatures, ProviderId, RoutableTask, Task, Wire } from "@orb/contracts/inference";
import { BINDING_ACTOR_KINDS, CATALOG_STRATEGIES, DIALECTS, PLUGIN_PROVIDER_ID_PREFIX, PROVIDER_AUTHS, ROUTABLE_TASKS, WIRES } from "@orb/contracts/inference";
import type { AutomationRuleId, ConnectionBindingId, PluginId, UserConnectionId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
// biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates positional primaryKey; the supported object form is used below.
import { check, foreignKey, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { automationRules } from "./automation.ts";
import { userConnections } from "./connection.ts";
import { plugins } from "./plugin.ts";
import { users } from "./users.ts";

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// connection_bindings — EVERY actor → connection reference, as FK physics. Exactly one of {userId, ruleId,
// pluginId} is non-null, matching `actorKind` (the `chat_participants` kind-shape CHECK idiom). The owner of a
// rule/plugin arm is DERIVED one FK away (`automation_rules.ownerId` / `plugins.ownerId`) — D23 says no
// doubling, so those arms carry no `userId`. `connectionId` SET NULL: the binding survives a deleted
// connection as `no-connection`, never a dangling id. THREE partial uniques, one per arm — the tree's
// NULL-distinctness idiom (`message_reactions`, `workloads`), never a coalesce expression.
// "A binding may only point at a connection its derived owner holds" is enforced at the ONE writer verb
// (`domain/connection`) plus a named negative test — a CHECK cannot join.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const connectionBindings = sqliteTable(
  "connection_bindings",
  {
    id: text("id").$type<ConnectionBindingId>().primaryKey(),
    actorKind: text("actor_kind", { enum: BINDING_ACTOR_KINDS }).notNull(),
    // Set ONLY on the `user` arm (that user's per-task defaults).
    userId: text("user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "cascade" }),
    // The `automation-rule` arm: the rule's AUTHOR picked a row for it.
    ruleId: text("rule_id")
      .$type<AutomationRuleId>()
      .references(() => automationRules.id, { onDelete: "cascade" }),
    // The `plugin-grant` arm: the installing user granted the plugin a row per task.
    pluginId: text("plugin_id")
      .$type<PluginId>()
      .references(() => plugins.id, { onDelete: "cascade" }),
    // ROUTABLE tasks only — `structured`/`agent` ride their `ridesOn` task for every actor (F16).
    task: text("task", { enum: ROUTABLE_TASKS as unknown as readonly [RoutableTask, ...RoutableTask[]] })
      .$type<RoutableTask>()
      .notNull(),
    connectionId: text("connection_id")
      .$type<UserConnectionId>()
      .references(() => userConnections.id, { onDelete: "set null" }),
  },
  (t) => [
    // One binding per (actor, task) — the fold's indexed lookup; each actor FK LEADS its own partial unique,
    // so no second index is owed on it (`fk-columns-indexed`).
    uniqueIndex("connection_bindings_user_task_unique").on(t.userId, t.task).where(sql`${t.actorKind} = 'user'`),
    uniqueIndex("connection_bindings_rule_task_unique").on(t.ruleId, t.task).where(sql`${t.actorKind} = 'automation-rule'`),
    uniqueIndex("connection_bindings_plugin_task_unique").on(t.pluginId, t.task).where(sql`${t.actorKind} = 'plugin-grant'`),
    // The SET-NULL parent scan on a connection delete.
    index("connection_bindings_connection_idx").on(t.connectionId),
    check("connection_bindings_actor_kind_check", sql.raw(`actor_kind in (${checkList(BINDING_ACTOR_KINDS)})`)),
    check("connection_bindings_task_check", sql.raw(`task in (${checkList(ROUTABLE_TASKS)})`)),
    // The kind-shape CHECK: exactly the arm's id is set, the other two are NULL.
    check(
      "connection_bindings_actor_shape_check",
      sql.raw(
        "(actor_kind = 'user' and user_id is not null and rule_id is null and plugin_id is null) or " +
          "(actor_kind = 'automation-rule' and rule_id is not null and user_id is null and plugin_id is null) or " +
          "(actor_kind = 'plugin-grant' and plugin_id is not null and user_id is null and rule_id is null)",
      ),
    ),
  ],
);

/** Who put a runtime provider row here — a plugin at activation, or an admin. */
export const PROVIDER_ROW_ORIGINS = ["plugin", "admin"] as const;
export type ProviderRowOrigin = (typeof PROVIDER_ROW_ORIGINS)[number];

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// provider_rows — the ProviderStore's table: runtime `ProviderDef` rows. Real columns per scalar; `features`
// is a parsed document; `apis`/`serves` are JSON arrays parsed by the canonical `providerDefSchema` before
// this persistence boundary. An ADMIN row is deployment-wide and unique by id. A PLUGIN row is content only,
// keyed by id AND `definition_hash`: two users' different definitions of one `plugin:` id are two rows, and a
// user reaches one only through their own `plugin_provider_claims` row (D147, D265). The namespace CHECK
// keeps the two kinds disjoint, so an admin row can never answer for a plugin id, nor a plugin row for a bare
// one. A plugin row no claim references is unreachable and is reaped by the store's reconciliation.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const providerRows = sqliteTable(
  "provider_rows",
  {
    // The registry id itself (`plugin:<name>/<id>` | a bare admin id) — NOT a TypeID; the natural key.
    id: text("id").$type<ProviderId>().notNull(),
    label: text("label").notNull(),
    wire: text("wire", { enum: WIRES }).$type<Wire>().notNull(),
    dialect: text("dialect", { enum: DIALECTS }),
    auth: text("auth", { enum: PROVIDER_AUTHS }).notNull(),
    baseUrl: text("base_url"),
    apis: text("apis", { mode: "json" }).$type<readonly ChatApi[]>().notNull(),
    serves: text("serves", { mode: "json" }).$type<readonly Task[]>(),
    catalog: text("catalog", { enum: CATALOG_STRATEGIES }).notNull(),
    metered: integer("metered", { mode: "boolean" }).notNull(),
    docsUrl: text("docs_url"),
    features: text("features", { mode: "json" }).$type<EndpointFeatures>(),
    /** SHA-256 of the canonical validated ProviderDef — half the key: one row per distinct definition of an id. */
    definitionHash: text("definition_hash").notNull(),
    originKind: text("origin_kind", { enum: PROVIDER_ROW_ORIGINS }).notNull(),
    // The admin who added it — provenance only (SET NULL; the row outlives the admin).
    originUserId: text("origin_user_id")
      .$type<UserId>()
      .references(() => users.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.id, t.definitionHash] }),
    // An admin row is the deployment's ONE definition of its id; plugin rows are exempt because their
    // uniqueness is per claiming owner, not per deployment.
    uniqueIndex("provider_rows_admin_id_unique").on(t.id).where(sql`${t.originKind} = 'admin'`),
    index("provider_rows_origin_user_idx").on(t.originUserId),
    check("provider_rows_wire_check", sql.raw(`wire in (${checkList(WIRES)})`)),
    check("provider_rows_dialect_check", sql.raw(`dialect is null or dialect in (${checkList(DIALECTS)})`)),
    check("provider_rows_auth_check", sql.raw(`auth in (${checkList(PROVIDER_AUTHS)})`)),
    check("provider_rows_catalog_check", sql.raw(`catalog in (${checkList(CATALOG_STRATEGIES)})`)),
    check("provider_rows_origin_kind_check", sql.raw(`origin_kind in (${checkList(PROVIDER_ROW_ORIGINS)})`)),
    // Plugin provenance lives in the claim. Admin provenance may become NULL when the user is deleted,
    // because the deployment row deliberately outlives its author.
    check("provider_rows_origin_shape_check", sql.raw("(origin_kind = 'plugin' and origin_user_id is null) or origin_kind = 'admin'")),
    check(
      "provider_rows_namespace_check",
      sql.raw(`(origin_kind = 'plugin') = (substr(id, 1, ${PLUGIN_PROVIDER_ID_PREFIX.length}) = '${PLUGIN_PROVIDER_ID_PREFIX}')`),
    ),
  ],
);

// ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// plugin_provider_claims — one user's binding of a `plugin:` ProviderId to ONE definition, and the install
// that currently serves it. The binding is permanent for its owner: a connection or credential keeps only
// the ProviderId, so re-pointing the owner's id at another definition would reroute a retained secret to a
// new baseUrl. `plugin_id` goes NULL when that install stops being enabled or is removed; the claim stays as
// the owner's tombstone and dies with the user. Another user's claim on the same id is a separate row, so no
// user can hold a provider id for anyone else (D265). The owner is the scope and has no parent to derive
// through (the tombstone outlives the install); every writer derives it from `plugins.owner_id`.
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════

export const pluginProviderClaims = sqliteTable(
  "plugin_provider_claims",
  {
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    providerId: text("provider_id").$type<ProviderId>().notNull(),
    definitionHash: text("definition_hash").notNull(),
    // The owner's install serving this claim now; NULL is a tombstone that serves nobody.
    pluginId: text("plugin_id")
      .$type<PluginId>()
      .references(() => plugins.id, { onDelete: "set null" }),
    createdAt: integer("created_at").notNull().default(sql`(unixepoch() * 1000)`),
  },
  (t) => [
    primaryKey({ columns: [t.ownerId, t.providerId] }),
    // The SET-NULL parent scan on a plugin delete, and the per-install release.
    index("plugin_provider_claims_plugin_idx").on(t.pluginId),
    // The RESTRICT parent scan when reconciliation reaps an unclaimed definition.
    index("plugin_provider_claims_definition_idx").on(t.providerId, t.definitionHash),
    foreignKey({
      columns: [t.providerId, t.definitionHash],
      foreignColumns: [providerRows.id, providerRows.definitionHash],
      name: "plugin_provider_claims_definition_fk",
    }).onDelete("restrict"),
    check("plugin_provider_claims_namespace_check", sql.raw(`substr(provider_id, 1, ${PLUGIN_PROVIDER_ID_PREFIX.length}) = '${PLUGIN_PROVIDER_ID_PREFIX}'`)),
  ],
);
