// domain/plugin/persistence/plugins — all `plugins`-row db access (02 §3). Owner-scoped by construction: every
// read filters `ownerId` (the single-owner partition key), so a foreign/missing id is indistinguishable
// (leak-free). The row's FULL manifest json is the provenance source `PluginView.builtAgainst` lifts from
// (no denormalized column — 02 §3). Queries only: authority (`can`), grant math, and CAS ordering live in the
// verbs.

import type { PluginCapability, PluginManifest, PluginOrigin, PluginStatus } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { plugins } from "@orb/db";
import type { AssetId, PluginId, UserId } from "@orb/kit/ids";
import { and, desc, eq, sql } from "drizzle-orm";
import type { PluginView } from "../contract/results";

/** The stored `plugins` row. Homed as the db `$inferSelect` (the RuleRow precedent) — persistence's unit. */
type PluginRow = typeof plugins.$inferSelect;

/** Project a row to the owner-facing `PluginView` (02 §4). `builtAgainst` is lifted from the persisted manifest
 *  json (provenance rides INSIDE the manifest — no column, 02 §3); `null` when the manifest declared none. */
export function toPluginView(row: PluginRow): PluginView {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    version: row.version,
    status: row.status,
    origin: row.origin,
    grantedCapabilities: row.grantedCapabilities,
    builtAgainst: row.manifest.builtAgainst ?? null,
    consecutiveCrashes: row.consecutiveCrashes,
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
  readonly installedAt: number;
  readonly updatedAt: number;
}

export async function insertPlugin(db: Db, row: InsertPluginRow): Promise<void> {
  await db.insert(plugins).values({
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

/** The caller's OWN plugins (fetchOwned), newest-installed first. */
export async function listOwned(db: Db, ownerId: UserId): Promise<PluginRow[]> {
  return await db.select().from(plugins).where(eq(plugins.ownerId, ownerId)).orderBy(desc(plugins.installedAt));
}

/** Set the lifecycle status (+ `lastError`), stamping `updatedAt`. `lastError` clears to null on a clean
 *  enable/disable; carries the failure detail on an activation error (03 §4). */
export async function setStatus(
  db: Db,
  pluginId: PluginId,
  update: { readonly status: PluginStatus; readonly lastError: string | null; readonly updatedAt: number },
): Promise<void> {
  await db.update(plugins).set({ status: update.status, lastError: update.lastError, updatedAt: update.updatedAt }).where(eq(plugins.id, pluginId));
}

/** The upgrade write (02 §4): swap the manifest-derived fields + the re-stored bundle asset + the recomputed
 *  grant, and set the resulting status (`disabled` when new caps were declared, else the prior status). Local
 *  (the upgrade verb builds it inline). */
interface UpgradePluginRow {
  readonly name: string;
  readonly version: string;
  readonly manifest: PluginManifest;
  readonly bundleAssetId: AssetId;
  readonly grantedCapabilities: readonly PluginCapability[];
  readonly status: PluginStatus;
  readonly updatedAt: number;
}

export async function applyUpgrade(db: Db, pluginId: PluginId, row: UpgradePluginRow): Promise<void> {
  await db
    .update(plugins)
    .set({
      name: row.name,
      version: row.version,
      manifest: row.manifest,
      bundleAssetId: row.bundleAssetId,
      grantedCapabilities: [...row.grantedCapabilities],
      status: row.status,
      lastError: null,
      updatedAt: row.updatedAt,
    })
    .where(eq(plugins.id, pluginId));
}

/** Increment the consecutive-crash counter (03 §4), returning the NEW count so the crash policy can decide the
 *  auto-disable threshold. Stamps `updatedAt`. */
export async function incrementCrashes(db: Db, pluginId: PluginId, updatedAt: number): Promise<number> {
  const rows = await db
    .update(plugins)
    .set({ consecutiveCrashes: sql`${plugins.consecutiveCrashes} + 1`, updatedAt })
    .where(eq(plugins.id, pluginId))
    .returning({ consecutiveCrashes: plugins.consecutiveCrashes });
  return rows[0]?.consecutiveCrashes ?? 0;
}

/** Reset the consecutive-crash counter to 0 (a clean invocation — 03 §4). */
export async function resetCrashes(db: Db, pluginId: PluginId, updatedAt: number): Promise<void> {
  await db.update(plugins).set({ consecutiveCrashes: 0, updatedAt }).where(eq(plugins.id, pluginId));
}

/** Record an activation/invocation failure detail (03 §4) without touching status. */
export async function setLastError(db: Db, pluginId: PluginId, lastError: string, updatedAt: number): Promise<void> {
  await db.update(plugins).set({ lastError, updatedAt }).where(eq(plugins.id, pluginId));
}

/** Delete the plugins row (uninstall). `plugin_kv` cascades; the bundle asset is reaped AFTER (the FK is
 *  RESTRICT, so the row's reference must be gone before the asset can be reaped — 02 §3). */
export async function deletePlugin(db: Db, pluginId: PluginId): Promise<void> {
  await db.delete(plugins).where(eq(plugins.id, pluginId));
}
