// @orb/server/kit/serde/theme — the ONE home for the orb-native theme-backup serde: BOTH directions (build +
// parse) over ONE canonical shape, so the two halves can never drift (the card/chat/tag-serde precedent). PURE:
// zero I/O, zero db, zero id-resolution — it maps a `ThemeBackup` (a per-owner set of theme rows, id-less and
// owner-less) to/from the orb-native `.json` interchange bytes. The RELATIONAL work stays OUT of here, in the
// settings domain's theme export/import verbs:
//   - export reads the owner's OWNED `themes` rows (never seeds — seeds are code-authored, ownerId IS NULL),
//     projects each to a `CanonicalTheme`, and calls `buildThemeBackup`.
//   - import calls `parseThemeBackup`, then mints/dedupes the owner's own `themes` rows (a fresh id + the owner
//     stamp are applied at write time; the css-validate write-boundary guard runs in the verb, not here).
// So the serde only ever sees id-less, owner-less theme values — never a db handle, a `ThemeId`, or a `UserId`.
//
// orb-NATIVE ONLY (R4/R7): SillyTavern has no shareable theme-library format, so there is NO ST-compat adapter
// here. The envelope is the uniform `{schemaKind, schemaVersion}` header (the `PresetFile` precedent, R8) so
// a forward-compat lift-walk can key off the version. `parseThemeBackup` REJECTS a foreign/absent `schemaKind`
// (returns null) and drops malformed rows (resilient, never fatal for one bad entry).
//
// SECURITY: the `override` token-set is run through `themeOverrideSchema` on BOTH build and parse — the D44
// §12.1 wire clamp (color values pass `isSafeColor`, fonts allowlist, enums enumerate; a hostile value drops
// per-field). The `css` field is length-clamped here but its containment validation (`validateThemeCss` —
// no `position: fixed`, etc.) is the import verb's write-boundary concern (the `createTheme` precedent), not
// the serde's.
//
// Round-trip drift guard: buildThemeBackup(parseThemeBackup(buildThemeBackup(x))) deep-equals
// buildThemeBackup(x) — pinned in the mirror test (the SERIALIZED bytes are the stable fixed point; the
// `themeOverrideSchema` shape order + explicit key order make the round-trip byte-identical).

import type { ThemeOverride } from "@orb/contracts/theme";
import { THEME_CSS_MAX, THEME_NAME_MAX, themeOverrideSchema } from "@orb/contracts/theme";
import { z } from "zod";

// The wire discriminant + schema version. `schemaKind` fences a theme-backup file from every other portable
// file (an upload router routes on it); `schemaVersion` is the lift-walk key for a future shape change.
export const THEME_SCHEMA_KIND = "orb.theme";
export const THEME_SCHEMA_VERSION = 1;

// ── the canonical shape (id-less, owner-less; the serde owns its wire shape, server/kit type-home-exempt) ──

/** One theme as it travels in the backup file: the portable display fields ONLY. NO `id` (a fresh id is minted
 *  on import), NO `ownerId` (the importing owner is stamped at write time), NO timestamps (born at insert).
 *  `override` is the D44 clamped token-set; `css` is the optional self-authored custom CSS, null when unset. */
export interface CanonicalTheme {
  readonly name: string;
  readonly override: ThemeOverride;
  readonly css: string | null;
}

/** An owner's whole theme namespace as a portable set — just the OWNED theme rows (seeds are code-authored and
 *  never travel). Restoring a backup re-creates the owner's themes; the active-theme SELECTION rides the
 *  `user_settings.theme` namespace (the user-settings backup), not here. */
export interface ThemeBackup {
  readonly themes: readonly CanonicalTheme[];
}

// ── build (ThemeBackup → JSON bytes) ───────────────────────────────────────────────────────────────────────

/** Serialize ONE canonical theme with a DETERMINISTIC key order (the round-trip fixed point). The override is
 *  re-clamped through `themeOverrideSchema` (safe by construction — every field is optional + `.catch`, so it
 *  never throws; unknown keys strip and the shape order is stable). */
function themeToWire(t: CanonicalTheme): Record<string, unknown> {
  return {
    name: t.name,
    override: themeOverrideSchema.parse(t.override),
    css: t.css,
  };
}

/**
 * Serialize a `ThemeBackup` to the orb-native theme-backup JSON interchange bytes (the inverse of
 * `parseThemeBackup`). The `{schemaKind, schemaVersion}` envelope wraps the ordered theme rows; UTF-8 encoded.
 * Deterministic key order makes the round-trip byte-identical. PURE.
 */
export function buildThemeBackup(backup: ThemeBackup): Uint8Array {
  const wire = {
    schemaKind: THEME_SCHEMA_KIND,
    schemaVersion: THEME_SCHEMA_VERSION,
    themes: backup.themes.map(themeToWire),
  };
  return new TextEncoder().encode(JSON.stringify(wire, null, 2));
}

// ── parse (JSON bytes → ThemeBackup | null) ────────────────────────────────────────────────────────────────

// A lenient per-row view: `name` VALIDATES (blank/whitespace fails THIS row → dropped); `override` runs the
// D44 wire clamp (hostile token values drop per-field, never fatal); `css` clamps length + coerces to null.
const wireThemeSchema = z.object({
  name: z.string().trim().min(1).max(THEME_NAME_MAX),
  override: themeOverrideSchema.catch({}),
  css: z.string().max(THEME_CSS_MAX).nullish().catch(null),
});

// The envelope: the discriminant is REQUIRED and must match (a foreign file → parse null); `themes` is a
// permissive array (each element re-validated per-row, bad rows dropped).
const wireBackupSchema = z.object({
  schemaKind: z.literal(THEME_SCHEMA_KIND),
  schemaVersion: z.number().int().positive(),
  themes: z.array(z.unknown()),
});

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/**
 * Parse orb-native theme-backup JSON bytes to a `ThemeBackup`, or null when the bytes are not a theme-backup
 * file (non-JSON, or a `schemaKind` that is not {@link THEME_SCHEMA_KIND}). Resilient WITHIN a valid file: a
 * single malformed theme row (missing/blank name, a non-object) is DROPPED, never fatal; a hostile override
 * token degrades per-field through the D44 clamp. The inverse of `buildThemeBackup`. PURE.
 */
export function parseThemeBackup(bytes: Uint8Array): ThemeBackup | null {
  const envelope = wireBackupSchema.safeParse(decodeJson(bytes));
  if (!envelope.success) {
    return null;
  }
  const themes: CanonicalTheme[] = [];
  for (const raw of envelope.data.themes) {
    const row = wireThemeSchema.safeParse(raw);
    if (!row.success) {
      continue;
    }
    themes.push({
      name: row.data.name,
      override: row.data.override,
      css: row.data.css ?? null,
    });
  }
  return { themes };
}
