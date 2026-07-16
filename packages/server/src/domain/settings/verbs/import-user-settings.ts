// verb: importUserSettings — restore a user-settings-backup file into the owner's OWN settings.
// Per-namespace deep-merge of only the share-safe namespaces the file carried (never a whole-blob clobber),
// under the per-user write serializer; `created` is always false (merge into the always-present singleton).

import type { UserSettings } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import type { UserId } from "@orb/kit/ids";
import { parseUserSettingsBackup, SHARE_SAFE_SETTINGS_NAMESPACES } from "#kit/serde/user-settings";
import type { SettingsImportOutcome } from "../contract/portability";
import type { SettingsContext } from "../contract/service";
import { readUserSettings, writeUserConfig } from "../persistence/queries";
import { deepMergePlain } from "../substrate/merge";

const SETTINGS_IMPORT_BACKUP = "settings.importBackup";
const SETTINGS_ENTITY = "settings";

/** Parse user-settings-backup bytes and per-namespace-merge them into the owner's settings (idempotent). */
export function createImportUserSettings(ctx: SettingsContext): (ownerId: UserId, bytes: Uint8Array) => Promise<SettingsImportOutcome> {
  return async (ownerId: UserId, bytes: Uint8Array): Promise<SettingsImportOutcome> => {
    const parsed = parseUserSettingsBackup(bytes);
    if (parsed === null) {
      return { ok: false, error: "the file is not a valid orb user-settings export" };
    }

    return await ctx.serializeUserWrite(ownerId, async () => {
      const current = (await readUserSettings(ctx.db, ownerId)).config;
      const merged: Record<string, unknown> = { ...current };
      const applied: string[] = [];
      for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
        const incoming = parsed[ns];
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
      await writeUserConfig(ctx.db, ownerId, merged as UserSettings, at);
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
