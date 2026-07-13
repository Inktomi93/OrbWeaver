// verb: importTheme — restore a theme-backup file into the owner's OWN theme library.
// Idempotent: dedupes by (ownerId, name), existing names untouched, intra-file duplicates collapse to first.
// Security: css re-runs the same validateThemeCss guard as createTheme — a failing css degrades to null
// rather than aborting the import.

import type { themes } from "@orb/db";
import { validateThemeCss } from "@orb/kit/css-validate";
import type { UserId } from "@orb/kit/ids";
import { parseThemeBackup } from "#kit/serde/theme";
import type { SettingsImportOutcome } from "../contract/portability";
import type { SettingsContext } from "../contract/service";
import { insertOwnedThemesIfAbsent } from "../persistence/theme-queries";

const THEME_IMPORT_BACKUP = "theme.importBackup";
const THEME_ENTITY = "theme";

/** Parse theme-backup bytes and merge them into the owner's theme library (idempotent, dedup by name). */
export function createImportTheme(
  ctx: SettingsContext,
): (ownerId: UserId, bytes: Uint8Array) => Promise<SettingsImportOutcome> {
  return async (ownerId: UserId, bytes: Uint8Array): Promise<SettingsImportOutcome> => {
    const backup = parseThemeBackup(bytes);
    if (backup === null) {
      return { ok: false, error: "the file is not a valid orb theme-backup export" };
    }

    const at = ctx.now();
    const seen = new Set<string>();
    const values: (typeof themes.$inferInsert)[] = [];
    for (const t of backup.themes) {
      if (seen.has(t.name)) {
        continue;
      }
      seen.add(t.name);
      const css = t.css !== null && validateThemeCss(t.css).errors.length === 0 ? t.css : null;
      values.push({
        id: ctx.newThemeId(),
        ownerId,
        name: t.name,
        override: t.override,
        css,
        createdAt: at,
        updatedAt: at,
      });
    }

    const created = await insertOwnedThemesIfAbsent(ctx.db, values);

    if (created > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: THEME_IMPORT_BACKUP,
          entityType: THEME_ENTITY,
          metadata: { total: backup.themes.length, created },
        },
        at,
      );
      ctx.emitUserEvent(ownerId, { type: "themesChanged" });
    }

    return { ok: true, created: created > 0 };
  };
}
