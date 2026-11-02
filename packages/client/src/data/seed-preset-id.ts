import type { PresetId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";

const presetIdSchema = typeIdSchema(ID_PREFIX.preset);

/** The stored default preset as a preset id. `null` is the built-in default, and so is a stored value that is no preset id. */
export function seedPresetId(stored: string | null | undefined): PresetId | null {
  const parsed = presetIdSchema.safeParse(stored);
  return parsed.success ? parsed.data : null;
}
