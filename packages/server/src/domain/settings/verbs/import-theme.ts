// verb: importTheme — land a batch of theme files (orb backups, single-theme exports or raw SillyTavern themes)
// in the owner's OWN theme library, ADDITIVELY (owner ruling, superseding restore-wins): equal content reuses the
// row the owner holds or the batch landed; different content lands under the next free name; no owned row is
// edited. The dry run is this same loop with the write left out, so a preview cannot drift from the run.
// Security: css re-runs the same validateThemeCss guard as createTheme — a failing css degrades to null.

import type { ImportAnswer, ImportReuse } from "@orb/contracts/import";
import type { ImportedThemeLanding, ImportThemes, SettingsImportOutcome, ThemeImportFile } from "@orb/contracts/settings";
import { databaseForOwner } from "@orb/db/wiring-owner";
import { validateThemeCss } from "@orb/kit/css-validate";
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
type ThemeBatch = Omit<Parameters<ImportThemes>[0], "dryRun">;

/** The batch's library as the collision decision reads it: the names taken, each row's content key (the owner's and
 *  the batch's), and the keys the owner held before the batch. */
interface ThemeLibrary {
  readonly takenNames: Set<string>;
  readonly nameByContentKey: Map<string, string>;
  readonly ownedKeys: ReadonlySet<string>;
}

interface LandingArgs {
  readonly ctx: SettingsContext;
  readonly ownerId: UserId;
  readonly theme: CanonicalTheme;
  readonly library: ThemeLibrary;
  readonly at: number;
  /** The ST keys the file left behind; they describe the file, so a reused theme states them too. */
  readonly unmapped: ImportedThemeLanding["unmapped"];
}

/** A theme as it is stored: css that fails the validator degrades to null. */
function withSafeCss(theme: CanonicalTheme): CanonicalTheme {
  return { ...theme, css: theme.css !== null && validateThemeCss(theme.css).errors.length === 0 ? theme.css : null };
}

/** Decide where one parsed theme lands: reuse the row with equal content (`reused` says whether the owner held it or
 *  the batch landed it), else a fresh row under the next free name. Mutates `library` so every later theme of the
 *  batch collides against it too. */
function landTheme({ ctx, ownerId, theme, library, at, unmapped }: LandingArgs): {
  readonly landing: ImportedThemeLanding;
  readonly key: string;
  readonly reused: ImportReuse | null;
  readonly row: ThemeInsertRow | null;
} {
  const safe = withSafeCss(theme);
  const key = themeContentKey(safe);
  const existingName = library.nameByContentKey.get(key);
  if (existingName !== undefined) {
    const reused = library.ownedKeys.has(key) ? "library" : "upload";
    return { landing: { name: existingName, renamedFrom: null, created: false, unmapped }, key, reused, row: null };
  }
  const name = nextFreeName(safe.name, library.takenNames);
  library.takenNames.add(name);
  library.nameByContentKey.set(key, name);
  return {
    landing: { name, renamedFrom: name === safe.name ? null : safe.name, created: true, unmapped },
    key,
    reused: null,
    row: { id: ctx.newThemeId(), ownerId, name, override: safe.override, css: safe.css, createdAt: at, updatedAt: at },
  };
}

// A stored override that is not JSON holds no content a file can match, so it never answers a reuse; its name stays taken.
function readableOwned(rows: Awaited<ReturnType<typeof listOwnedThemes>>): CanonicalTheme[] {
  return rows.flatMap((row) => (row.override instanceof UnreadableJsonText ? [] : [{ name: row.name, override: row.override, css: row.css }]));
}

interface FileDecision {
  readonly answer: ImportAnswer;
  readonly outcome: SettingsImportOutcome;
  readonly rows: readonly ThemeInsertRow[];
}

/** What the batch does with one file, in the batch's order: a file reads as held when every theme in it is the
 *  owner's, as a repeat when every theme in it is reused, and as a write otherwise. */
