// Display support and stored overrides; effective cache policy is resolved server-side, not reconstructed here.

import type { Capability, PromptCacheSettings, PromptCacheTtl } from "@orb/contracts/inference";
import { effectivePromptCache, PROMPT_CACHE_DEPTH_CEIL, PROMPT_CACHE_DEPTH_MIN, PROMPT_CACHE_RETENTIONS, PROMPT_CACHE_TTLS } from "@orb/contracts/inference";

/** Show both controllable prefix caching and documented provider-managed implicit caching. */
export function showsPromptCache(capability: Capability | null): boolean {
  if (capability?.kind !== "generation") {
    return false;
  }
  const turns = capability.generation.turns;
  return turns?.explicitPromptCache === true || turns?.providerImplicitPromptCache === true || turns?.requestAutomaticPromptCache === true;
}

const SETTING_KEYS = [
  "enabled",
  "cacheSystem",
  "historyDepth",
  "ttl",
  "requestAutomatic",
  "disableImplicit",
  "retention",
] as const satisfies readonly (keyof PromptCacheSettings)[];

/** How many settings differ from the shipped behavior — the tier's count badge. A NULL row is zero. */
export function promptCacheChangedCount(stored: PromptCacheSettings | null, capability?: Capability | null): number {
  const enabled = capability?.kind === "generation" ? capability.generation.turns?.promptCacheDefaultEnabled : undefined;
  const ttl = capability?.kind === "generation" ? capability.generation.turns?.fixedCacheTtl : undefined;
  const defaults = effectivePromptCache(null, enabled, ttl);
  const settings = effectivePromptCache(stored, enabled, ttl);
  return SETTING_KEYS.filter((key) => settings[key] !== defaults[key]).length;
}

/** A committed depth-field value → the `historyDepth` to write: an empty field is `null` (automatic); a value
 *  outside the whole-number range the contract accepts is `undefined` (nothing is written). */
export function promptCacheDepthOf(next: number | null): number | null | undefined {
  if (next === null) {
    return null;
  }
  return Number.isInteger(next) && next >= PROMPT_CACHE_DEPTH_MIN && next <= PROMPT_CACHE_DEPTH_CEIL ? next : undefined;
}

/** The depth field's bounds, for the control. */
export const PROMPT_CACHE_DEPTH_BOUNDS = { min: PROMPT_CACHE_DEPTH_MIN, max: PROMPT_CACHE_DEPTH_CEIL } as const;

const TTL_LABELS: Record<PromptCacheTtl, string> = { "5m": "5 minutes", "1h": "1 hour" };

export interface PromptCacheTtlOption {
  readonly value: PromptCacheTtl;
  readonly label: string;
}

/** Retention choices are not a universal cache price schedule. */
export const PROMPT_CACHE_TTL_OPTIONS: readonly PromptCacheTtlOption[] = PROMPT_CACHE_TTLS.map((value) => ({
  value,
  label: TTL_LABELS[value],
}));

/** Narrow a radio group's value back to the TTL tuple; any other value is not a TTL. */
export function promptCacheTtlOf(value: unknown): PromptCacheTtl | undefined {
  return PROMPT_CACHE_TTLS.find((ttl) => ttl === value);
}

/** Narrow the separate earlier-OpenAI retention vocabulary. */
export function promptCacheRetentionOf(value: unknown): PromptCacheSettings["retention"] {
  return PROMPT_CACHE_RETENTIONS.find((retention) => retention === value);
}
