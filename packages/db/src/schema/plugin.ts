// schema/plugin — the installed-plugin registry + the plugin-private KV plane (D46; producer = domain/plugin).
// `plugins` is one row per (owner, slug): the FULL validated manifest is stored as json (provenance +
// re-validated on load — 02 §3; `builtAgainst` provenance rides INSIDE it, no denormalized column), the
// confirmed grant subset rides `granted_capabilities`, and the bundle bytes live in the per-user CAS
// (`bundle_asset_id` FK assets, ON DELETE RESTRICT — a deleted bundle under an installed plugin is corruption;
// uninstall deletes row-then-asset in one verb). `status`/`origin` DERIVE their CHECK from the ONE-home
// contract tuples (`@orb/contracts/plugin` — no re-spell, the ASSET_KINDS precedent). `plugin_kv` is the
// `storage.kv` plane: PK (plugin_id, key), a denormalized `owner_id` guard column (belt: WHERE both), the
// 128-char key / 64 KiB value caps as tuple-shared CHECK-DDL. `plugin_assets` is the plugin ASSET register —
// the FK column that makes a `net.fetchAsset` cover (#802) or a bundle-shipped `ui/assets/` image (#820)
// VISIBLE to the asset-GC ref registry; `bundle_path` distinguishes the two and resolves a UI node's path.

import type { PluginCapability, PluginManifest } from "@orb/contracts/plugin";
import { PLUGIN_ORIGINS, PLUGIN_STATUSES, PLUGIN_UI_ASSETS_DIR } from "@orb/contracts/plugin";
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

/** THE PLUGIN ASSET REGISTER (#802 fetched · #820 bundle-shipped): one row per (installed plugin, asset it
 *  holds, the bundle path it came from). It exists for exactly one reason — `ASSET_REFS` (the FK enumeration
 *  BOTH asset-GC paths iterate) can only see an `AssetId` sitting in a real FK column, and a `net.fetchAsset`
 *  cover landed in the installer's CAS with NO referencing row anywhere. So the scheduled `assets-gc` reaped a
 *  live hub cover one grace window after it was fetched, and the surface it was published to (a plugin UI
 *  state blob, which is JSON and therefore invisible to the enumeration too) dangled. This is the
 *  `message_assets` posture: a link row whose whole job is to make an otherwise-invisible reference VISIBLE to
 *  the registry.
 *
 *  TWO PROVENANCES, ONE TABLE (#820 seam 11): `bundle_path` is `''` for a RUNTIME-fetched cover (#802) and
 *  the zip entry path (`ui/assets/<name>`) for an INSTALL-TIME bundle-shipped image. It is one table and not
 *  two because the GC question is identical for both — "does an installed plugin still hold this blob" — and
 *  a second table would be a second thing to remember to register in `ASSET_REFS`, which is precisely the
 *  omission #802 was minted to fix. What differs is only whether the row can also ANSWER "which asset is
 *  `ui/assets/happy.png`", which is what the column adds.
 *
 *  WHY THE PATH IS IN THE PRIMARY KEY, and why it is `NOT NULL DEFAULT ''` rather than nullable. The CAS is
 *  content-addressed, so a bundle shipping TWO paths with IDENTICAL bytes dedups to ONE assetId — under the
 *  original (plugin_id, asset_id) key the second path would COLLIDE and be silently lost, and the node naming
 *  it would render a placeholder forever. And NULL is not available as the "no path" spelling: SQLite does not
 *  enforce NOT NULL on the PK columns of a rowid table, so NULLs would compare DISTINCT and the #802 re-fetch
 *  upsert would duplicate rows instead of refreshing one. `''` is therefore the sentinel, and the CHECK below
 *  is what keeps it from becoming a free-text column.
 *
 *  RETAINING, and the retention unit is the INSTALL: while the plugin is installed, everything it fetched
 *  stays live; uninstall CASCADEs these rows away and the covers become ordinary GC candidates (the uninstall
 *  verb reaps them eagerly — the ids it just orphaned — rather than leaving them for the scheduled sweep).
 *  That is deliberately reference-based, not TTL-based: a plugin has no way to say "I still need this", and
 *  approximating liveness by recency is what the guest-side 24h cache already does. Growth is bounded by
 *  DISTINCT images (the CAS is content-addressed, so a re-fetch of the same bytes returns the same assetId and
 *  this row is upserted, not duplicated), i.e. by what the user actually looked at.
 *
 *  Both FKs CASCADE. Plugin side: an uninstall must not be blocked by its own cache. Asset side: this row is
 *  a cache index, never a reason a blob is un-deletable (the RESTRICT posture is reserved for
 *  `plugins.bundle_asset_id`, where a missing blob IS corruption).
 *
 *  NO `owner_id` column, unlike `plugin_kv`: this is a pure junction (both parents are ownerId-scoped) and
 *  no coordinate is guest-supplied — the `pluginId` is closed over by the bridge, the `assetId` is MINTED by
 *  the CAS store from bytes the host itself fetched or unzipped under the installer's own Principal, and
 *  `bundle_path` is a zip entry name the install funnel already refused unless it matched
 *  `PLUGIN_UI_ASSET_ENTRY_RE` (anchored, flat, alphanumeric-led — a traversal is unspellable, not filtered).
 *  There is no spelling in which a guest names a foreign asset here, so a denormalized guard column would be
 *  a belt with nothing to hold. `fetched_at` is provenance (the last time this plugin pulled or unpacked these
 *  bytes), never a read key. */
