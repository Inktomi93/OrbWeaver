// THE THEME ARM of the settings shim — a per-run, NON-MUTATING override of which APP THEME the run renders
// under (`--theme <name|id|none>`), the sibling axis of `--appearance` (_kit/appearance.ts owns the
// interception; this file owns what a theme request MEANS).
//
// WHY THIS EXISTS (#225): `--appearance` reaches `config.appearance` only, but the ACTIVE THEME is a
// DIFFERENT settings axis — `config.theme.selectedThemeId` — so "score this surface under the Light seed
// theme" was undrivable without writing the owner's settings row. Theme-polarity coverage therefore rode
// only on carried-theme ROOMS (a character card's own palette); every surface without a carried room (Home,
// Configuration, Analytics…) had no light arm at all.
//
// THE MECHANISM (source-pinned): `use-selected-theme.ts` reads `settings.getUserSettings` →
// `config.theme.selectedThemeId`, then fetches `settings.getTheme({id})` for that row; app-shell derives
// `data-theme={theme.name.toLowerCase()}` for a SEED theme (its palette is the generated `[data-theme]`
// block in @orb/ui theme.css) and feeds a CUSTOM theme's override through <ThemeScope>
// (resolve-theme-scope-tokens.ts, D71). So pretending the POINTER is the whole shim: the app then fetches
// the REAL theme row itself and every downstream layer (block, ThemeScope, custom css, background) follows.
// Nothing is fabricated and nothing is written.
//
// NAME → ID: the id is a sentinel the probe must not re-spell (a second home for
// domain/settings/constants.ts), and custom themes have minted ids no constant could know. So the shim asks
// the app's own API — one read-only `settings.listThemes` GET on the browser context's cookie jar — and
// matches the request against the real library. A name that is not there WARNS loudly and the run proceeds
// on the account's real theme: the silent-drop trap the appearance presets file documents, refused here.
//
// CARRIED ROOMS (field-measured 2026-08-18): inside a chat whose CARD carries its own theme, <html> has no
// `data-theme` at all — the room's ThemeScope takes over (D44 §12). A pretended app theme is EXPECTED to be
// invisible there; verify this axis on a non-carried surface (Home, Configuration).

/** The tRPC procedure that answers with the caller's readable theme library (own themes + every seed). */
export const LIST_THEMES_PROCEDURE = "settings.listThemes";

/** `--theme none` — pretend NO theme is selected, i.e. the shipped Hearth default. Spelled as a word
 *  because "no selection" is a real arm of the app (a fresh account), not the absence of the flag. */
export const NO_THEME = "none";

/** What `--theme` asked for: a theme NAME (case-insensitive, e.g. "Light"), a raw theme id, or `none`. */
export type ThemeRequest = string;

/** Parse outcome: a request, or a stated reason (the caller turns it into an ARG ERROR — EXIT.misuse). */
export type ThemeParse = { readonly theme: ThemeRequest } | { readonly error: string };

/** One entry of the app's theme library, as much of `ThemeView` as the shim needs. */
export interface ThemeEntry {
  readonly id: string;
  readonly name: string;
  /** The API's own seed/custom discriminator. null means the response omitted it — never guessed. */
  readonly isSeed: boolean | null;
}

/** The value-taking theme flags — every probe CLI adds these to its required-value scan. */
export const THEME_VALUE_FLAGS: readonly string[] = ["--theme"];

/** The one help block for the theme axis, shared by all four probe CLIs so it cannot drift between them. */
export function themeHelpBlock(): string {
  return `Active theme (the app's own theme SELECTION, shimmed over the settings response and never written —
a different axis from --appearance, and from --dark/--light which emulate the OS color scheme):
  --theme <name|id>             render as if this theme were selected: Hearth | Mocha | Light (seeds) or
                                any of your own themes, by name (case-insensitive) or id
  --theme none                  render with NO theme selected (the shipped Hearth default)
                                Resolved against the app's OWN settings.listThemes, so an unknown name
                                WARNS with the real list instead of silently rendering your theme. A chat
                                room whose CARD carries a theme overrides this on purpose (D44 §12) —
                                take theme-polarity arms on a non-carried surface. No flag = your theme.`;
}

/** `--theme <value>` → a request. An empty value is CLI misuse, never a silent no-op. */
export function parseThemeFlag(raw: string): ThemeParse {
  const value = raw.trim();
  if (value === "") {
    return { error: "--theme expects a theme name, a theme id, or 'none'" };
  }
  return { theme: value };
}

/** Fold `--theme` into a CLI's args — last spelling wins (argv reads the way it behaves), a stated reason
 *  becomes CLI misuse. Shared by every probe: a typo'd theme must never quietly audit the account's theme. */
export function applyThemeFlag(target: { theme: ThemeRequest | null; errors: string[] }, parsed: ThemeParse): void {
  if ("error" in parsed) {
    target.errors.push(parsed.error);
    return;
  }
  target.theme = parsed.theme;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The theme library out of a `settings.listThemes` response body — the batch array element at `index`, or a
 * single envelope. Null when the shape is not that (an error result, an auth failure, a moved schema): the
 * caller WARNS on null rather than guessing an id the app never named.
 */
export function readThemeList(body: unknown, index = 0): readonly ThemeEntry[] | null {
  const envelope = Array.isArray(body) ? body[index] : body;
  if (!isPlainObject(envelope)) {
    return null;
  }
  const result = envelope["result"];
  if (!isPlainObject(result)) {
    return null;
  }
  const rows = result["data"];
  if (!Array.isArray(rows)) {
    return null;
  }
  const entries: ThemeEntry[] = [];
  for (const row of rows) {
    if (isPlainObject(row) && typeof row["id"] === "string" && typeof row["name"] === "string") {
      entries.push({ id: row["id"], name: row["name"], isSeed: typeof row["isSeed"] === "boolean" ? row["isSeed"] : null });
    }
  }
  return entries;
}

/** The resolution of a `--theme` request against the real library: an id (null = "no selection"), or a
 *  stated reason naming every theme the account actually has. */
export type ThemeResolution = { readonly id: string | null } | { readonly error: string };

/**
 * Match a request against the library: `none` → no selection, an exact id → itself, otherwise a
 * case-insensitive NAME match. Pure, so the matching rules are unit-testable without a browser.
 */
export function resolveTheme(entries: readonly ThemeEntry[], request: ThemeRequest): ThemeResolution {
  if (request.toLowerCase() === NO_THEME) {
    return { id: null };
  }
  const byId = entries.find((entry) => entry.id === request);
  if (byId !== undefined) {
    return { id: byId.id };
  }
  const wanted = request.toLowerCase();
  const byName = entries.find((entry) => entry.name.toLowerCase() === wanted);
  if (byName !== undefined) {
    return { id: byName.id };
  }
  const known = entries.map((entry) => entry.name).join(", ");
  return { error: `no theme named ${JSON.stringify(request)} in this account — have: ${known === "" ? "(none)" : known}` };
}

/** The `config`-level patch a resolved theme means: the SELECTION only. Everything the theme paints is then
 *  fetched by the app from the real `settings.getTheme` row — the shim never fabricates a palette. */
export function themeConfigPatch(id: string | null): Record<string, unknown> {
  return { theme: { selectedThemeId: id } };
}

/** The loud line an unresolvable `--theme` prints (stderr) before the run continues on the real account —
 *  one home so the int test and the operator read the same words. */
export function themeWarning(reason: string): string {
  return `THEME SHIM WARNING  --theme did not apply: ${reason} — this run rendered the account's OWN theme, not the one you asked for`;
}
