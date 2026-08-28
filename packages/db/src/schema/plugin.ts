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
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { checkList } from "../kit/check-list.ts";
import { assets } from "./assets.ts";
import { users } from "./users.ts";

// CHECK lists derived from the canonical contract tuples (NOT re-spelled).
const STATUS_CHECK_LIST = checkList(PLUGIN_STATUSES);
const ORIGIN_CHECK_LIST = checkList(PLUGIN_ORIGINS);
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
    // How the host obtained the bytes (`upload` file install · `url` fetched through the egress guard; a
    // future `catalog` rides an additive member — the CHECK derives from the ONE contract tuple).
    origin: text("origin", { enum: PLUGIN_ORIGINS }).notNull(),
    // The URL a `url`-origin install was FETCHED FROM (plugin-ui-plane #679 U8 2b), remembered so the auto
    // update-check re-fetches the manifest and the one-click upgrade re-fetches the bundle without the owner
    // re-pasting it. NULL for an `upload` install (a handed-over file has no remembered source). It is not
    // derivable from anything else — the bytes are in the CAS but the URL they came from is not — which is the
    // whole reason it earns a column. Owner-scoped by the row it rides; a guest can name no other owner's row.
    sourceUrl: text("source_url"),
    // THE SYSTEM'S OWN REFUSAL, recorded — set when an UPGRADE widened declared reach and forced the row
    // `disabled`, cleared when the owner re-consents to the whole ask (`setGrant`) and on a fresh install.
    // It is a stored EVENT, not a derivable state, and that is what earns it a column: "declared ⊄ granted"
    // is TRUE for an enabled plugin with a paranoid grant and for a user's own toggle-off, so it cannot tell
    // the system's refusal from the person's choice. Without it a forced disable renders identically to a
    // toggle-off — the system refuses permissions on the user's behalf and then makes its refusal look like
    // their own decision. Once raised it is cleared by a COVERING `setGrant` and by nothing else — not by
    // enabling (which grants nothing) and not by a later non-widening upgrade (which would let an author
    // erase our refusal by shipping a follow-up bundle; see `verbs/upgrade.ts#refusalAfterUpgrade`).
    pendingReconsent: integer("pending_reconsent", { mode: "boolean" }).notNull().default(false),
    // WHICH HOSTS the pending re-consent added — the half of the delta `pending_reconsent` alone cannot name.
    // The capability half is computable from projected state (`declared \ granted`); the host half is not, and
    // never was: the widening is judged against the PRIOR manifest, and the `manifest` column above is
    // OVERWRITTEN by the same upgrade that computes the verdict. So the fact dies at the instant it exists
    // unless it is written down here, which is why a re-consent notice could only ever render the whole host
    // list unmarked (a false "New" on a consent surface being strictly worse than none).
    //
    // FULL LIFECYCLE, because a delta column that is set and never cleared is a stale-badge generator — the
    // same lie, delayed:
    //   SET    `verbs/upgrade.ts`, the one moment the prior manifest still exists. The value is the
    //          ACCUMULATED unanswered widening (`pendingWidenedNetHosts`), not just this upgrade's own — two
    //          widening upgrades in a row without a re-consent between them would otherwise silently un-badge
    //          the first one's hosts, which on a consent surface reads as "carried forward, already allowed".
    //   CLEAR  in LOCKSTEP with `pending_reconsent`: a covering `setGrant` empties it, a non-widening upgrade
    //          on a settled row writes `[]`, and a fresh install writes `[]`.
    //   DIES   at uninstall with the row (`deletePlugin`) — there is no clear-at-uninstall write to add, and a
    //          reinstall at the same slug mints a NEW row whose delta starts empty.
    // The lockstep is not prose: the CHECK below makes `pending_reconsent = 0 AND a non-empty delta` unwritable,
    // so a future writer that clears the flag and forgets the list gets a constraint violation instead of a
    // badge claiming an update is asking for something nobody is being asked about.
    widenedNetHosts: text("widened_net_hosts", { mode: "json" }).$type<string[]>().notNull().default(sql`'[]'`),
    // The 03 §4 auto-disable counter — a clean invocation resets it, 3 consecutive crashes → errored.
    consecutiveCrashes: integer("consecutive_crashes").notNull().default(0),
    lastError: text("last_error"),
    installedAt: integer("installed_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    uniqueIndex("plugins_owner_slug_unique").on(t.ownerId, t.slug),
    // The bundle FK is RESTRICT — every asset delete must PROBE this table to decide whether to refuse, and
    // without a leading index that probe is a full scan on the CAS-delete path (`fk-columns-indexed` gate).
    index("plugins_bundle_asset_idx").on(t.bundleAssetId),
    check("plugins_status_check", sql.raw(`status in (${STATUS_CHECK_LIST})`)),
    check("plugins_origin_check", sql.raw(`origin in (${ORIGIN_CHECK_LIST})`)),
    // origin ⟺ source_url, at the physics tier (constitution §2.2 — push the invariant up the ladder; a
    // coupling that lives only in the verbs' comments is a wish). `upload` is the ONE origin with no remembered
    // URL; every non-upload origin (today `url`, tomorrow a `catalog` fetcher) MUST carry one, because the whole
    // point of a non-upload origin is the source the update-check re-fetches. Written against `= 'upload'` rather
    // than `<> 'url'` so a future URL-bearing member inherits the constraint by construction — the only thing
    // that ever needs re-stating is which origins are URL-less, and there is exactly one.
    check("plugins_source_url_check", sql.raw("(origin = 'upload' and source_url is null) or (origin <> 'upload' and source_url is not null)")),
    // The delta's lockstep with the flag, at the physics tier (constitution §2.2 — push enforcement up the
    // ladder; a lifecycle that lives only in the verbs' comments is a wish). A settled row cannot carry a
    // "New" mark for an ask nobody is being asked about. `json_array_length` rather than a `= '[]'` string
    // compare so the constraint holds for any JSON spelling of empty, not just the one drizzle emits today.
    check("plugins_widened_hosts_check", sql.raw("pending_reconsent = 1 or json_array_length(widened_net_hosts) = 0")),
  ],
);

