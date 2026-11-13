// verb: importTheme — land a theme file (an orb backup, a single-theme export or a raw SillyTavern theme)
// in the owner's OWN theme library, ADDITIVELY (owner ruling, superseding restore-wins): equal content under
// a taken name reuses the row; different content lands under the next free name; no owned row is edited.
// Security: css re-runs the same validateThemeCss guard as createTheme — a failing css degrades to null.

import type { ImportReuse } from "@orb/contracts/import";
import type { FindOwnedThemes, ImportedThemeLanding, ImportThemeOp, SettingsImportOutcome } from "@orb/contracts/settings";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { validateThemeCss } from "@orb/kit/css-validate";
import type { Cancellation } from "@orb/kit/guards";
import type { UserId } from "@orb/kit/ids";
import { UnreadableJsonText } from "@orb/kit/json";
import { nextFreeName } from "@orb/kit/strings";
import { mapYielding } from "#primitives/abort";
import { portableParseError } from "#primitives/serde/lib";
import type { CanonicalTheme } from "#primitives/serde/theme";
import { parseThemeFile, THEME_SCHEMA_KIND, themeContentKey } from "#primitives/serde/theme";
import type { SettingsAssemblyContext, SettingsContext } from "../contract/service.ts";
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
  /** The ST keys the file left behind; they describe the file, so a reused theme states them too. */
  readonly unmapped: ImportedThemeLanding["unmapped"];
}

/** A theme as it is stored: css that fails the validator degrades to null. */
function withSafeCss(theme: CanonicalTheme): CanonicalTheme {
  return { ...theme, css: theme.css !== null && validateThemeCss(theme.css).errors.length === 0 ? theme.css : null };
}

/** Decide where one parsed theme lands: reuse the owned row with equal content, else a fresh row under the
 *  next free name. Mutates `library` so the themes of one file collide against each other too. */
function landTheme({ ctx, ownerId, theme, library, at, unmapped }: LandingArgs): {
  readonly landing: ImportedThemeLanding;
  readonly row: ThemeInsertRow | null;
} {
  const safe = withSafeCss(theme);
  const key = themeContentKey(safe);
  const existingName = library.nameByContentKey.get(key);
  if (existingName !== undefined) {
    return { landing: { name: existingName, renamedFrom: null, created: false, unmapped }, row: null };
  }
  const name = nextFreeName(safe.name, library.takenNames);
  library.takenNames.add(name);
  library.nameByContentKey.set(key, name);
  return {
    landing: { name, renamedFrom: name === safe.name ? null : safe.name, created: true, unmapped },
    row: { id: ctx.newThemeId(), ownerId, name, override: safe.override, css: safe.css, createdAt: at, updatedAt: at },
  };
}

// A stored override that is not JSON holds no content a file can match, so it never answers a reuse; its name stays taken.
function readableOwned(rows: Awaited<ReturnType<typeof listOwnedThemes>>): CanonicalTheme[] {
  return rows.flatMap((row) => (row.override instanceof UnreadableJsonText ? [] : [{ name: row.name, override: row.override, css: row.css }]));
}

/** Parse theme bytes and land them in the owner's theme library. `fallbackName` names a raw ST theme that
 *  carries no `name` of its own (the picked file's stem). */
export function createImportTheme(input: SettingsAssemblyContext): ImportThemeOp {
  const ctx: SettingsContext = { ...input, db: databaseForOwner(input.db) };
  return async (ownerId: UserId, bytes: Uint8Array, fallbackName?: string): Promise<SettingsImportOutcome> => {
    const parsed = parseThemeFile(bytes, fallbackName ?? UNNAMED_THEME);
    if (!parsed.ok) {
      return { ok: false, error: parsed.detail ?? portableParseError(THEME_SCHEMA_KIND, parsed.reason) };
    }

    const at = ctx.now();
    const owned = await listOwnedThemes(ctx.db, ownerId);
    const library: OwnedLibrary = {
      takenNames: new Set(owned.map((row) => row.name)),
      nameByContentKey: new Map(readableOwned(owned).map((row) => [themeContentKey(row), row.name])),
    };
    // Only a raw ST theme carries leftovers, and it is the file's one theme; an orb-native file leaves none behind.
    const unmapped = parsed.stTheme?.unmapped.map(({ field, place }) => ({ key: field, reason: place })) ?? [];
    const decided: { readonly landing: ImportedThemeLanding; readonly row: ThemeInsertRow | null }[] = [];
    for (const theme of parsed.value.themes) {
      decided.push(landTheme({ ctx, ownerId, theme, library, at, unmapped }));
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

/** The read-only twin of {@link createImportTheme}'s reuse test, for a preview that must not write. It judges the
 *  files in the order the import lands them, so a theme equal to an earlier file's answers `"upload"`. */
export function createFindOwnedThemes(input: Pick<SettingsAssemblyContext, "db">): FindOwnedThemes {
  const db = databaseForOwner(input.db);
  return async (ownerId: UserId, files: readonly Uint8Array[], signal: Cancellation): Promise<readonly (ImportReuse | null)[]> => {
    const owned = new Set(readableOwned(await listOwnedThemes(db, ownerId)).map((row) => themeContentKey(row)));
    // call-local: the content keys of the themes the files judged so far land. Ends if it outlives the call.
    const landed = new Set<string>();
    return await mapYielding(files, signal, (bytes): ImportReuse | null => {
      const parsed = parseThemeFile(bytes, UNNAMED_THEME);
      if (!parsed.ok || parsed.value.themes.length === 0) {
        return null;
      }
      const keys = parsed.value.themes.map((theme) => themeContentKey(withSafeCss(theme)));
      let reuse: ImportReuse | null = null;
      if (keys.every((key) => owned.has(key))) {
        reuse = "library";
      } else if (keys.every((key) => owned.has(key) || landed.has(key))) {
        reuse = "upload";
      }
      for (const key of keys) {
        landed.add(key);
      }
      return reuse;
    });
  };
}
