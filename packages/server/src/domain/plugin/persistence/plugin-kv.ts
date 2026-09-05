// domain/plugin/persistence/plugin-kv — the `storage.kv` plane: the plugin-PRIVATE KV, per plugin ×
// installing owner. Every query filters BOTH `plugin_id` AND `owner_id` (the denormalized guard column — belt
// vs a cross-owner read even if a plugin id were somehow reused). The value/key size CHECKs are DDL (schema);
// the 256-key cap is enforced host-side off `countKeys`. Queries only; the caps + validation live in the
// host functions that call these.

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

/** ATOMIC compare-and-set (#1442) — the one write in this file that is safe under concurrency, and the reason
 *  it is a distinct query rather than a caller-side read + `upsertKv`: THE PREDICATE RIDES THE WRITE. There is
 *  no JS `if` between a read and a write to interleave with, and no batch (a batch that reads first is not
 *  atomic either).
 *
 *  THE PREDICATE IS THE VALUE, not a version column — the house CAS idiom (`expectedContentHash` on
 *  `character/verbs/update`, `chat/verbs/edit`, `automation/contract/ops`) compares CONTENT, because a version
 *  counter is only as good as the writers that remember to bump it. For a KV plane the whole "content" of a
 *  row IS its value, so the value is compared directly rather than hashed: the DDL already caps it at 64 KiB,
 *  hashing would cost a round trip on every write, and an equality on the column is a predicate SQLite can
 *  evaluate inside the UPDATE, which a hash cannot.
 *
 *  Two arms, because "the key must not exist" cannot be expressed as an equality:
 *   - `expected === null` ⇒ INSERT … ON CONFLICT DO NOTHING. It applies iff this call is the one that created
 *     the row. The conflict target is the PK `(plugin_id, key)`; a row belonging to a FOREIGN owner therefore
 *     conflicts and does nothing, which is the same leak-free outcome the `upsertKv` `setWhere` belt gives.
 *   - otherwise ⇒ UPDATE … WHERE value = expected, with the same `plugin_id`/`owner_id` guard every other
 *     query here spells. `.returning()` is what reports the outcome: SQLite's RETURNING is POST-update, so a
 *     non-empty result means this statement is the one that moved the row.
 *
 *  `current` on a REFUSAL is a follow-up read and is therefore ADVISORY, not part of the decision — it is the
 *  caller's next `expected`, saving the guest a round trip it would otherwise spend re-reading. It can itself
 *  be stale by the time the caller sees it, which costs the retry loop one more turn and nothing else; the
 *  atomicity claim lives entirely in the single statement above. The value/key size CHECKs are DDL. */
export async function compareAndSetKv(
  db: Db,
  scope: KvScope,
  entry: { readonly key: string; readonly expected: string | null; readonly value: string; readonly updatedAt: number },
): Promise<{ applied: boolean; current: string | null }> {
  const applied =
    entry.expected === null
      ? (
          await db
            .insert(pluginKv)
            .values({ pluginId: scope.pluginId, ownerId: scope.ownerId, key: entry.key, value: entry.value, updatedAt: entry.updatedAt })
            .onConflictDoNothing({ target: [pluginKv.pluginId, pluginKv.key] })
            .returning({ key: pluginKv.key })
        ).length > 0
      : (
          await db
            .update(pluginKv)
            .set({ value: entry.value, updatedAt: entry.updatedAt })
            .where(
              and(eq(pluginKv.pluginId, scope.pluginId), eq(pluginKv.ownerId, scope.ownerId), eq(pluginKv.key, entry.key), eq(pluginKv.value, entry.expected)),
            )
            .returning({ key: pluginKv.key })
        ).length > 0;
  return applied ? { applied: true, current: entry.value } : { applied: false, current: await getKv(db, scope, entry.key) };
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
