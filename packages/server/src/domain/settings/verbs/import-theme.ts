// verb: importTheme — land a theme file (an orb backup, a single-theme export or a raw SillyTavern theme)
// in the owner's OWN theme library, ADDITIVELY (owner ruling, superseding restore-wins): equal content under
// a taken name reuses the row; different content lands under the next free name; no owned row is edited.
// Security: css re-runs the same validateThemeCss guard as createTheme — a failing css degrades to null.

import { validateThemeCss } from "@orb/kit/css-validate";
import type { UserId } from "@orb/kit/ids";
import { nextFreeName } from "@orb/kit/strings";
import { portableParseError } from "#kit/serde/lib";
import type { CanonicalTheme } from "#kit/serde/theme";
import { parseThemeFile, THEME_SCHEMA_KIND, themeContentKey } from "#kit/serde/theme";
import type { ImportedThemeLanding, ImportTheme, SettingsImportOutcome } from "../contract/portability.ts";
import type { SettingsContext } from "../contract/service.ts";
import { insertThemes, listOwnedThemes } from "../persistence/theme-queries.ts";

const THEME_IMPORT_BACKUP = "theme.importBackup";
const THEME_ENTITY = "theme";
/** The name a nameless SillyTavern theme lands under when the door learned no filename. */
const UNNAMED_THEME = "Imported theme";

type ThemeInsertRow = Parameters<typeof insertThemes>[1][number];

/** The owner's library as the collision decision reads it: the names taken and each row's content key. */
interface OwnedLibrary {
  readonly takenNames: Set<string>;
  readonly nameByContentKey: Map<string, string>;
}

interface LandingArgs {
  readonly ctx: SettingsContext;
  readonly ownerId: UserId;
  readonly theme: CanonicalTheme;
  readonly library: OwnedLibrary;
  readonly at: number;
}

/** Decide where one parsed theme lands: reuse the owned row with equal content, else a fresh row under the
 *  next free name. Mutates `library` so the themes of one file collide against each other too. */
function landTheme({ ctx, ownerId, theme, library, at }: LandingArgs): { readonly landing: ImportedThemeLanding; readonly row: ThemeInsertRow | null } {
  const safe: CanonicalTheme = { ...theme, css: theme.css !== null && validateThemeCss(theme.css).errors.length === 0 ? theme.css : null };
  const key = themeContentKey(safe);
  const existingName = library.nameByContentKey.get(key);
  if (existingName !== undefined) {
    return { landing: { name: existingName, renamedFrom: null, created: false }, row: null };
  }
  const name = nextFreeName(safe.name, library.takenNames);
  library.takenNames.add(name);
  library.nameByContentKey.set(key, name);
  return {
    landing: { name, renamedFrom: name === safe.name ? null : safe.name, created: true },
    row: { id: ctx.newThemeId(), ownerId, name, override: safe.override, css: safe.css, createdAt: at, updatedAt: at },
  };
}

/** Parse theme bytes and land them in the owner's theme library. `fallbackName` names a raw ST theme that
 *  carries no `name` of its own (the picked file's stem). */
export function createImportTheme(ctx: SettingsContext): ImportTheme {
  return async (ownerId: UserId, bytes: Uint8Array, fallbackName?: string): Promise<SettingsImportOutcome> => {
    const parsed = parseThemeFile(bytes, fallbackName ?? UNNAMED_THEME);
    if (!parsed.ok) {
      return { ok: false, error: parsed.detail ?? portableParseError(THEME_SCHEMA_KIND, parsed.reason) };
    }

    const at = ctx.now();
    const owned = await listOwnedThemes(ctx.db, ownerId);
    const library: OwnedLibrary = {
      takenNames: new Set(owned.map((row) => row.name)),
      nameByContentKey: new Map(owned.map((row) => [themeContentKey({ override: row.override, css: row.css }), row.name])),
    };
    const decided: { readonly landing: ImportedThemeLanding; readonly row: ThemeInsertRow | null }[] = [];
    for (const theme of parsed.value.themes) {
      decided.push(landTheme({ ctx, ownerId, theme, library, at }));
    }
    const rows = decided.map((d) => d.row).filter((row): row is ThemeInsertRow => row !== null);
    const inserted = new Set(await insertThemes(ctx.db, rows));
    // A row the conflict guard skipped (a concurrent import took that name first) is reported as reused.
    const landed: ImportedThemeLanding[] = decided.map((d) => (d.row !== null && !inserted.has(d.row.id) ? { ...d.landing, created: false } : d.landing));

    if (parsed.value.themes.length > 0) {
      await ctx.audit(
        {
          actorUserId: ownerId,
          action: THEME_IMPORT_BACKUP,
          entityType: THEME_ENTITY,
          metadata: { total: parsed.value.themes.length, created: inserted.size },
        },
        at,
      );
      if (inserted.size > 0) {
        ctx.emitUserEvent(ownerId, { type: "themesChanged" });
      }
    }

    return { ok: true, created: inserted.size > 0, landed };
  };
}
