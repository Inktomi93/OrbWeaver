// domain/plugin/persistence/plugin-kv — the `storage.kv` plane (02 §3): the plugin-PRIVATE KV, per plugin ×
// installing owner. Every query filters BOTH `plugin_id` AND `owner_id` (the denormalized guard column — belt
// vs a cross-owner read even if a plugin id were somehow reused). The value/key size CHECKs are DDL (schema);
// the 256-key cap is enforced host-side (P4) off `countKeys`. Queries only; the caps + validation live in the
// host functions that call these (03 §3).

import type { Db } from "@orb/db";
import { pluginKv } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import { and, eq, like } from "drizzle-orm";

/** The `(pluginId, ownerId)` scope every KV op runs under — the private-plane partition. Local: callers (the
 *  P4 host functions, tests) pass an inline `{ pluginId, ownerId }`; a persistence scope is not a type home. */
interface KvScope {
  readonly pluginId: PluginId;
  readonly ownerId: UserId;
}

/** Read one key's value; `null` when absent (or not this plugin×owner's — leak-free by the guard filter). */
export async function getKv(db: Db, scope: KvScope, key: string): Promise<string | null> {
  const rows = await db
    .select({ value: pluginKv.value })
    .from(pluginKv)
    .where(and(eq(pluginKv.pluginId, scope.pluginId), eq(pluginKv.ownerId, scope.ownerId), eq(pluginKv.key, key)))
    .limit(1);
  return rows[0]?.value ?? null;
}

/** Upsert a key (PK `(plugin_id, key)`); stamps `updatedAt`. The value/key size CHECKs are enforced by the DDL.
 *  The PK omits `owner_id` (a plugin_id already belongs to exactly one installer — `plugins.owner_id`), so the
 *  DO UPDATE arm carries the same `owner_id` belt every other query in this file spells in its WHERE: a
 *  collision with a foreign owner's row moves 0 rows instead of overwriting its value in place. */
export async function upsertKv(db: Db, scope: KvScope, entry: { readonly key: string; readonly value: string; readonly updatedAt: number }): Promise<void> {
  await db
    .insert(pluginKv)
    .values({ pluginId: scope.pluginId, ownerId: scope.ownerId, key: entry.key, value: entry.value, updatedAt: entry.updatedAt })
    .onConflictDoUpdate({
      target: [pluginKv.pluginId, pluginKv.key],
      setWhere: eq(pluginKv.ownerId, scope.ownerId),
      set: { value: entry.value, updatedAt: entry.updatedAt },
    });
}

/** Delete one key (a no-op when absent). */
export async function deleteKv(db: Db, scope: KvScope, key: string): Promise<void> {
  await db.delete(pluginKv).where(and(eq(pluginKv.pluginId, scope.pluginId), eq(pluginKv.ownerId, scope.ownerId), eq(pluginKv.key, key)));
}

/** List this plugin's keys, optionally prefix-filtered (`host.storage.list(prefix?)`), sorted ascending. */
export async function listKv(db: Db, scope: KvScope, prefix?: string): Promise<string[]> {
  const scopeFilter = and(eq(pluginKv.pluginId, scope.pluginId), eq(pluginKv.ownerId, scope.ownerId));
  const where = prefix === undefined || prefix.length === 0 ? scopeFilter : and(scopeFilter, like(pluginKv.key, `${prefix}%`));
  const rows = await db.select({ key: pluginKv.key }).from(pluginKv).where(where).orderBy(pluginKv.key);
  return rows.map((row) => row.key);
}

/** The plugin's key count — the source of the 256-key cap check (enforced host-side, P4). */
export async function countKeys(db: Db, scope: KvScope): Promise<number> {
  const rows = await db
    .select({ key: pluginKv.key })
    .from(pluginKv)
    .where(and(eq(pluginKv.pluginId, scope.pluginId), eq(pluginKv.ownerId, scope.ownerId)));
  return rows.length;
}
