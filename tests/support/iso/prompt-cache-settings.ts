import type { PromptCacheSettings } from "@orb/contracts/inference";
import { effectivePromptCache, promptCacheSettingsSchema } from "@orb/contracts/inference";

/** Starts from the real null-row preference; capability-derived cache policy stays in production. */
export function makePromptCacheSettings(overrides: Partial<PromptCacheSettings> = {}): PromptCacheSettings {
  return promptCacheSettingsSchema.parse({ ...effectivePromptCache(null), ...overrides });
}
