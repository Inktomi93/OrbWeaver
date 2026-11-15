// What each owner operation is handed for one collected preset or theme. The import waves and the dry run's
// ownership read build them here, so the read asks about exactly what the write would land.

import type { PresetImportFile } from "@orb/contracts/preset";
import { buildThemeBackup } from "#primitives/serde/theme";
import type { CollectedPreset, CollectedTheme } from "../contract/collection.ts";

const ENCODER = new TextEncoder();

/** A collected preset's file, with the scripts its lift attaches, which are part of its identity. */
export function presetImportFile(preset: CollectedPreset): PresetImportFile {
  return { bytes: ENCODER.encode(JSON.stringify(preset.parsed.file)), regexScripts: preset.parsed.regexScripts };
}

export function themeBytes(theme: CollectedTheme): Uint8Array {
  return buildThemeBackup({ themes: [{ name: theme.parsed.name, override: theme.parsed.override, css: null }] });
}
