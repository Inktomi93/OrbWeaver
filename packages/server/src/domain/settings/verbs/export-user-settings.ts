// verb: exportUserSettings — project the owner's settings to the SHARE-SAFE allowlist and serialize them to a
// portable user-settings-backup file (the uniform export/import portability template, §1 part 2). Owner-scoped:
// reads THIS user's typed/defaulted `UserSettings` (`readUserSettings`), runs `projectShareSafe` (the RUNTIME
// secrets fence — copies ONLY the allowlisted namespaces, so a credential/connection/auth field is never read),
// and hands the projection to `#kit/serde/user-settings`'s `buildUserSettingsBackup`. PURE read + serde — no db
// write, no audit (a read leaves no trace). `import-user-settings.ts` is the round-trip twin.
//
// The fence is enforced at BOTH the type level (`projectShareSafe` returns `PortableUserSettings`, from which a
// secret field is structurally absent) and here at the boundary — the verb literally cannot hand a credential
// field to `build`.

import type { UserId } from "@orb/kit/ids";
import { buildUserSettingsBackup, projectShareSafe } from "#kit/serde/user-settings";
import type { SettingsPortableFile } from "../contract/portability";
import type { SettingsContext } from "../contract/service";
import { readUserSettings } from "../persistence/queries";

/** The relative filename the owner's share-safe settings serialize to. */
const USER_SETTINGS_BACKUP_FILENAME = "user-settings.json";

/** Read the owner's settings, project to the share-safe allowlist, and serialize to a portable file. */
export function createExportUserSettings(
  ctx: SettingsContext,
): (ownerId: UserId) => Promise<SettingsPortableFile> {
  return async (ownerId: UserId): Promise<SettingsPortableFile> => {
    const { config } = await readUserSettings(ctx.db, ownerId);
    const bytes = buildUserSettingsBackup(projectShareSafe(config));
    return { filename: USER_SETTINGS_BACKUP_FILENAME, bytes };
  };
}
