// Plugin canon is captured after the real lifecycle operation; guest storage and consent remain production-owned.
import type { Db } from "@orb/db";
import { adminDistributedPlugins, pluginAssets, pluginKv, plugins } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import type { ServicesResult } from "@orb/server/entry/compose";
import { and, eq } from "drizzle-orm";

type PluginService = ServicesResult["services"]["plugin"];

export type PluginRow = typeof plugins.$inferSelect;
export type AdminDistributedPluginRow = typeof adminDistributedPlugins.$inferSelect;
export type PluginAssetRow = typeof pluginAssets.$inferSelect;
export type PluginKvRow = typeof pluginKv.$inferSelect;

export interface CapturedPluginRows {
  readonly plugin: PluginRow;
  readonly assets: readonly PluginAssetRow[];
  readonly kv: readonly PluginKvRow[];
}

export interface SeededInstalledPlugin extends CapturedPluginRows {
  readonly outcome: Awaited<ReturnType<PluginService["install"]>>;
}

export interface SeededDistributedPlugin {
  readonly outcome: Awaited<ReturnType<PluginService["installForAllUsers"]>>;
  readonly distribution: AdminDistributedPluginRow;
  readonly installs: readonly CapturedPluginRows[];
}

/** Store validated bundle bytes through the actual install funnel, then capture its returned identity. */
export async function seedInstalledPlugin(
  db: Db,
  install: PluginService["install"],
  params: Parameters<PluginService["install"]>[0],
): Promise<SeededInstalledPlugin> {
  const outcome = await install(params);
  return { outcome, ...(await capturePluginRows(db, params.caller.userId, outcome.id)) };
}

/** Capture the actual grant/activation outcome, including contained activation failure rather than inventing enablement. */
export async function seedPluginGrant(
  db: Db,
  setGrant: PluginService["setGrant"],
  params: Parameters<PluginService["setGrant"]>[0],
): Promise<SeededInstalledPlugin> {
  const outcome = await setGrant(params);
  return { outcome, ...(await capturePluginRows(db, params.caller.userId, outcome.id)) };
}

/** The returned slug is the distribution PK; each recipient keeps its own canonical install and CAS ownership. */
export async function seedDistributedPlugin(
  db: Db,
  installForAllUsers: PluginService["installForAllUsers"],
  params: Parameters<PluginService["installForAllUsers"]>[0],
): Promise<SeededDistributedPlugin> {
  const outcome = await installForAllUsers(params);
  const distribution = await db.select().from(adminDistributedPlugins).where(eq(adminDistributedPlugins.slug, outcome.slug)).get();
  if (distribution === undefined) {
    throw new Error("production plugin distribution left no canonical publication row");
  }
  const rows = await db.select().from(plugins).where(eq(plugins.slug, outcome.slug)).orderBy(plugins.ownerId);
  const installs = await Promise.all(rows.map((row) => capturePluginRows(db, row.ownerId, row.id)));
  return { outcome, distribution, installs };
}

async function capturePluginRows(db: Db, ownerId: UserId, pluginId: PluginId): Promise<CapturedPluginRows> {
  const plugin = await db
    .select()
    .from(plugins)
    .where(and(eq(plugins.id, pluginId), eq(plugins.ownerId, ownerId)))
    .get();
  if (plugin === undefined) {
    throw new Error("production plugin lifecycle left no canonical owned install row");
  }
  const assets = await db.select().from(pluginAssets).where(eq(pluginAssets.pluginId, plugin.id)).orderBy(pluginAssets.bundlePath, pluginAssets.assetId);
  const kv = await db
    .select()
    .from(pluginKv)
    .where(and(eq(pluginKv.pluginId, plugin.id), eq(pluginKv.ownerId, ownerId)))
    .orderBy(pluginKv.key);
  return { plugin, assets, kv };
}
