// Databank consumes chunk/retrieval settings; the separate chat slot budget never enters this projection.
import type { DatabankSettingsLoader, GetDatabankSettings } from "../contract/databank-settings.ts";

export function createGetDatabankSettings(loadUserSettings: DatabankSettingsLoader): GetDatabankSettings {
  return async (ownerId) => {
    const { databank } = await loadUserSettings(ownerId);
    return { chunk: databank.chunk, retrieval: databank.retrieval };
  };
}
