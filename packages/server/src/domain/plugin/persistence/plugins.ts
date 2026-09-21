// domain/plugin/persistence/plugins — all `plugins`-row db access. Owner-scoped by construction: every
// read filters `ownerId` (the single-owner partition key), so a foreign/missing id is indistinguishable
// (leak-free). **That predicate IS the domain's whole authority model since D147** — plugins are user-scoped,
// anyone installs for themselves, and no verb consults a global role — so there is deliberately NO
// un-owner-scoped read here for an "admin may manage any row" branch to reach for. Adding one would run one
// user's untrusted bundle under another user's identity at `setEnabled`. The row's FULL manifest json is the
// provenance source `PluginView.builtAgainst` lifts from (no denormalized column). Queries only: grant math
// and CAS ordering live in the verbs.

import type { PluginCapability, PluginManifest, PluginOrigin, PluginStatus } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { plugins } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PluginBundleAssetLink } from "../contract/bundle-assets.ts";
import type { PluginView } from "../contract/results.ts";
import { clearPluginBundleAssetsStatement, linkPluginBundleAssetStatement } from "./plugin-assets.ts";

/** The stored `plugins` row. Homed as the db `$inferSelect` (the RuleRow precedent) — persistence's unit. */
type PluginRow = typeof plugins.$inferSelect;

/** WHO CAN SERVE THE NEXT VERSION for one row (#1740) — never how the bytes arrived. The `url` arm reads
 *  straight off the `source_url` the install recorded; the `showcase` arm is membership in the SHIPPED slug set.
 *
 *  `url` IS TESTED FIRST, deliberately: a user's OWN url install of a slug we also ship keeps its remembered
 *  source. It is their plugin — pointing its update button at our copy is precisely the takeover the seeder's
 *  divergence oracle refuses to perform. */
function updateSourceFor(row: PluginRow, showcaseSlugs: ReadonlySet<string>): PluginView["updateSource"] {
  if (row.sourceUrl !== null) {
    return "url";
  }
  return showcaseSlugs.has(row.slug) ? "showcase" : null;
}

/** Project a row to the owner-facing `PluginView` — the ONE projection (the install verb builds its return
 *  through this too, so a field added here can never be missing from a freshly-installed row's view).
 *  `builtAgainst`, `declaredCapabilities` and `netHosts` are all lifted from the persisted manifest json
 *  (provenance and the DECLARED ask ride INSIDE the manifest — no denormalized columns); `null` when the
 *  manifest declared none.
 *
 *  `showcaseSlugs` is the SHIPPED slug set (`ctx.showcase.slugs`, injected — this tier does not import content)
 *  and is what makes `updateSource` answerable at all (#1740): a seeded example arrives as an `upload` and is
 *  indistinguishable from a hand-uploaded plugin by column, so the only honest oracle is "does this build ship a
 *  bundle under that slug". A REQUIRED parameter rather than an optional one, so every call site is forced to
 *  say where its set comes from — a defaulted `new Set()` would silently project every seeded row as
 *  un-updatable on whichever path forgot. */
export function toPluginView(row: PluginRow, showcaseSlugs: ReadonlySet<string>): PluginView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    version: row.version,
    status: row.status,
    origin: row.origin,
    sourceUrl: row.sourceUrl,
    updateSource: updateSourceFor(row, showcaseSlugs),
    grantedCapabilities: row.grantedCapabilities,
    declaredCapabilities: row.manifest.capabilities,
    netHosts: row.manifest.netHosts ?? null,
    reconsentPending: row.pendingReconsent,
    widenedNetHosts: row.widenedNetHosts,
    builtAgainst: row.manifest.builtAgainst ?? null,
    lastError: row.lastError,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  };
}

/** The row an install writes (the fields not defaulted by the schema — `consecutiveCrashes` defaults 0). Local:
 *  callers (install) build it inline; persistence input shapes are not a cross-feature type home. */
interface InsertPluginRow {
  readonly id: PluginId;
  readonly ownerId: UserId;
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly manifest: PluginManifest;
  readonly bundleAssetId: AssetId;
  readonly grantedCapabilities: readonly PluginCapability[];
  readonly status: PluginStatus;
  readonly origin: PluginOrigin;
  /** The remembered fetch URL (U8 2b) — NULL for a file (`upload`) install; the db CHECK pairs it with `origin`. */
  readonly sourceUrl: string | null;
  readonly installedAt: number;
  readonly updatedAt: number;
}

