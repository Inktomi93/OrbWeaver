// domain/plugin/substrate/storage — the `storage.kv` host op: the plugin-PRIVATE KV wrapping
// `persistence/plugin-kv` with the host-side caps. Every op is keyed by BOTH pluginId AND
// ownerId (the persistence guard filter), so plugin A can never read plugin B's keys and no cross-owner read is
// possible. Both writers (`set`, `compareAndSet`) are the one place a server guest's write and the UI relay's write
// meet, so this layer owns every write cap and each refusal is a typed error the membrane contains as guest
// errors-as-data and `plugin.uiHostCall` answers as a coded client error:
//   - the key and value size caps and the NUL refusal, read from the relay's own `pluginKvKeySchema` /
//     `pluginKvValueSchema`. The table's CHECKs are only a second line: the key CHECK stops counting at a NUL.
//   - the 256-key cap, a count the DDL cannot read.
// Pure of Principal (the bridge closed the scope over the installer); `db` is injected at compose.

import {
  PLUGIN_KV_KEY_MAX_CHARS,
  PLUGIN_KV_MAX_KEYS,
  PLUGIN_KV_VALUE_MAX_BYTES,
  PLUGIN_UI_HOST_CALL_CODES,
  pluginKvKeySchema,
  pluginKvValueSchema,
} from "@orb/contracts/plugin";
import type { DatabaseHandle } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PluginId, UserId } from "@orb/kit/ids";
import { PluginKvCapError, PluginUiHostCallRefusedError } from "../contract/errors.ts";
import type { PluginHostOps } from "../contract/ops.ts";
import { compareAndSetKv, deleteKv, getKv, listKv, upsertKvUnderCap } from "../persistence/plugin-kv.ts";

/** Refuse a write whose key or any value is past its size cap or holds a NUL, with the relay's own invalid-arguments
 *  refusal, so a server guest and a plugin UI get one answer for one mistake. A `null` value is a compare-and-set's
 *  absent key. A NUL is refused because the driver returns text cut at its first NUL, so it would read back as a
 *  different string. */
function assertStorable(key: string, values: readonly (string | null)[]): void {
  const refused = !pluginKvKeySchema.safeParse(key).success || values.some((value) => value !== null && !pluginKvValueSchema.safeParse(value).success);
  if (refused) {
    throw new PluginUiHostCallRefusedError(
      `plugin storage.kv: a key holds 1 to ${PLUGIN_KV_KEY_MAX_CHARS} characters and a value at most ${PLUGIN_KV_VALUE_MAX_BYTES} UTF-8 bytes, neither with a NUL`,
      { code: PLUGIN_UI_HOST_CALL_CODES.argsInvalid },
    );
  }
}

/** Build the composed `storage.kv` op bundle (the `PluginHostOps.storage` shape). Both writers refuse a key or value
 *  past its size cap or holding a NUL before the statement runs. `set` enforces the 256-key ceiling: an upsert of an EXISTING key
 *  always proceeds (no new slot); a NEW key past the cap is refused. `nowMs` stamps `updatedAt`. */
export function buildPluginStorage(handle: DatabaseHandle, nowMs: () => number): PluginHostOps["storage"] {
  const db = databaseForOwner(handle);
  return {
    get: (pluginId: PluginId, ownerId: UserId, key: string) => getKv(db, { pluginId, ownerId }, key),
    // THE CEILING IS A PREDICATE ON THE WRITE, not a read this layer acts on. `storage.set` is UI-proxyable, so
    // a Tier-C `ui.js` writer and a second browser tab are real concurrent writers of these rows and nothing
    // serialises them: the old read-count-then-upsert let two sets for DISTINCT new keys both see the last free
    // slot and both take it. This layer states the LIMIT; persistence carries it into the statement.
    set: async (pluginId: PluginId, ownerId: UserId, key: string, value: string): Promise<void> => {
      assertStorable(key, [value]);
      const admitted = await upsertKvUnderCap(db, { pluginId, ownerId }, { key, value, updatedAt: nowMs() }, PLUGIN_KV_MAX_KEYS);
      if (!admitted) {
        throw new PluginKvCapError();
      }
    },
    // The ATOMIC arm, under the SAME ceiling predicate for the same reason: the create precondition is
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
      assertStorable(entry.key, [entry.expected, entry.next]);
      const scope = { pluginId, ownerId };
      const outcome = await compareAndSetKv(db, scope, { key: entry.key, expected: entry.expected, value: entry.next, updatedAt: nowMs() }, PLUGIN_KV_MAX_KEYS);
      if (entry.expected === null && !outcome.applied && outcome.current === null) {
        throw new PluginKvCapError();
      }
      return outcome;
    },
    delete: (pluginId: PluginId, ownerId: UserId, key: string) => deleteKv(db, { pluginId, ownerId }, key),
    list: (pluginId: PluginId, ownerId: UserId, prefix: string | undefined) => listKv(db, { pluginId, ownerId }, prefix),
  };
}
