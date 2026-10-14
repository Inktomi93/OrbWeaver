import type { GuidedActionsConfig, PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_GUIDED_ACTIONS, DEFAULT_PROMPT_CONFIG, guidedActionsSchema, promptConfigViewSchema, userIntentViewSchema } from "@orb/contracts/preset";

/** Builds the owner's default arrangement without sharing its mutable nested data. */
export function makePromptConfig(overrides: Partial<PromptConfig> = {}): PromptConfig {
  return promptConfigViewSchema.parse({ ...DEFAULT_PROMPT_CONFIG, ...overrides });
}

/** Unset generation knobs remain unset; the production funnel owns their effective values. */
export function makeUserIntent(overrides: Partial<UserIntent> = {}): UserIntent {
  return userIntentViewSchema.parse({ ...DEFAULT_PROMPT_CONFIG.params, ...overrides });
}

/** Default template bytes come from the owner's prose registry through its default actions. */
export function makeGuidedActionsConfig(overrides: Partial<GuidedActionsConfig> = {}): GuidedActionsConfig {
  return guidedActionsSchema.parse({ ...DEFAULT_GUIDED_ACTIONS, ...overrides });
}