function decideFile(args: Omit<LandingArgs, "theme" | "unmapped"> & { readonly file: ThemeImportFile }): FileDecision {
  const parsed = parseThemeFile(args.file.bytes, args.file.fallbackName ?? UNNAMED_THEME);
  if (!parsed.ok) {
    return {
      answer: { reuse: null, keys: [] },
      outcome: { ok: false, error: parsed.detail ?? portableParseError(THEME_SCHEMA_KIND, parsed.reason) },
      rows: [],
    };
  }
  // Only a raw ST theme carries leftovers, and it is the file's one theme; an orb-native file leaves none behind.
  const unmapped = parsed.stTheme?.unmapped.map(({ field, place }) => ({ key: field, reason: place })) ?? [];
  const decided = parsed.value.themes.map((theme) => landTheme({ ...args, theme, unmapped }));
  const rows = decided.flatMap((d) => (d.row === null ? [] : [d.row]));
  let reuse: ImportReuse | null = null;
  if (decided.length > 0 && decided.every((d) => d.reused === "library")) {
    reuse = "library";
  } else if (decided.length > 0 && rows.length === 0) {
    reuse = "upload";
  }
  return { answer: { reuse, keys: decided.map((d) => d.key) }, outcome: { ok: true, created: rows.length > 0, landed: decided.map((d) => d.landing) }, rows };
}

/** Land a batch of theme files in the owner's theme library, or with `dryRun` answer what that does. */
export function createImportTheme(input: SettingsAssemblyContext): ImportThemes {
  const ctx: SettingsContext = { ...input, db: databaseForOwner(input.db) };

  async function write(ownerId: UserId, { outcome, rows }: FileDecision, at: number): Promise<SettingsImportOutcome> {
    if (!outcome.ok || outcome.landed === undefined || outcome.landed.length === 0) {
      return outcome;
    }
    const inserted = new Set(await insertThemes(ctx.db, rows));
    const idByName = new Map(rows.map((row) => [row.name, row.id]));
    // A row the conflict guard skipped (a concurrent import took that name first) is reported as reused.
    const landed = outcome.landed.map((landing) => {
      const id = landing.created ? idByName.get(landing.name) : undefined;
      return id !== undefined && !inserted.has(id) ? { ...landing, created: false } : landing;
    });
    const metadata = { total: landed.length, created: inserted.size };
    await ctx.audit({ actorUserId: ownerId, action: THEME_IMPORT_BACKUP, entityType: THEME_ENTITY, metadata }, at);
    if (inserted.size > 0) {
      ctx.emitUserEvent(ownerId, { type: "themesChanged" });
    }
    return { ok: true, created: inserted.size > 0, landed };
  }

  async function importThemes(args: ThemeBatch & { readonly dryRun: true }): Promise<readonly ImportAnswer[]>;
  async function importThemes(args: ThemeBatch & { readonly dryRun: false }): Promise<readonly SettingsImportOutcome[]>;
  async function importThemes({
    ownerId,
    files,
    signal,
    dryRun,
  }: ThemeBatch & { readonly dryRun: boolean }): Promise<readonly ImportAnswer[] | readonly SettingsImportOutcome[]> {
    const owned = await listOwnedThemes(ctx.db, ownerId);
    const ownedKeys = readableOwned(owned).map((row) => [themeContentKey(row), row.name] as const);
    const library: ThemeLibrary = {
      takenNames: new Set(owned.map((row) => row.name)),
      nameByContentKey: new Map(ownedKeys),
      ownedKeys: new Set(ownedKeys.map(([key]) => key)),
    };
    const at = ctx.now();
    const decided = await mapYielding(files, signal, async (file) => {
      const decision = decideFile({ ctx, ownerId, library, at, file });
      return { answer: decision.answer, outcome: dryRun ? decision.outcome : await write(ownerId, decision, at) };
    });
    return dryRun ? decided.map(({ answer }) => answer) : decided.map(({ outcome }) => outcome);
  }
  return importThemes;
}