/** Insert the row AND, atomically with it, the `plugin_assets` links for every image the bundle shipped
 *  (#820). ONE `db.batch` and not two awaits: a row whose links half-landed would render permanent
 *  placeholders for the missing paths while its blobs quietly aged into the GC's candidate set, and there is
 *  no self-heal for that — nothing re-reads the zip after install. (`db.transaction()` is banned repo-wide —
 *  the `:memory:` connection-replacement trap; `batchMany` is the sanctioned atomic write.)
 *  `bundleAssets` is empty for every bundle that ships none, which is every bundle written before #820, and
 *  the batch then carries exactly the one statement it always did. */
export async function insertPlugin(db: Db, row: InsertPluginRow, bundleAssets: readonly PluginBundleAssetLink[] = []): Promise<void> {
  const insertRow = buildInsertPluginStatement(db, row);
  if (bundleAssets.length === 0) {
    await insertRow;
    return;
  }
  await db.batch(batchMany([insertRow, ...bundleAssets.map((link) => linkPluginBundleAssetStatement(db, row.id, link))]));
}

function buildInsertPluginStatement(db: Db, row: InsertPluginRow): AwaitableBatchStmt<unknown> {
  return db.insert(plugins).values({
    id: row.id,
    ownerId: row.ownerId,
    slug: row.slug,
    name: row.name,
    version: row.version,
    manifest: row.manifest,
    bundleAssetId: row.bundleAssetId,
    grantedCapabilities: [...row.grantedCapabilities],
    status: row.status,
    origin: row.origin,
    sourceUrl: row.sourceUrl,
    // A fresh install has nothing to re-consent TO: the owner just chose this grant against this manifest.
    // Written explicitly rather than left to the column default so the insert states the whole row. The
    // empty delta rides with it — and it is the reinstall arm that makes this load-bearing rather than
    // decorative: uninstall drops the row, so a reinstall at the same slug mints a new one, and a delta
    // that defaulted from anywhere but "empty" would resurrect a badge for an update this row never saw.
    pendingReconsent: false,
    widenedNetHosts: [],
    consecutiveCrashes: 0,
    lastError: null,
    installedAt: row.installedAt,
    updatedAt: row.updatedAt,
  });
}

/** The installed plugin for `(ownerId, slug)` — the UNIQUE partition key (upgrade slug-match; install
 *  collision). `undefined` when the owner has no plugin at that slug. */
export async function getByOwnerSlug(db: Db, ownerId: UserId, slug: string): Promise<PluginRow | undefined> {
  const rows = await db
    .select()
    .from(plugins)
    .where(and(eq(plugins.ownerId, ownerId), eq(plugins.slug, slug)))
    .limit(1);
  return rows[0];
}

/** An owned plugin by id — owner-scoped (a foreign/missing id returns `undefined`, no existence leak). */
export async function getById(db: Db, ownerId: UserId, pluginId: PluginId): Promise<PluginRow | undefined> {
  const rows = await db
    .select()
    .from(plugins)
    .where(and(eq(plugins.id, pluginId), eq(plugins.ownerId, ownerId)))
    .limit(1);
  return rows[0];
}

/** Is `pluginId` an ENABLED plugin owned by `ownerId`? The confirm-time liveness re-check behind a
 *  posture-2 suggestion card (wired at compose into `domain/automation`'s `isPluginLive` — automation may not
 *  query this table). Owner-scoped like every other read here, so a foreign or missing id is `false` with no
 *  existence leak; `false` is also the fail-CLOSED answer for a disabled or errored row, which is the point —
 *  a card must not become one more act after the owner turned the plugin off. */
export async function isPluginEnabledFor(db: Db, ownerId: UserId, pluginId: PluginId): Promise<boolean> {
  const rows = await db
    .select({ status: plugins.status })
    .from(plugins)
    .where(and(eq(plugins.id, pluginId), eq(plugins.ownerId, ownerId)))
    .limit(1);
  return rows[0]?.status === "enabled";
}

/** How many of ONE owner's plugins are standing on their consent (#1041) — the number the aggregate inbox
 *  ask spends, counted in the db rather than folded off `listOwned` so the producer never pulls nine
 *  manifests to learn one integer. Owner-scoped like every other read here. */
