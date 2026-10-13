// Only the owner's canonical optional read degrades absence; other failures retain their identity.

import type { ReadOptionalPresetConfig } from "../contract/optional-config.ts";
import type { PresetService } from "../contract/service.ts";
import { createLoadOptionalPreset } from "../substrate/optional-read.ts";

export function createReadOptionalPresetConfig(get: PresetService["get"]): ReadOptionalPresetConfig {
  const load = createLoadOptionalPreset(get);
  return async (userId, id) => (await load(userId, id))?.config ?? null;
}
