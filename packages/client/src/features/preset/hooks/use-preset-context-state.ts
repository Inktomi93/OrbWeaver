import type { PresetContextState } from "#lib";
import { useSelectedPresetId } from "#state";

export function usePresetContextState(): PresetContextState | null {
  const id = useSelectedPresetId();
  return id === null ? null : { presetId: id };
}
