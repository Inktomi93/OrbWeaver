// Databank consumes chunk settings; the separate chat slot budget never enters this projection.
import type { GetDatabankSettingsOp, LoadUserSettings } from "@orb/contracts/settings";

export function createGetDatabankSettings(loadUserSettings: LoadUserSettings): GetDatabankSettingsOp {
  return async (ownerId) => {
    const { databank } = await loadUserSettings(ownerId);
    return { chunk: databank.chunk };
  };
}
