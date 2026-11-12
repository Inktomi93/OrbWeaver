// verb: exportUserSettings — project the owner's settings to the share-safe allowlist and serialize to a
// portable backup file. projectShareSafe is the runtime secrets fence, enforced at the type level too
// (its return type PortableUserSettings structurally excludes secret fields) — the verb literally cannot
// hand a credential field to build. Pure read + serde, no write, no audit.
// An unreadable stored config refuses the export (`stored_config_unreadable`) rather than serializing the read's
// default stand-in as the user's settings.

import type { PortableFile } from "@orb/contracts/portability";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import { buildUserSettingsBackup, projectShareSafe } from "#primitives/serde/user-settings";
import { STORED_CONFIG_REFUSALS, unreadableStoredConfig } from "#primitives/stored-config";
import type { SettingsAssemblyContext, SettingsContext } from "../contract/service.ts";
import { readUserSettings } from "../persistence/queries.ts";

/** The relative filename the owner's share-safe settings serialize to. */
const USER_SETTINGS_BACKUP_FILENAME = "user-settings.json";

/** Read the owner's settings, project to the share-safe allowlist, and serialize to a portable file. */
export function createExportUserSettings(input: SettingsAssemblyContext): (ownerId: UserId) => Promise<PortableFile> {
  const ctx: SettingsContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId: UserId): Promise<PortableFile> => {
    const { config, configUnreadable } = await readUserSettings(ctx.db, ownerId);
    if (configUnreadable !== null) {
      throw unreadableStoredConfig(configUnreadable, `user_settings.config for ${ownerId}`, STORED_CONFIG_REFUSALS.export);
    }
    const bytes = buildUserSettingsBackup(projectShareSafe(config));
    return { filename: USER_SETTINGS_BACKUP_FILENAME, bytes };
  };
}
