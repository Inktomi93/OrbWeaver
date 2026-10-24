// verb: importUserSettings — restore a user-settings-backup file into the owner's OWN settings.
// Per-namespace deep-merge of only the share-safe namespaces the file carried (never a whole-blob clobber),
// under the per-user write serializer; `created` is always false (merge into the always-present singleton).

import type { UserSettings } from "@orb/contracts/settings";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { isPlainObject } from "@orb/kit/guards";
import type { UserId } from "@orb/kit/ids";
import { portableParseError } from "#primitives/serde/lib";
import { parseUserSettingsBackup, SHARE_SAFE_SETTINGS_NAMESPACES, USER_SETTINGS_SCHEMA_KIND } from "#primitives/serde/user-settings";
import type { SettingsImportOutcome } from "../contract/portability.ts";
import type { SettingsAssemblyContext, SettingsContext } from "../contract/service.ts";
import { ownedBackgroundIdsByHash, readUserSettings, writeUserConfig } from "../persistence/queries.ts";
import { deepMergePlain } from "../substrate/merge.ts";

const SETTINGS_IMPORT_BACKUP = "settings.importBackup";
const SETTINGS_ENTITY = "settings";

/** Point each background at the owner's asset with the carried bytes. A carried asset id names a row on the
 *  exporting box; the target may hold the same art under its own id (the first-login plates), and the asset
 *  restore refuses to mint a second row for bytes the owner already holds. */
async function relinkCarriedBackgrounds(ctx: SettingsContext, ownerId: UserId, config: UserSettings): Promise<UserSettings> {
  const { appearance } = config;
  const byHash = await ownedBackgroundIdsByHash(ctx.db, ownerId, [
    appearance.backgroundAssetHash,
    ...appearance.backgroundLibrary.map((entry) => entry.assetHash),
  ]);
  return {
    ...config,
    appearance: {
      ...appearance,
      backgroundAssetId: byHash.get(appearance.backgroundAssetHash) ?? appearance.backgroundAssetId,
      backgroundLibrary: appearance.backgroundLibrary.map((entry) => ({ ...entry, assetId: byHash.get(entry.assetHash) ?? entry.assetId })),
    },
  };
}

/** Parse user-settings-backup bytes and per-namespace-merge them into the owner's settings (idempotent). */
export function createImportUserSettings(input: SettingsAssemblyContext): (ownerId: UserId, bytes: Uint8Array) => Promise<SettingsImportOutcome> {
  const ctx: SettingsContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId: UserId, bytes: Uint8Array): Promise<SettingsImportOutcome> => {
    const parsed = parseUserSettingsBackup(bytes);
    if (!parsed.ok) {
      return { ok: false, error: portableParseError(USER_SETTINGS_SCHEMA_KIND, parsed.reason) };
    }
    const carried = parsed.value;

    return await ctx.serializeUserWrite(ownerId, async () => {
      const current = (await readUserSettings(ctx.db, ownerId)).config;
      const merged: Record<string, unknown> = { ...current };
      const applied: string[] = [];
      for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
        const incoming = carried[ns];
        if (!isPlainObject(incoming)) {
          continue;
        }
        const existing = current[ns];
        merged[ns] = deepMergePlain(isPlainObject(existing) ? existing : {}, incoming);
        applied.push(ns);
      }

      if (applied.length === 0) {
        return { ok: true, created: false };
      }

      const at = ctx.now();
      await writeUserConfig(ctx.db, ownerId, await relinkCarriedBackgrounds(ctx, ownerId, merged as UserSettings), at);
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: SETTINGS_IMPORT_BACKUP,
          entityType: SETTINGS_ENTITY,
          entityId: ownerId,
          metadata: { namespaces: applied },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "settingsChanged" });
      return { ok: true, created: false };
    });
  };
}
