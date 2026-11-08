// The bytes each owner operation is handed for one collected preset or theme. The import waves and the dry run's
// ownership read build them here, so the read asks about exactly what the write would land.

import { buildThemeBackup } from "#primitives/serde/theme";
import type { CollectedPreset, CollectedTheme } from "../contract/collection.ts";

const ENCODER = new TextEncoder();

export function presetBytes(preset: CollectedPreset): Uint8Array {
  return ENCODER.encode(JSON.stringify(preset.parsed.file));
}

export function themeBytes(theme: CollectedTheme): Uint8Array {
  return buildThemeBackup({ themes: [{ name: theme.parsed.name, override: theme.parsed.override, css: null }] });
}