/** The SERVER-WIDE DISTRIBUTION SET (D147 clause (d), resolved 2026-08-24): what an admin has published to
 *  every user. It is a LIST OF PUBLISHED BUNDLES, never an install — the installs themselves are ordinary
 *  per-owner `plugins` rows minted by the fan-out, so nothing here is shared at run time (no shared row, no
 *  shared principal, no consent junction).
 *
 *  WHY IT IS ITS OWN TABLE rather than a marker on somebody's `plugins` row or a list in a settings blob —
 *  both were considered and both are defects:
 *    1. A marker on a user's row makes a USER act (their own uninstall, their own upgrade) silently mutate
 *       SERVER policy, which is the confused-ownership shape D147 exists to refuse.
 *    2. An `AssetId` held inside a JSON settings blob is INVISIBLE to `ASSET_REFS` (the FK enumeration both
 *       asset-GC paths iterate), so the published bundle's blob becomes reap-eligible the moment the
 *       distributing admin's own row goes away, and every future new-user application dangles. The FK below
 *       is what keeps those bytes alive — it is registered in `ASSET_REFS` as a RETAINING reference.
 *
 *  `slug` is the PRIMARY KEY, which states the invariant at the physics tier: a slug IS the plugin's
 *  identity, so the server publishes at most one bundle per slug. Re-distributing a slug REPLACES the record
 *  (version + bytes) — that is also how an admin publishes an update.
 *
 *  CASCADE, not RESTRICT, on the bundle FK — the opposite of `plugins.bundle_asset_id`, deliberately. Assets
 *  are PER-USER (D21: no cross-user shared bytes), so the published bundle is an asset owned by the
 *  distributing admin, and RESTRICT would make that admin's account undeletable by a policy row. A
 *  distribution whose bytes are gone is not a distribution, so it goes with them; existing recipients are
 *  untouched (each holds its own CAS copy) and only FUTURE new-user application stops. */
export const adminDistributedPlugins = sqliteTable(
  "admin_distributed_plugins",
  {
    // The manifest slug — the plugin's identity, and therefore the natural PK (see the header).
    slug: text("slug").primaryKey(),
    // Display fields denormalized off the VALIDATED manifest, so the admin's list reads without unzipping a
    // bundle. `version` is also load-bearing: `uninstallForAllUsers` compares it against each recipient's row
    // to decide whether that user has diverged.
    name: text("name").notNull(),
    version: text("version").notNull(),
    // The PUBLISHED bytes, in the distributing admin's own CAS — the source every later fan-out and every
    // new-user application re-reads. See the header for why this is CASCADE.
    bundleAssetId: text("bundle_asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    // WHO published it — provenance for the admin surface, and the reason a deleted admin's distribution stops
    // applying (their assets cascade away with them, and so does this row).
    distributedBy: text("distributed_by")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    distributedAt: integer("distributed_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    // Both FKs get a leading index (`fk-columns-indexed`): an asset delete and a user delete each probe this
    // table, and neither column leads the PK.
    index("admin_distributed_plugins_bundle_asset_idx").on(t.bundleAssetId),
    index("admin_distributed_plugins_distributed_by_idx").on(t.distributedBy),
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
    // The denormalized owner guard is ALSO an FK: a user hard-delete cascades these rows, and `ownerId` is
    // not the PK's leading column, so the delete scanned every KV row (`fk-columns-indexed` gate).
    index("plugin_kv_owner_idx").on(t.ownerId),
    check("plugin_kv_key_check", sql.raw(`length(key) <= ${KV_KEY_MAX_CHARS}`)),
    // ≤ 64 KiB of BYTES — length() on TEXT counts characters, so cast to BLOB for the byte cap.
    check("plugin_kv_value_check", sql.raw(`length(cast(value as blob)) <= ${KV_VALUE_MAX_BYTES}`)),
  ],
);
