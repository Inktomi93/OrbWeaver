// The connection's prompt-cache settings: a user preference, so its own column (`user_connections.prompt_cache`),
// never a `declared.features` line (a statement about the server). NULL on the row is `SHIPPED_PROMPT_CACHE`,
// which is byte-identical to the wire before the settings existed.

import { z } from "zod";

/** The two TTLs the Anthropic cache accepts, spelled `{"type":"ephemeral","ttl":…}` with no `anthropic-beta`
 *  header on either route. An unknown ttl is not an upstream error on OpenRouter: it answers 200 and silently
 *  drops the whole block (`scripts/probes/openrouter/RESULTS.md`). */
export const PROMPT_CACHE_TTLS = ["5m", "1h"] as const;
export type PromptCacheTtl = (typeof PROMPT_CACHE_TTLS)[number];

/** A cache WRITE's price as a multiple of base input tokens, per TTL. A read is 0.1x at either TTL. */
export const PROMPT_CACHE_WRITE_MULTIPLIER: Readonly<Record<PromptCacheTtl, number>> = { "5m": 1.25, "1h": 2 };

/** The shallowest user depth: depth 0 is the volatile tail, which SHAPE never hands the placer. */
export const PROMPT_CACHE_DEPTH_MIN = 1;
/** The deepest meaningful depth, shared with the admin floor's bound: Anthropic's cache lookback spans ~20
 *  blocks, so a deeper breakpoint has nothing left to find. */
export const PROMPT_CACHE_DEPTH_CEIL = 20;

export const promptCacheSettingsSchema = z.object({
  /** Off ⇒ no `cache_control` anywhere in the request: tools, system block, history. */
  enabled: z.boolean(),
  /** Mark the static system block. Off leaves the history breakpoints (and the tool list) in place. */
  cacheSystem: z.boolean(),
  /**
   * The per-connection MINIMUM history depth, never an exact target; `null` ⇒ the turn's own depth.
   *
   * @remarks The turn's depth is max(chat SHAPE's depth, the admin floor `promptCacheMinDepth`, this value).
   * SHAPE's depth marks where the volatile tail begins, and a breakpoint shallower than it pays a cache write
   * every turn that is never read, so a user can push the breakpoint deeper and never shallower than the
   * admin floor. A turn SHAPE gave no depth places no history breakpoint whatever this says.
   */
  historyDepth: z.number().int().min(PROMPT_CACHE_DEPTH_MIN).max(PROMPT_CACHE_DEPTH_CEIL).nullable(),
  /** One TTL for every marker a turn places, so a longer-TTL breakpoint can never follow a shorter one. */
  ttl: z.enum(PROMPT_CACHE_TTLS),
});
export type PromptCacheSettings = z.infer<typeof promptCacheSettingsSchema>;

/** What a row with no settings (`prompt_cache` NULL) gets: the wire exactly as it shipped before the settings. */
export const SHIPPED_PROMPT_CACHE: PromptCacheSettings = { enabled: true, cacheSystem: true, historyDepth: null, ttl: "1h" };

/** The settings a turn runs on: the row's own, or the shipped behavior when it stored none. */
export function effectivePromptCache(stored: PromptCacheSettings | null): PromptCacheSettings {
  return stored ?? SHIPPED_PROMPT_CACHE;
}
