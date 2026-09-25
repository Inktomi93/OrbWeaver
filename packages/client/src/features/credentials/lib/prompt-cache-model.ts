// The connection editor's Prompt caching tier as pure folds over `@orb/contracts/inference` `prompt-cache.ts`.
// The tier shows only where the capability says `turns.explicitPromptCache`, since elsewhere the settings reach
// nothing; its autosave form writes the WHOLE document, and NULL is the shipped behavior.

import type { Capability, PromptCacheSettings, PromptCacheTtl } from "@orb/contracts/inference";
import {
  effectivePromptCache,
  PROMPT_CACHE_DEPTH_CEIL,
  PROMPT_CACHE_DEPTH_MIN,
  PROMPT_CACHE_TTLS,
  PROMPT_CACHE_WRITE_MULTIPLIER,
  SHIPPED_PROMPT_CACHE,
} from "@orb/contracts/inference";

/** Does this connection's wire place explicit cache markers — the one condition under which the tier shows? */
export function showsPromptCache(capability: Capability | null): boolean {
  return capability?.kind === "generation" && capability.generation.turns?.explicitPromptCache === true;
}

const SETTING_KEYS = ["enabled", "cacheSystem", "historyDepth", "ttl"] as const satisfies readonly (keyof PromptCacheSettings)[];

/** How many settings differ from the shipped behavior — the tier's count badge. A NULL row is zero. */
export function promptCacheChangedCount(stored: PromptCacheSettings | null): number {
  const settings = effectivePromptCache(stored);
  return SETTING_KEYS.filter((key) => settings[key] !== SHIPPED_PROMPT_CACHE[key]).length;
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
  /** The cache WRITE price as a multiple of base input, formatted for the option's gloss. */
  readonly writeCost: string;
}

/** The TTL options in contract order, each with its write price. */
export const PROMPT_CACHE_TTL_OPTIONS: readonly PromptCacheTtlOption[] = PROMPT_CACHE_TTLS.map((value) => ({
  value,
  label: TTL_LABELS[value],
  writeCost: `${String(PROMPT_CACHE_WRITE_MULTIPLIER[value])}×`,
}));

/** Narrow a radio group's value back to the TTL tuple; any other value is not a TTL. */
export function promptCacheTtlOf(value: unknown): PromptCacheTtl | undefined {
  return PROMPT_CACHE_TTLS.find((ttl) => ttl === value);
}
