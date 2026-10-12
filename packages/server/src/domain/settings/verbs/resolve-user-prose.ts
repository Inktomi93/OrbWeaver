import type { ProseOverrides } from "@orb/contracts/prose";
import type { UserId } from "@orb/kit/ids";
import type { SettingsService } from "../contract/service.ts";

/** Resolve model-facing prose for the owner whose library is being analyzed. */
export function createResolveUserProse(loadUserSettings: SettingsService["loadUserSettings"]): (userId: UserId) => Promise<ProseOverrides> {
  return async (userId) => (await loadUserSettings(userId)).prose;
}
