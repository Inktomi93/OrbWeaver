// domain/plugin/persistence/distributed-plugins — all `admin_distributed_plugins` access: the SERVER-WIDE
// published set (D147 clause (d)). It is DEPLOYMENT POLICY, so — unlike its sibling `plugins.ts` — these
// reads are deliberately NOT owner-scoped: there is no owner. The authority that guards a WRITE here is the
// injected `requireAdmin` in the two distribution verbs, and it runs before any of these are reached.
//
// The one row per SLUG is the PK (schema/plugin.ts), so a re-publish REPLACES rather than accumulates —
// `upsertDistribution` is the publish, and it is also how an admin ships an update.
//
// NOTHING HERE READS OR WRITES A `plugins` ROW. A distribution record describes a bundle; the copies are
// ordinary per-owner rows minted by the real install verb under each recipient's own Principal.

import type { Db } from "@orb/db";
import { adminDistributedPlugins } from "@orb/db";
import type { AssetId, UserId } from "@orb/kit/ids";
import { asc, eq } from "drizzle-orm";
import type { DistributedPluginView } from "../contract/results.ts";

/** The stored `admin_distributed_plugins` row — the db `$inferSelect` (the `PluginRow` precedent). */
export type DistributedPluginRow = typeof adminDistributedPlugins.$inferSelect;

/** Project a record to the admin-facing view — the ONE projection, so a column added here can never be
 *  missing from a freshly-published record's view. `bundleAssetId`/`distributedBy` are deliberately NOT
 *  projected: an asset id is an internal handle, and the publisher's user id is not a fact the distribute
 *  surface acts on (it renders WHAT is published, not who to blame). */
export function toDistributedPluginView(row: DistributedPluginRow): DistributedPluginView {
  return {
    slug: row.slug,
    name: row.name,
    version: row.version,
    distributedAt: row.distributedAt,
    updatedAt: row.updatedAt,
  };
}

/** The published record for `slug`, or `undefined`. */
export async function getDistribution(db: Db, slug: string): Promise<DistributedPluginRow | undefined> {
  const rows = await db.select().from(adminDistributedPlugins).where(eq(adminDistributedPlugins.slug, slug)).limit(1);
  return rows[0];
}

/** The whole published set, oldest-published first (a stable order for a list a human reads). */
export async function listDistributions(db: Db): Promise<DistributedPluginRow[]> {
  return await db.select().from(adminDistributedPlugins).orderBy(asc(adminDistributedPlugins.distributedAt));
}

/** PUBLISH: insert the record, or REPLACE the mutable half of an existing one (name/version/bytes/publisher).
 *  `distributedAt` is preserved across a re-publish — it is when this slug FIRST became deployment policy,
 *  which is the fact an admin list is ordered by; `updatedAt` is what moves. */
export async function upsertDistribution(
  db: Db,
  row: {
    readonly slug: string;
    readonly name: string;
    readonly version: string;
    readonly bundleAssetId: AssetId;
    readonly distributedBy: UserId;
    readonly now: number;
  },
): Promise<void> {
  await db
    .insert(adminDistributedPlugins)
    .values({
      slug: row.slug,
      name: row.name,
      version: row.version,
      bundleAssetId: row.bundleAssetId,
      distributedBy: row.distributedBy,
      distributedAt: row.now,
      updatedAt: row.now,
    })
    .onConflictDoUpdate({
      target: adminDistributedPlugins.slug,
      set: {
        name: row.name,
        version: row.version,
        bundleAssetId: row.bundleAssetId,
        distributedBy: row.distributedBy,
        updatedAt: row.now,
      },
    });
}

/** WITHDRAW: drop the record. The published ASSET is deliberately NOT reaped here — it is a row in the
 *  publishing admin's own CAS, theirs to keep like any other upload; the ordinary asset GC collects it once
 *  nothing references it (this table is registered in `ASSET_REFS`, so the reference disappears with the row). */
export async function deleteDistribution(db: Db, slug: string): Promise<void> {
  await db.delete(adminDistributedPlugins).where(eq(adminDistributedPlugins.slug, slug));
}
