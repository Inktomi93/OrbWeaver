// The one home for the theme serde: both directions over one canonical shape, the three grammars a theme
// file can arrive in (the orb backup envelope, the single-theme export, a raw SillyTavern theme), and the
// theme content identity. Pure: zero I/O, zero db, zero id-resolution.
//
// Security: the `override` token-set is run through `themeOverrideSchema` on both build and parse — the
// wire clamp (color values pass isSafeColor, fonts allowlist, enums enumerate). The `css` field is
// length-clamped here but its containment validation is the import verb's write-boundary concern, not
// the serde's.
//
// Round-trip drift guard: buildThemeBackup(parseThemeBackup(buildThemeBackup(x))) deep-equals
// buildThemeBackup(x).

import type { PortableParse, PortableParseFailure } from "@orb/contracts/portability";
import type { ThemeOverride } from "@orb/contracts/theme";
import { THEME_CSS_MAX, THEME_NAME_MAX, themeOverrideSchema } from "@orb/contracts/theme";
import { isPlainObject } from "@orb/kit/guards";
import { stableStringify } from "@orb/kit/stable-stringify";
import { z } from "zod";
import type { EmptyJsonHeader } from "#kit/serde/lib";
import { decodePortableObject, defineJsonRowsSerde, NO_JSON_HEADER, noJsonHeader } from "#kit/serde/lib";
import type { ParsedStTheme } from "./st.ts";
import { stThemeFromJson } from "./st.ts";

export type { ParsedStTheme, StThemeParse } from "./st.ts";
export { stThemeFromJson, stThemeName } from "./st.ts";

export const THEME_SCHEMA_KIND = "orb.theme";
export const THEME_SCHEMA_VERSION = 1;

/** One theme as it travels in the backup file: the portable display fields only. No id, no ownerId, no
 *  timestamps. `override` is the clamped token-set; `css` is the optional self-authored custom CSS. */
export interface CanonicalTheme {
  readonly name: string;
  readonly override: ThemeOverride;
  readonly css: string | null;
}

/** An owner's whole theme namespace as a portable set — just the owned theme rows (seeds are
 *  code-authored and never travel). The active-theme selection rides the user_settings backup, not here. */
export interface ThemeBackup {
  readonly themes: readonly CanonicalTheme[];
}

/** Serialize one canonical theme with a deterministic key order. The override is re-clamped through
 *  `themeOverrideSchema` (safe by construction — every field is optional + .catch, so it never throws). */
function themeToWire(t: CanonicalTheme): Record<string, unknown> {
  return {
    name: t.name,
    override: themeOverrideSchema.parse(t.override),
    css: t.css,
  };
}

// A lenient per-row view: name validates (blank/whitespace fails this row → dropped); override runs the
// wire clamp (hostile token values drop per-field); css clamps length + coerces to null.
const wireThemeSchema = z
  .object({
    name: z.string().trim().min(1).max(THEME_NAME_MAX),
    override: themeOverrideSchema.catch({}),
    css: z.string().max(THEME_CSS_MAX).nullish().catch(null),
  })
  .transform(
    (row): CanonicalTheme => ({
      name: row.name,
      override: row.override,
      css: row.css ?? null,
    }),
  );

const themeSerde = defineJsonRowsSerde<ThemeBackup, CanonicalTheme, EmptyJsonHeader>({
  schemaKind: THEME_SCHEMA_KIND,
  schemaVersion: THEME_SCHEMA_VERSION,
  plural: "themes",
  rowSchema: wireThemeSchema,
  // A hostile row in a 40-theme library must not cost the other 39 (the ruled default).
  rowPolicy: "drop",
  headerSchema: noJsonHeader(),
  toWire: (backup) => ({ header: NO_JSON_HEADER, rows: backup.themes.map(themeToWire) }),
  fromWire: (themes) => ({ themes }),
});

/** Serialize a `ThemeBackup` to the orb-native theme-backup JSON interchange bytes (the inverse of
 *  `parseThemeBackup`). Deterministic key order makes the round-trip byte-identical. */
export function buildThemeBackup(backup: ThemeBackup): Uint8Array {
  return themeSerde.build(backup);
}

/** Parse orb-native theme-backup JSON bytes to a `ThemeBackup`, or the typed reason they were refused.
 *  Resilient within a valid file: a single malformed row is dropped, never fatal. */
export function parseThemeBackup(bytes: Uint8Array): PortableParse<ThemeBackup> {
  return themeSerde.parse(bytes);
}

// ── The three grammars one theme FILE can arrive in ──────────────────────────────────────────────────

/** A theme file's parse. `stTheme` is set when the file was a raw SillyTavern theme (its unmapped keys are
 *  the report's). A refusal carries the typed reason plus, when the ST grammar refused it, that grammar's
 *  own sentence. */
export type ThemeFileParse =
  | { readonly ok: true; readonly value: ThemeBackup; readonly stTheme: ParsedStTheme | null }
  | { readonly ok: false; readonly reason: PortableParseFailure; readonly detail: string | null };

/** The single-theme export the Looks section writes: the row's own `{name, override, css}` with no envelope. */
function isSingleThemeExport(raw: Record<string, unknown>): boolean {
  return isPlainObject(raw["override"]);
}

/** Parse one theme file in any of its grammars: the `orb.theme` backup envelope, the envelope-less
 *  single-theme export (`{name, override, css}`), or a raw SillyTavern theme (mapped through
 *  {@link stThemeFromJson}, named from its own `name` else `fallbackName`). A JSON object in none of the
 *  three is refused with the ST grammar's reason, so the door can say why. */
export function parseThemeFile(bytes: Uint8Array, fallbackName: string): ThemeFileParse {
  const decoded = decodePortableObject(bytes);
  if (!decoded.ok) {
    return { ok: false, reason: decoded.reason, detail: null };
  }
  const raw = decoded.value;
  if (raw["schemaKind"] !== undefined) {
    const backup = themeSerde.parse(bytes);
    return backup.ok ? { ok: true, value: backup.value, stTheme: null } : { ok: false, reason: backup.reason, detail: null };
  }
  if (isSingleThemeExport(raw)) {
    const row = wireThemeSchema.safeParse(raw);
    return row.success ? { ok: true, value: { themes: [row.data] }, stTheme: null } : { ok: false, reason: "malformed", detail: null };
  }
  const st = stThemeFromJson(raw, fallbackName);
  if (!st.ok) {
    return { ok: false, reason: "foreign-kind", detail: st.reason };
  }
  return { ok: true, value: { themes: [{ name: st.parsed.name, override: st.parsed.override, css: null }] }, stTheme: st.parsed };
}

// ── The theme content identity ───────────────────────────────────────────────────────────────────────

/** The content identity of a theme: its clamped override and css under a stable key order. Two themes with
 *  equal keys are one theme for import dedup, whatever their names. */
export function themeContentKey(theme: Pick<CanonicalTheme, "override" | "css">): string {
  return stableStringify({ override: themeOverrideSchema.parse(theme.override), css: theme.css });
}