export async function countPendingConsent(db: Db, ownerId: UserId): Promise<number> {
  const rows = await db
    .select({ pending: sql<number>`count(*)` })
    .from(plugins)
    .where(and(eq(plugins.ownerId, ownerId), eq(plugins.pendingReconsent, true)));
  return rows[0]?.pending ?? 0;
}

/** The caller's OWN plugins (fetchOwned), newest-installed first. */
export async function listOwned(db: Db, ownerId: UserId): Promise<PluginRow[]> {
  return await db.select().from(plugins).where(eq(plugins.ownerId, ownerId)).orderBy(desc(plugins.installedAt));
}

/** Every ENABLED row across ALL owners, projected to the two ids a restore needs — the ONE deliberately
 *  un-owner-scoped read in this file, and it has exactly one caller: the BOOT reactivation step
 *  (`entry/boot/reactivate-plugins.ts`).
 *
 *  WHY IT DOES NOT BREAK THIS FILE'S LAW. The header's ban is on an un-owner-scoped read serving an
 *  "admin may manage any row" branch, because that would run one user's untrusted bundle under another
 *  user's identity at `setEnabled`. This read cannot: it projects ONLY `id` + `ownerId` — never a manifest,
 *  a grant, a bundle asset or a `PluginView` — and its consumer turns each pair into that row's OWN owner's
 *  `setEnabled`, which re-loads the row through the owner-scoped `getById(db, caller.userId, pluginId)`
 *  before it activates anything. So the unscoped half answers only "which rows must be restored", and every
 *  restore still runs as the principal that owns it. A caller that wanted the ROW here instead of the pair
 *  would be the hole the header describes; keeping the projection at two ids is what makes that unspellable.
 *
 *  WHY IT EXISTS AT ALL: `PluginRegistry` is in-process and respawn-wiped, so after every restart an
 *  `enabled` row has no resident instance and contributes no surfaces, tools, transforms or subscriptions
 *  (#1865). The row is the record and the registry is a view of it (`activation/activate.ts`); this read is
 *  how boot re-derives the view. Ordered by `installedAt` so a restore pass is deterministic. */
export async function listEnabledAcrossOwners(db: Db): Promise<readonly { readonly pluginId: PluginId; readonly ownerId: UserId }[]> {
  return await db
    .select({ pluginId: plugins.id, ownerId: plugins.ownerId })
    .from(plugins)
    .where(eq(plugins.status, "enabled"))
    .orderBy(desc(plugins.installedAt));
}

/** Set the lifecycle status (+ `lastError`), stamping `updatedAt`. `lastError` clears to null on a clean
 *  enable/disable; carries the failure detail on an activation error. */
// @orb-waive owner-scoped-writes(plugins): the lifecycle write. The `plugins` row's owner is the installing principal; every user-facing plugin verb (`set-enabled`/`upgrade`/`uninstall`) loads it through the owner-scoped `getById(db, caller.userId, pluginId)` and throws `PluginNotFoundError` before any write. Ends the day a pluginId reaches a plugin write without that load.
export async function setStatus(
  db: Db,
  pluginId: PluginId,
  update: { readonly status: PluginStatus; readonly lastError: string | null; readonly updatedAt: number },
): Promise<void> {
  await db.update(plugins).set({ status: update.status, lastError: update.lastError, updatedAt: update.updatedAt }).where(eq(plugins.id, pluginId));
}

/** The upgrade write: swap the manifest-derived fields + the re-stored bundle asset + the recomputed
 *  grant, and set the resulting status (`disabled` when new caps were declared, else the prior status). Local
 *  (the upgrade verb builds it inline). */
interface UpgradePluginRow {
  readonly name: string;
  readonly version: string;
  readonly manifest: PluginManifest;
  readonly bundleAssetId: AssetId;
  readonly grantedCapabilities: readonly PluginCapability[];
  readonly status: PluginStatus;
  /** Did THIS upgrade widen declared reach and force the disable? Written here because this is the one
   *  moment the PRIOR manifest — the only source of the "what widened" fact — still exists before being
   *  overwritten. A non-widening upgrade writes `false`, which is also the honest answer: nothing new was
   *  asked for, so nothing is pending. */
  readonly pendingReconsent: boolean;
  /** WHICH hosts the pending re-consent added — the half of the delta the flag alone cannot name, and the
   *  half no read surface can reconstruct (the comparison is against the prior manifest, overwritten by this
   *  very write). Empty whenever `pendingReconsent` is false; the `plugins_widened_hosts_check` CHECK makes
   *  the other combination unwritable rather than merely discouraged. */
  readonly widenedNetHosts: readonly string[];
  readonly updatedAt: number;
}

