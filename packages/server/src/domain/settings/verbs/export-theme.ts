// verb: exportTheme — read the owner's OWNED themes as a portable theme-backup file (the uniform export/import
// portability template, §1 part 2). Owner-scoped: reads ONLY `themes` rows where `ownerId = ownerId`
// (`listOwnedThemes` — seeds are code-authored, ownerId IS NULL, and never travel), projects each to the
// id-less/owner-less `CanonicalTheme`, and hands the set to `#primitives/serde/theme`'s `buildThemeBackup`. PURE read
// + serde — no db write, no audit (a read leaves no trace). `import-theme.ts` is the round-trip twin.
// A theme whose stored override is not JSON refuses the export (`stored_config_unreadable`): the view's stand-in is
// the empty override, and a backup must never present it as the user's theme.

import type { PortableFile } from "@orb/contracts/portability";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { UserId } from "@orb/kit/ids";
import { UnreadableJsonText } from "@orb/kit/json";
import type { CanonicalTheme } from "#primitives/serde/theme";
import { buildThemeBackup } from "#primitives/serde/theme";
import { STORED_CONFIG_REFUSALS, unreadableStoredConfig } from "#primitives/stored-config";
import type { SettingsAssemblyContext, SettingsContext } from "../contract/service.ts";
import { listOwnedThemes } from "../persistence/theme-queries.ts";

/** The relative filename the owner's whole theme library serializes to (one backup file per owner). */
const THEME_BACKUP_FILENAME = "themes.json";

/** Read the owner's owned themes and serialize them to a theme-backup portable file. */
export function createExportTheme(input: SettingsAssemblyContext): (ownerId: UserId) => Promise<PortableFile> {
  const ctx: SettingsContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId: UserId): Promise<PortableFile> => {
    const rows = await listOwnedThemes(ctx.db, ownerId);
    const themes: CanonicalTheme[] = rows.map((row) => {
      if (row.override instanceof UnreadableJsonText) {
        throw unreadableStoredConfig(VERSIONED_PARSE_FAILURES.notJson, `themes.override for ${row.id}`, STORED_CONFIG_REFUSALS.export);
      }
      return { name: row.name, override: row.override, css: row.css };
    });
    return { filename: THEME_BACKUP_FILENAME, bytes: buildThemeBackup({ themes }) };
  };
}
