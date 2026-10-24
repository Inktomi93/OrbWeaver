// Plugin rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import type { Db } from "@orb/db";
import { adminDistributedPlugins, pluginAssets, pluginKv, plugins } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import { and, eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { AdminDistributedPluginRow, PluginService } from "../plugin.ts";

export interface CapturedPluginRows {
  readonly plugin: typeof plugins.$inferSelect;
  readonly assets: readonly (typeof pluginAssets.$inferSelect)[];
  readonly kv: readonly (typeof pluginKv.$inferSelect)[];
}

/** Read canonical private rows after a native guest operation; these bytes never form portable fixture data. */
export async function capturePluginRows(db: Db, ownerId: UserId, pluginId: PluginId): Promise<CapturedPluginRows> {
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

export interface SeededInstalledPluginRows extends CapturedPluginRows {
  readonly outcome: Awaited<ReturnType<PluginService["install"]>>;
}

export interface SeededDistributedPluginRows {
  readonly outcome: Awaited<ReturnType<PluginService["installForAllUsers"]>>;
  readonly distribution: AdminDistributedPluginRow;
  readonly installs: readonly CapturedPluginRows[];
}

/** Store validated bundle bytes through the actual install funnel, then capture its returned identity. */
export async function seedInstalledPluginRows(root: ServerProducerRoot, params: Parameters<PluginService["install"]>[0]): Promise<SeededInstalledPluginRows> {
  const db = root.db;
  const install = root.services.plugin.install;
  const outcome = await install(params);
  return { outcome, ...(await capturePluginRows(db, params.caller.userId, outcome.id)) };
}

/** Capture the actual grant/activation outcome, including contained activation failure rather than inventing enablement. */
export async function seedPluginGrantRows(root: ServerProducerRoot, params: Parameters<PluginService["setGrant"]>[0]): Promise<SeededInstalledPluginRows> {
  const db = root.db;
  const setGrant = root.services.plugin.setGrant;
  const outcome = await setGrant(params);
  return { outcome, ...(await capturePluginRows(db, params.caller.userId, outcome.id)) };
}

/** The returned slug is the distribution PK; each recipient keeps its own canonical install and CAS ownership. */
export async function seedDistributedPluginRows(
  root: ServerProducerRoot,
  params: Parameters<PluginService["installForAllUsers"]>[0],
): Promise<SeededDistributedPluginRows> {
  const db = root.db;
  const installForAllUsers = root.services.plugin.installForAllUsers;
  const outcome = await installForAllUsers(params);
  const distribution = await db.select().from(adminDistributedPlugins).where(eq(adminDistributedPlugins.slug, outcome.slug)).get();
  if (distribution === undefined) {
    throw new Error("production plugin distribution left no canonical publication row");
  }
  const rows = await db.select().from(plugins).where(eq(plugins.slug, outcome.slug)).orderBy(plugins.ownerId);
  const installs = await Promise.all(rows.map((row) => capturePluginRows(db, row.ownerId, row.id)));
  return { outcome, distribution, installs };
}
