import { PresetNotFoundError } from "../contract/errors.ts";
import type { LoadOptionalPreset } from "../contract/optional-read.ts";
import type { PresetService } from "../contract/service.ts";
/** Preserve absence semantics without swallowing a failed database or program operation. */
export function createLoadOptionalPreset(get: PresetService["get"]): LoadOptionalPreset {
  return async (userId, id): ReturnType<LoadOptionalPreset> => {
    try {
      return await get({ userId, id });
    } catch (err) {
      if (err instanceof PresetNotFoundError) {
        return null;
      }
      throw err;
    }
  };
}