export const pluginAssets = sqliteTable(
  "plugin_assets",
  {
    pluginId: text("plugin_id")
      .$type<PluginId>()
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .$type<AssetId>()
      .notNull()
      .references(() => assets.id, { onDelete: "cascade" }),
    /** The zip entry this asset was unpacked from (`ui/assets/<name>`, #820), or `''` for a runtime
     *  `net.fetchAsset` cover (#802) — see the table header for why the sentinel is `''` and not NULL. It is
     *  the RESOLUTION key: a UI node names a bundle path and `listPluginBundleAssets` turns it into the id. */
    bundlePath: text("bundle_path").notNull().default(""),
    // @column-ok: Diagnostic provenance for the last fetch or bundle unpack of this retained CAS link; asset
    // liveness is reference-based, so correctness must not read recency. Ends if link retention becomes TTL-based.
    fetchedAt: integer("fetched_at").notNull(),
  },
  (t) => [
    // (plugin_id, asset_id, bundle_path) is the identity: the same plugin re-fetching the same bytes upserts
    // ONE row (both #802 coordinates plus the empty path), while a bundle shipping the same image at two
    // paths keeps BOTH rows — the dedup'd assetId is the same, and the path is what tells them apart.
    // The leading two columns are unchanged, so every read written against the old key keeps its plan.
    primaryKey({ columns: [t.pluginId, t.assetId, t.bundlePath] }),
    // `asset_id` sits SECOND in the PK, so every asset delete (the CASCADE probe) and every "who fetched this"
    // lookup would full-scan without its own leading index (`fk-columns-indexed`).
    index("plugin_assets_asset_idx").on(t.assetId),
    // The path is either the "runtime fetch" sentinel or a real bundle entry — never free text. At the
    // physics tier (constitution §2.2) because a writer that stamped an arbitrary string here would put a
    // guest-influenced key into the ONE column a UI node resolves against.
    check("plugin_assets_bundle_path_check", sql.raw(`bundle_path = '' or bundle_path like '${PLUGIN_UI_ASSETS_DIR}%'`)),
  ],
);

export const pluginKv = sqliteTable(
  "plugin_kv",
  {
    pluginId: text("plugin_id")
      .$type<PluginId>()
      .notNull()
      .references(() => plugins.id, { onDelete: "cascade" }),
    // Denormalized guard column (belt: every query filters WHERE plugin_id AND owner_id).
    //
    // NOTHING TIES IT TO `plugins.owner_id`, AND THAT IS ACCEPTED (#1378 item 11 — the review's strongest
    // DB claim, and reachability-traced to nil). The PK is `(plugin_id, key)`, so a row could in principle
    // name plugin P while carrying a DIFFERENT user's `owner_id`, and SQLite cannot express a CHECK against
    // another table. UNREACHABLE today: every traced writer derives `ownerId` from a caller already gated
    // by `getById(db, callerUserId, pluginId)`, whose predicate is `WHERE id = ? AND owner_id = ?` — so the
    // pair is produced together from one authorization, never assembled.
    //
    // The honest CLOSURES were both weighed and refused for this lane: dropping the column (it IS derivable
    // through `plugins`) costs every KV query a join onto the hot host-fn path and deletes the belt the
    // comment above describes; adding it to the PK changes the table's identity and every upsert's conflict
    // target. Either is a design change, not a floor — file one if the join cost is ever measured as
    // acceptable. What is NOT acceptable is a future writer that takes `ownerId` as a parameter beside a
    // `pluginId` it did not authorize together.
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
