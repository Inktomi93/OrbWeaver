// verb: exportUserSettings — project the owner's settings to the share-safe allowlist and serialize to a
// portable backup file. projectShareSafe is the runtime secrets fence, enforced at the type level too
// (its return type PortableUserSettings structurally excludes secret fields) — the verb literally cannot
// hand a credential field to build. Pure read + serde, no write, no audit.
// A stored config that reads only as the default stand-in is left out and reported to `note`, rather than serialized
// as the user's settings.

import type { PortableExportNotes, PortableFile } from "@orb/contracts/portability";
import { PORTABLE_EXPORT_CARRY, PORTABLE_USER_SETTINGS_ITEM } from "@orb/contracts/portability";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import { buildUserSettingsBackup, projectShareSafe } from "#primitives/serde/user-settings";
import { exportsStoredData, STORED_CONFIG_UNREADABLE } from "#primitives/stored-config";
import type { SettingsAssemblyContext, SettingsContext } from "../contract/service.ts";
import { readUserSettings } from "../persistence/queries.ts";

/** The relative filename the owner's share-safe settings serialize to. */
const USER_SETTINGS_BACKUP_FILENAME = "user-settings.json";

/** Read the owner's settings, project to the share-safe allowlist, and serialize to a portable file; `null` when the
 *  stored settings are left out. */
export function createExportUserSettings(input: SettingsAssemblyContext): (ownerId: UserId, note: PortableExportNotes) => Promise<PortableFile | null> {
  const ctx: SettingsContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId, note): Promise<PortableFile | null> => {
    const { config, configUnreadable } = await readUserSettings(ctx.db, ownerId);
    if (configUnreadable !== null && !exportsStoredData(configUnreadable)) {
      note({
        kind: "user-settings",
        item: PORTABLE_USER_SETTINGS_ITEM,
        code: STORED_CONFIG_UNREADABLE,
        failure: configUnreadable,
        carried: PORTABLE_EXPORT_CARRY.leftOut,
      });
      return null;
    }
    const bytes = buildUserSettingsBackup(projectShareSafe(config));
    return { filename: USER_SETTINGS_BACKUP_FILENAME, bytes };
  };
}
