// verb: exportTheme — read the owner's OWNED themes as a portable theme-backup file (the uniform export/import
// portability template, §1 part 2). Owner-scoped: reads ONLY `themes` rows where `ownerId = ownerId`
// (`listOwnedThemes` — seeds are code-authored, ownerId IS NULL, and never travel), projects each to the
// id-less/owner-less `CanonicalTheme`, and hands the set to `#kit/serde/theme`'s `buildThemeBackup`. PURE read
// + serde — no db write, no audit (a read leaves no trace). `import-theme.ts` is the round-trip twin.

import type { UserId } from "@orb/kit/ids";
import type { CanonicalTheme } from "#kit/serde/theme";
import { buildThemeBackup } from "#kit/serde/theme";
import type { SettingsPortableFile } from "../contract/portability";
import type { SettingsContext } from "../contract/service";
import { listOwnedThemes } from "../persistence/theme-queries";

/** The relative filename the owner's whole theme library serializes to (one backup file per owner). */
const THEME_BACKUP_FILENAME = "themes.json";

/** Read the owner's owned themes and serialize them to a theme-backup portable file. */
export function createExportTheme(
  ctx: SettingsContext,
): (ownerId: UserId) => Promise<SettingsPortableFile> {
  return async (ownerId: UserId): Promise<SettingsPortableFile> => {
    const rows = await listOwnedThemes(ctx.db, ownerId);
    const themes: CanonicalTheme[] = rows.map((row) => ({
      name: row.name,
      override: row.override,
      css: row.css,
    }));
    return { filename: THEME_BACKUP_FILENAME, bytes: buildThemeBackup({ themes }) };
  };
}
