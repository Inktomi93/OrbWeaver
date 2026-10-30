// Shared defaults are readable too; absence is false, infrastructure faults still propagate.
import type { LoadOptionalPreset, PresetReadable } from "@orb/contracts/preset";

export function createPresetReadable(loadOptional: LoadOptionalPreset): PresetReadable {
  return async (presetId, userId): Promise<boolean> => (await loadOptional(userId, presetId)) !== null;
}
