// domain/plugin/substrate/storage — the `storage.kv` host op: the plugin-PRIVATE KV wrapping
// `persistence/plugin-kv` with the HOST-SIDE caps the DDL cannot express. Every op is keyed by BOTH pluginId AND
// ownerId (the persistence guard filter), so plugin A can never read plugin B's keys and no cross-owner read is
// possible. The value/key BYTE caps are DDL CHECKs (persistence surfaces them); this layer owns the 256-key cap
// (a count read the DDL can't do) — a `set` that would create a NEW key past the ceiling is refused with a typed
// error the membrane contains as guest errors-as-data (never a host crash). Pure of Principal (the bridge closed
// the scope over the installer); `db` is injected at compose.

import type { Db } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import type { PluginHostOps } from "../contract/ops.ts";
import { compareAndSetKv, countKeys, deleteKv, getKv, listKv, upsertKv } from "../persistence/plugin-kv.ts";

/** The per-plugin key ceiling ("≤ 256 keys/plugin"). Enforced HERE (a count the DDL cannot do); the
 *  value/key BYTE caps are DDL CHECKs. ONE home for the count cap. */
export const PLUGIN_KV_MAX_KEYS = 256;

/** A storage-cap refusal — the membrane's host-fn reject arm contains it as guest errors-as-data (a caught
 *  error to the guest, never a host crash). Thrown internally by `set`; not caught by name elsewhere. */
class PluginKvCapError extends Error {
  constructor(detail: string) {
    super(`plugin storage.kv cap: ${detail}`);
    this.name = "PluginKvCapError";
  }
}

/** Build the composed `storage.kv` op bundle (the `PluginHostOps.storage` shape). `set` enforces the 256-key
 *  ceiling: an upsert of an EXISTING key always proceeds (no new slot); a NEW key past the cap is refused. The
 *  value/key byte caps ride the DDL (a violating `upsert` throws the persistence's CHECK error — contained the
 *  same way). `nowMs` stamps `updatedAt`. */
export function buildPluginStorage(db: Db, nowMs: () => number): PluginHostOps["storage"] {
  return {
    get: (pluginId: PluginId, ownerId: UserId, key: string) => getKv(db, { pluginId, ownerId }, key),
    set: async (pluginId: PluginId, ownerId: UserId, key: string, value: string): Promise<void> => {
      const scope = { pluginId, ownerId };
      // Only a NEW key consumes a slot — an existing-key overwrite is always allowed. Read the current value to
      // decide (get is scope-filtered, so this is race-tolerant enough for a single-owner private store).
      const existing = await getKv(db, scope, key);
      if (existing === null && (await countKeys(db, scope)) >= PLUGIN_KV_MAX_KEYS) {
        throw new PluginKvCapError(`at most ${PLUGIN_KV_MAX_KEYS} keys per plugin`);
      }
      await upsertKv(db, scope, { key, value, updatedAt: nowMs() });
    },
    // The ATOMIC arm (#1442). The 256-key ceiling is checked on the CREATE precondition only, exactly like
    // `set`: `expected !== null` names a key that already exists, so it can consume no new slot. A refusal
    // here is the cap error (a host refusal), NOT `applied: false` — losing a race and hitting the ceiling are
    // different outcomes and a guest must be able to tell them apart.
    compareAndSet: async (
      pluginId: PluginId,
      ownerId: UserId,
      entry: { readonly key: string; readonly expected: string | null; readonly next: string },
    ): Promise<{ applied: boolean; current: string | null }> => {
      const scope = { pluginId, ownerId };
      if (entry.expected === null && (await getKv(db, scope, entry.key)) === null && (await countKeys(db, scope)) >= PLUGIN_KV_MAX_KEYS) {
        throw new PluginKvCapError(`at most ${PLUGIN_KV_MAX_KEYS} keys per plugin`);
      }
      return await compareAndSetKv(db, scope, { key: entry.key, expected: entry.expected, value: entry.next, updatedAt: nowMs() });
    },
    delete: (pluginId: PluginId, ownerId: UserId, key: string) => deleteKv(db, { pluginId, ownerId }, key),
    list: (pluginId: PluginId, ownerId: UserId, prefix: string | undefined) => listKv(db, { pluginId, ownerId }, prefix),
  };
}
