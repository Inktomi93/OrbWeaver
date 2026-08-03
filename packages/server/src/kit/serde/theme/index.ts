// The one home for the orb-native theme-backup serde: both directions over one canonical shape. Pure:
// zero I/O, zero db, zero id-resolution — it maps a `ThemeBackup` (a per-owner set of theme rows, id-less
// and owner-less) to/from the orb-native .json interchange bytes. orb-native only: SillyTavern has no
// shareable theme-library format, so there is no ST-compat adapter here.
//
// Security: the `override` token-set is run through `themeOverrideSchema` on both build and parse — the
// wire clamp (color values pass isSafeColor, fonts allowlist, enums enumerate). The `css` field is
// length-clamped here but its containment validation is the import verb's write-boundary concern, not
// the serde's.
//
// Round-trip drift guard: buildThemeBackup(parseThemeBackup(buildThemeBackup(x))) deep-equals
// buildThemeBackup(x).
//
// Defined through `#kit/serde/lib` — the envelope, the JSON decode, the version gate and the drop-bad-rows
// loop are the spine's; this file owns only the canonical shape and its row schema.

import type { PortableParse } from "@orb/contracts/portability";
import type { ThemeOverride } from "@orb/contracts/theme";
import { THEME_CSS_MAX, THEME_NAME_MAX, themeOverrideSchema } from "@orb/contracts/theme";
import { z } from "zod";
import type { EmptyJsonHeader } from "#kit/serde/lib";
import { defineJsonRowsSerde, NO_JSON_HEADER, noJsonHeader } from "#kit/serde/lib";

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