/** The upgrade write. See {@link buildApplyUpgradeStatement} for the owner-scope exemption — the unscoped
 *  `update` moved there when this function became a batch (#820), and the marker moved with it. */
export async function applyUpgrade(db: Db, pluginId: PluginId, row: UpgradePluginRow, bundleAssets: readonly PluginBundleAssetLink[] = []): Promise<void> {
  // ONE atomic batch: the row swap, then the bundle-asset link set REPLACED wholesale (clear-then-insert,
  // #820). Replacement rather than merge is the point — an upgrade that DROPPED a sprite must leave no
  // resolvable path behind, and a merge would keep the old link alive as a reference the reap can never
  // clear. The clear touches only `bundle_path <> ''`, so runtime-fetched covers (#802) are untouched by an
  // upgrade, which is correct: they belong to the INSTALL, not to the bundle version.
  await db.batch(
    batchMany([
      buildApplyUpgradeStatement(db, pluginId, row),
      clearPluginBundleAssetsStatement(db, pluginId),
      ...bundleAssets.map((link) => linkPluginBundleAssetStatement(db, pluginId, link)),
    ]),
  );
}

// @orb-waive owner-scoped-writes(plugins): the upgrade swap. The `plugins` row's owner is the installing principal; every user-facing plugin verb (`set-enabled`/`upgrade`/`uninstall`) loads it through the owner-scoped `getById(db, caller.userId, pluginId)` and throws `PluginNotFoundError` before any write. Ends the day a pluginId reaches a plugin write without that load.
function buildApplyUpgradeStatement(db: Db, pluginId: PluginId, row: UpgradePluginRow): AwaitableBatchStmt<unknown> {
  return db
    .update(plugins)
    .set({
      name: row.name,
      version: row.version,
      manifest: row.manifest,
      bundleAssetId: row.bundleAssetId,
      grantedCapabilities: [...row.grantedCapabilities],
      status: row.status,
      pendingReconsent: row.pendingReconsent,
      widenedNetHosts: [...row.widenedNetHosts],
      lastError: null,
      updatedAt: row.updatedAt,
    })
    .where(eq(plugins.id, pluginId));
}

/** The RE-GRANT write: replace `granted_capabilities` and set the resulting status, leaving the manifest,
 *  the bundle and the crash counter untouched. Deliberately NARROW — the only column a consent act may move is
 *  the grant (plus the lifecycle status the verb re-derives), so a re-grant can never smuggle a manifest or a
 *  bundle swap past the install/upgrade trust edge. `lastError` clears: the row's stored failure described the
 *  PREVIOUS grant, and carrying it forward would misattribute it to this one. */
// @orb-waive owner-scoped-writes(plugins): the re-grant write. The `plugins` row's owner is the installing principal; every user-facing plugin verb (`set-enabled`/`upgrade`/`set-grant`/`uninstall`) loads it through the owner-scoped `getById(db, caller.userId, pluginId)` and throws `PluginNotFoundError` before any write. Ends the day a pluginId reaches a plugin write without that load.
export async function applyGrant(
  db: Db,
  pluginId: PluginId,
  update: {
    readonly grantedCapabilities: readonly PluginCapability[];
    readonly status: PluginStatus;
    /** `false` once the owner has consented to the WHOLE ask; still `true` after a PARTIAL re-grant, because
     *  the plugin is still asking for something they have not allowed and the surface must keep saying so. */
    readonly pendingReconsent: boolean;
    /** The host delta, carried while the re-consent still stands and emptied the moment it is answered — the
     *  notice is the only surface that renders these marks, and it renders iff `pendingReconsent`. Cleared
     *  here rather than left to rot: the CHECK refuses a settled row that still carries one. */
    readonly widenedNetHosts: readonly string[];
    readonly updatedAt: number;
  },
): Promise<void> {
  await db
    .update(plugins)
    .set({
      grantedCapabilities: [...update.grantedCapabilities],
      status: update.status,
      pendingReconsent: update.pendingReconsent,
      widenedNetHosts: [...update.widenedNetHosts],
      lastError: null,
      updatedAt: update.updatedAt,
    })
    .where(eq(plugins.id, pluginId));
}

