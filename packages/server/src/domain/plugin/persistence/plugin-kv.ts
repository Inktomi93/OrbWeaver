// domain/plugin/persistence/plugin-kv — the `storage.kv` plane: the plugin-PRIVATE KV, per plugin ×
// installing owner. Every query filters BOTH `plugin_id` AND `owner_id` (the denormalized guard column — belt
// vs a cross-owner read even if a plugin id were somehow reused). The value/key size CHECKs are DDL (schema);
// the per-plugin KEY-COUNT cap rides the WRITE (`admitsWrite` — a subquery predicate inside the one INSERT,
// never a `countKeys` read the caller acts on afterwards; two UI-proxyable writers raced that gap and put 257
// keys behind a 256-key ceiling). The LIMIT itself is still the host layer's to state — it is passed in, so
// this file holds no policy number. Queries only; validation lives in the host functions that call these.

import type { Db } from "@orb/db";
import { pluginKv } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, like, sql } from "drizzle-orm";

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

/** Upsert a key UNDER THE PER-PLUGIN KEY CEILING, in ONE statement — the count is a predicate on the write,
 *  never a read before it (the `compareAndSetKv` rule below, and the `reserveFireBudget` conditional-INSERT
 *  idiom one domain over). Returns whether the row landed; `false` means the ceiling refused it, and the
 *  caller turns that into the typed host error.
 *
 *  WHY IT CANNOT BE A CHECK-THEN-WRITE: `storage.set` is UI-proxyable, so a Tier-C `ui.js` writer and a second
 *  browser tab are genuine concurrent writers of these rows and nothing serialises them. Two sets for
 *  DISTINCT new keys, one slot left: both read the count, both saw room, both inserted, and the plugin held
 *  257 keys behind a 256-key cap. A JS `if` between the count and the insert is the whole hole.
 *
 *  THE PREDICATE HAS TWO ARMS because "only a NEW key consumes a slot" is part of the rule: the count gate
 *  OR the key already exists. Without the second arm an overwrite AT the ceiling — which consumes nothing —
 *  would be refused, and a plugin that filled its store could never update anything in it again. Both
 *  subqueries are evaluated inside the one statement, so there is no window between them.
 *
 *  The `DO UPDATE` arm carries the same `owner_id` belt every other query here spells: the PK omits
 *  `owner_id` (a plugin_id already belongs to exactly one installer — `plugins.owner_id`), so a collision
 *  with a foreign owner's row must move 0 rows rather than overwrite its value in place. That arm is
 *  structurally unreachable, which is why 0 rows is read as the cap refusal.
 *
 *  The value/key size CHECKs stay DDL (a violating write throws the constraint error, contained upstream). */
export async function upsertKvUnderCap(
  db: Db,
  scope: KvScope,
  entry: { readonly key: string; readonly value: string; readonly updatedAt: number },
  maxKeys: number,
): Promise<boolean> {
  const result = await db.run(sql`
    INSERT INTO plugin_kv (plugin_id, owner_id, key, value, updated_at)
    SELECT ${scope.pluginId}, ${scope.ownerId}, ${entry.key}, ${entry.value}, ${entry.updatedAt}
    WHERE ${admitsWrite(scope, entry.key, maxKeys)}
    ON CONFLICT (plugin_id, key) DO UPDATE
      SET value = excluded.value, updated_at = excluded.updated_at
      WHERE plugin_kv.owner_id = ${scope.ownerId}
  `);
  return result.rowsAffected > 0;
}

/** The key-ceiling predicate BOTH write paths ride, as one SQL fragment so the two cannot drift into
 *  disagreeing about what consumes a slot: there is room under the cap, OR this key already exists (an
 *  overwrite consumes nothing and must always proceed, including AT the ceiling). Both subqueries are
 *  evaluated inside the single statement that carries them, which is the whole point — the count and the
 *  write are one atom, with no JS `if` between them for a second writer to slip through. */
function admitsWrite(scope: KvScope, key: string, maxKeys: number): SQL {
  return sql`(
      SELECT count(*) FROM plugin_kv AS held
      WHERE held.plugin_id = ${scope.pluginId} AND held.owner_id = ${scope.ownerId}
    ) < ${maxKeys}
    OR EXISTS (
      SELECT 1 FROM plugin_kv AS existing
      WHERE existing.plugin_id = ${scope.pluginId} AND existing.owner_id = ${scope.ownerId} AND existing.key = ${key}
    )`;
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
 *   - `expected === null` ⇒ INSERT … ON CONFLICT DO NOTHING, under the SAME key-ceiling predicate the plain
 *     write rides ({@link admitsWrite}) — a create is a create whichever door it came through, and a cap
 *     checked before this statement rather than inside it is the same two-writer hole one arm over. It
 *     applies iff this call is the one that created the row. The conflict target is the PK
 *     `(plugin_id, key)`; a row belonging to a FOREIGN owner therefore conflicts and does nothing, which is
 *     the same leak-free outcome the upsert's `owner_id` belt gives. A create that moved 0 rows AND finds no
 *     row afterwards was refused by the CEILING (nothing exists to have lost a race to), which is how the
 *     caller tells "I lost the race" from "the store is full" without a second decision point.
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
  maxKeys: number,
): Promise<{ applied: boolean; current: string | null }> {
  const applied =
    entry.expected === null
      ? (
          await db.run(sql`
            INSERT INTO plugin_kv (plugin_id, owner_id, key, value, updated_at)
            SELECT ${scope.pluginId}, ${scope.ownerId}, ${entry.key}, ${entry.value}, ${entry.updatedAt}
            WHERE ${admitsWrite(scope, entry.key, maxKeys)}
            ON CONFLICT (plugin_id, key) DO NOTHING
          `)
        ).rowsAffected > 0
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
