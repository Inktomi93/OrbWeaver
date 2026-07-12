// verb: importUserSettings — restore a user-settings-backup file into the owner's OWN settings (the round-trip
// twin of `export-user-settings.ts`; §1 part 3). Writes the settings domain's OWN `user_settings` row.
//
// PER-NAMESPACE MERGE (R7): restores ONLY the share-safe namespaces the file actually carried (parse already
// dropped everything else), deep-merging EACH into the owner's current settings — never a whole-blob clobber,
// so a namespace the file omits keeps its current value. Read-merge-write under the per-user serializer so a
// concurrent same-user write can't be lost. Idempotent: re-importing the same file merges to the same result.
//
// THE FENCE holds on restore too: `parseUserSettingsBackup` yields ONLY allowlisted namespaces, so a crafted
// file with a `routing`/`credential` key can NEVER write connection/credential config — those keys are never
// read out. R10: the `credentials` domain has no portable entity; restore never touches keys (re-enter them).
//
// `created` is always false — restoring settings is a MERGE into the always-present per-user singleton, never a
// fresh entity create (the `PortableImportOutcome.created === false` = "updated/merged" semantics). A file that
// is not a user-settings-backup (`parseUserSettingsBackup` → null) returns `{ok:false, error}` (never throws).

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
export function createImportUserSettings(
  ctx: SettingsContext,
): (ownerId: UserId, bytes: Uint8Array) => Promise<SettingsImportOutcome> {
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
        // A valid but empty backup — nothing to restore; no write, no event.
        return { ok: true, created: false };
      }

      const at = ctx.now();
      // `merged` starts from the full current `UserSettings` and only deep-merges allowlisted namespace keys
      // (typed as `Record` so the union-indexed writes are sound); it is a complete, valid blob. Reads re-heal
      // it through `parseUserSettings`, and the merged-in namespaces were already healed by the serde parse.
      await writeUserConfig(ctx.db, ownerId, merged as UserSettings, at);
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: SETTINGS_IMPORT_BACKUP,
          entityType: SETTINGS_ENTITY,
          entityId: ownerId,
          // The restored namespace NAMES only — never the values (which could be verbose).
          metadata: { namespaces: applied },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "settingsChanged" });
      return { ok: true, created: false };
    });
  };
}