/** Increment the consecutive-crash counter, returning BOTH the count this call produced and the one it moved
 *  FROM, so the crash policy can test the threshold CROSSING rather than the state. The pair is what makes a
 *  concurrent pair of crashes distinguishable: the atomic `+ 1` gives each caller its own `count`, and the
 *  `previous` beside it says which of them was the one that took the counter over the line. Reading the count
 *  alone, every crash at or above the threshold looks identical to the one that caused the disable — which is
 *  how two racing crashes put two `plugin-disabled` rows in one owner's inbox for one disable.
 *
 *  `previous` is DERIVED (`count - 1`) rather than read: SQLite's RETURNING is post-update and this statement
 *  adds exactly one, so a second read would be a slower way to compute the same number — and a racier one.
 *  Stamps `updatedAt`. */
// @orb-waive owner-scoped-writes(plugins): the crash-policy counter, written by the activation plane over the id it was activated with. The `plugins` row's owner is the installing principal; every user-facing plugin verb (`set-enabled`/`upgrade`/`uninstall`) loads it through the owner-scoped `getById(db, caller.userId, pluginId)` and throws `PluginNotFoundError` before any write. Ends the day a pluginId reaches a plugin write without that load.
export async function incrementCrashes(db: Db, pluginId: PluginId, updatedAt: number): Promise<{ readonly previous: number; readonly count: number }> {
  const rows = await db
    .update(plugins)
    .set({ consecutiveCrashes: sql`${plugins.consecutiveCrashes} + 1`, updatedAt })
    .where(eq(plugins.id, pluginId))
    .returning({ consecutiveCrashes: plugins.consecutiveCrashes });
  const count = rows[0]?.consecutiveCrashes ?? 0;
  return { previous: Math.max(count - 1, 0), count };
}

/** Reset the consecutive-crash counter to 0 (a clean invocation). */
// @orb-waive owner-scoped-writes(plugins): the crash-policy reset, written by the activation plane over the id it was activated with. The `plugins` row's owner is the installing principal; every user-facing plugin verb (`set-enabled`/`upgrade`/`uninstall`) loads it through the owner-scoped `getById(db, caller.userId, pluginId)` and throws `PluginNotFoundError` before any write. Ends the day a pluginId reaches a plugin write without that load.
export async function resetCrashes(db: Db, pluginId: PluginId, updatedAt: number): Promise<void> {
  await db.update(plugins).set({ consecutiveCrashes: 0, updatedAt }).where(eq(plugins.id, pluginId));
}

/** Record an activation/invocation failure detail without touching status. */
// @orb-waive owner-scoped-writes(plugins): the activation error detail, written by the activation plane over the id it was activated with. The `plugins` row's owner is the installing principal; every user-facing plugin verb (`set-enabled`/`upgrade`/`uninstall`) loads it through the owner-scoped `getById(db, caller.userId, pluginId)` and throws `PluginNotFoundError` before any write. Ends the day a pluginId reaches a plugin write without that load.
export async function setLastError(db: Db, pluginId: PluginId, lastError: string, updatedAt: number): Promise<void> {
  await db.update(plugins).set({ lastError, updatedAt }).where(eq(plugins.id, pluginId));
}

/** Delete the plugins row (uninstall). `plugin_kv` cascades; the bundle asset is reaped AFTER (the FK is
 *  RESTRICT, so the row's reference must be gone before the asset can be reaped — 02 §3). */
// @orb-waive owner-scoped-writes(plugins): the uninstall. The `plugins` row's owner is the installing principal; every user-facing plugin verb (`set-enabled`/`upgrade`/`uninstall`) loads it through the owner-scoped `getById(db, caller.userId, pluginId)` and throws `PluginNotFoundError` before any write. Ends the day a pluginId reaches a plugin write without that load.
export async function deletePlugin(db: Db, pluginId: PluginId): Promise<void> {
  await db.delete(plugins).where(eq(plugins.id, pluginId));
}
