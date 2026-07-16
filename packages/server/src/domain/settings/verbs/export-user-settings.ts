// verb: exportUserSettings — project the owner's settings to the share-safe allowlist and serialize to a
// portable backup file. projectShareSafe is the runtime secrets fence, enforced at the type level too
// (its return type PortableUserSettings structurally excludes secret fields) — the verb literally cannot
// hand a credential field to build. Pure read + serde, no write, no audit.

import type { UserId } from "@orb/kit/ids";
import { buildUserSettingsBackup, projectShareSafe } from "#kit/serde/user-settings";
import type { SettingsPortableFile } from "../contract/portability";
import type { SettingsContext } from "../contract/service";
import { readUserSettings } from "../persistence/queries";

/** The relative filename the owner's share-safe settings serialize to. */
const USER_SETTINGS_BACKUP_FILENAME = "user-settings.json";

/** Read the owner's settings, project to the share-safe allowlist, and serialize to a portable file. */
export function createExportUserSettings(ctx: SettingsContext): (ownerId: UserId) => Promise<SettingsPortableFile> {
  return async (ownerId: UserId): Promise<SettingsPortableFile> => {
    const { config } = await readUserSettings(ctx.db, ownerId);
    const bytes = buildUserSettingsBackup(projectShareSafe(config));
    return { filename: USER_SETTINGS_BACKUP_FILENAME, bytes };
  };
}
