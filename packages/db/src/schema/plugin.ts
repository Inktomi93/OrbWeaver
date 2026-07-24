// schema/plugin — the installed-plugin registry + the plugin-private KV plane (D46; producer = domain/plugin).
// `plugins` is one row per (owner, slug): the FULL validated manifest is stored as json (provenance +
// re-validated on load — 02 §3; `builtAgainst` provenance rides INSIDE it, no denormalized column), the
// confirmed grant subset rides `granted_capabilities`, and the bundle bytes live in the per-user CAS
// (`bundle_asset_id` FK assets, ON DELETE RESTRICT — a deleted bundle under an installed plugin is corruption;
// uninstall deletes row-then-asset in one verb). `status`/`origin` DERIVE their CHECK from the ONE-home
// contract tuples (`@orb/contracts/plugin` — no re-spell, the ASSET_KINDS precedent). `plugin_kv` is the
// `storage.kv` plane: PK (plugin_id, key), a denormalized `owner_id` guard column (belt: WHERE both), the
// 128-char key / 64 KiB value caps as tuple-shared CHECK-DDL.

import type { PluginCapability, PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_ORIGINS, PLUGIN_STATUSES } from "@orb/contracts/plugin";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";
// biome-ignore lint/suspicious/noDeprecatedImports: drizzle @deprecates the positional primaryKey(col) overload; we use the supported primaryKey({ columns }) object form below.
import { check, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { assets } from "./assets";
import { users } from "./users";

// CHECK lists derived from the canonical contract tuples (NOT re-spelled) — a CHECK is static DDL and cannot
// carry bound parameters, so it is built as a raw fragment (assets.ts / notifications.ts pattern).
const STATUS_CHECK_LIST = PLUGIN_STATUSES.map((s) => `'${s}'`).join(", ");
const ORIGIN_CHECK_LIST = PLUGIN_ORIGINS.map((o) => `'${o}'`).join(", ");
const KV_KEY_MAX_CHARS = 128;
const KV_VALUE_MAX_BYTES = 65_536; // 64 KiB

export const plugins = sqliteTable(
  "plugins",
  {
    // TypeID PK (`plugin_…`); brand is type-only, SQL is plain TEXT. App-minted; no DB default.
    id: text("id").$type<PluginId>().primaryKey(),
    // The installing principal — the single-owner partition key. User hard-delete cascades their plugins.
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // The manifest slug (unique per owner — the UNIQUE below) + the display/upgrade-ordering fields.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    version: text("version").notNull(),
    // The FULL validated manifest (provenance; re-validated on load). `builtAgainst` provenance lives here.
    manifest: text("manifest", { mode: "json" }).$type<PluginManifest>().notNull(),
    // The bundle bytes in the per-user CAS. RESTRICT: an installed plugin's bundle must not vanish.
    bundleAssetId: text("bundle_asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "restrict" }),
    // The confirmed grant subset (⊆ manifest.capabilities) — the guest feature-detects via host.grants.
    grantedCapabilities: text("granted_capabilities", { mode: "json" }).$type<PluginCapability[]>().notNull(),
    // Enum narrows to the contract union; a tuple-built CHECK enforces it at the SQL level.
    status: text("status", { enum: PLUGIN_STATUSES }).notNull(),
    // How the host obtained the bytes (reserved single-arm `upload`; `catalog` rides an additive member).
    origin: text("origin", { enum: PLUGIN_ORIGINS }).notNull(),
    // The 03 §4 auto-disable counter — a clean invocation resets it, 3 consecutive crashes → errored.
    consecutiveCrashes: integer("consecutive_crashes").notNull().default(0),
    lastError: text("last_error"),
    installedAt: integer("installed_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("plugins_owner_slug_unique").on(t.ownerId, t.slug),
    check("plugins_status_check", sql.raw(`status in (${STATUS_CHECK_LIST})`)),
    check("plugins_origin_check", sql.raw(`origin in (${ORIGIN_CHECK_LIST})`)),
  ],
);

// The PER-PLUGIN spend envelope (`plugin_budgets`) was stripped 2026-07-24 — enterprise spend enforcement.
// A runaway plugin's autonomous turns/images stay bounded by the per-member turn RATE cap + the cascade-depth
// guard (shared with automation); cost VISIBILITY rides the stats domain. No per-plugin $/action ceiling.

export const pluginKv = sqliteTable(
  "plugin_kv",
  {
    pluginId: text("plugin_id")
      .$type<PluginId>()
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    // Denormalized guard column (belt: every query filters WHERE plugin_id AND owner_id).
    ownerId: text("owner_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: text("value").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.pluginId, t.key] }),
    check("plugin_kv_key_check", sql.raw(`length(key) <= ${KV_KEY_MAX_CHARS}`)),
    check("plugin_kv_value_check", sql.raw(`length(value) <= ${KV_VALUE_MAX_BYTES}`)),
  ],
);
