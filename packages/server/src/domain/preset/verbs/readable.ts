// Shared defaults are readable too; absence is false, infrastructure faults still propagate.
import type { LoadOptionalPreset } from "../contract/optional-read.ts";
import type { PresetReadable } from "../contract/readable.ts";

export function createPresetReadable(loadOptional: LoadOptionalPreset): PresetReadable {
  return async (presetId, userId): Promise<boolean> => (await loadOptional(userId, presetId)) !== null;
}
