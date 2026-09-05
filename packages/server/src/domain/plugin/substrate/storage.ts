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
import { compareAndSetKv, deleteKv, getKv, listKv, upsertKvUnderCap } from "../persistence/plugin-kv.ts";

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
    // THE CEILING IS A PREDICATE ON THE WRITE, not a read this layer acts on. `storage.set` is UI-proxyable, so
    // a Tier-C `ui.js` writer and a second browser tab are real concurrent writers of these rows and nothing
    // serialises them: the old read-count-then-upsert let two sets for DISTINCT new keys both see the last free
    // slot and both take it. This layer states the LIMIT; persistence carries it into the statement.
    set: async (pluginId: PluginId, ownerId: UserId, key: string, value: string): Promise<void> => {
      const admitted = await upsertKvUnderCap(db, { pluginId, ownerId }, { key, value, updatedAt: nowMs() }, PLUGIN_KV_MAX_KEYS);
      if (!admitted) {
        throw new PluginKvCapError(`at most ${PLUGIN_KV_MAX_KEYS} keys per plugin`);
      }
    },
    // The ATOMIC arm (#1442), under the SAME ceiling predicate for the same reason: the create precondition is
    // the only arm that can consume a slot (`expected !== null` names a key that already exists), and it now
    // carries the cap inside its own INSERT rather than checking it one statement earlier.
    //
    // A cap refusal is the cap ERROR (a host refusal), NOT `applied: false` — losing a race and hitting the
    // ceiling are different outcomes and a guest must be able to tell them apart. The two are distinguished by
    // what the row LOOKS like afterwards: a create that did not apply and finds no row was refused by the
    // ceiling (there is nothing it could have lost a race to); one that finds a row lost the race.
    compareAndSet: async (
      pluginId: PluginId,
      ownerId: UserId,
      entry: { readonly key: string; readonly expected: string | null; readonly next: string },
    ): Promise<{ applied: boolean; current: string | null }> => {
      const scope = { pluginId, ownerId };
      const outcome = await compareAndSetKv(db, scope, { key: entry.key, expected: entry.expected, value: entry.next, updatedAt: nowMs() }, PLUGIN_KV_MAX_KEYS);
      if (entry.expected === null && !outcome.applied && outcome.current === null) {
        throw new PluginKvCapError(`at most ${PLUGIN_KV_MAX_KEYS} keys per plugin`);
      }
      return outcome;
    },
    delete: (pluginId: PluginId, ownerId: UserId, key: string) => deleteKv(db, { pluginId, ownerId }, key),
    list: (pluginId: PluginId, ownerId: UserId, prefix: string | undefined) => listKv(db, { pluginId, ownerId }, prefix),
  };
}
