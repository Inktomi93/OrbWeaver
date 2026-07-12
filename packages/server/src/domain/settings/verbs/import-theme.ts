// verb: importTheme — restore a theme-backup file into the owner's OWN theme library (the round-trip twin of
// `export-theme.ts`; §1 part 3). Writes the settings domain's OWN `themes` table (a domain writing its own
// tables — no cross-domain Option-B op needed).
//
// IDEMPOTENT / MERGE: each theme dedupes by `(ownerId, name)` (the `themes_owner_name_uq` index, case-
// sensitive — matching the manual `createTheme` conflict) — an existing name is left untouched, a new name is
// minted a fresh id. Re-importing the same file creates ZERO rows. Intra-file duplicate names collapse to the
// first; a blank name was already dropped by `parseThemeBackup`.
//
// SECURITY (the write boundary): the palette `override` is already D44-clamped inside the serde; here the
// self-authored `css` runs the SAME `validateThemeCss` containment guard `createTheme` uses. A theme whose css
// FAILS validation is still imported but with `css: null` (a safe degrade — the palette is preserved, the
// unsafe custom CSS is dropped rather than served) — resilient, never aborts the file for one bad entry.
//
// A file that is not a theme-backup (`parseThemeBackup` → null) returns `{ok:false, error}` (never throws) so
// the delivery core's per-file isolation holds and one bad file can't abort a bundle.

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
    // Collapse intra-file duplicate names (first wins) BEFORE the insert, so the minted ids and the
    // `(ownerId, name)` conflict target line up exactly with the manual-create path.
    const seen = new Set<string>();
    const values: (typeof themes.$inferInsert)[] = [];
    for (const t of backup.themes) {
      if (seen.has(t.name)) {
        continue;
      }
      seen.add(t.name);
      // The write-boundary css containment guard (the `createTheme` precedent). Unsafe css degrades to null —
      // the theme still restores, the unsafe custom CSS is never persisted/served.
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
