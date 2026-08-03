// domain/chat/memory/constants — the baked-in memory tuning + the config resolver. DEFAULTS are the
// core/Knowledge-Cluster.md §5 GROUNDED numbers (neo tuned them against real
// imported ST chats): `blockSize 8 · fanOut 4 · verbatimWindow 8 · maxTier 3` — tier-1 fills at 32 messages,
// tier-2 at 128, tier-3 at 512, so tiering actually engages at typical lengths, and `blockSize 8 ≈ 3k tok`
// fits a tiny local summarizer (the token-guard is the real safety — §3a). The numbers MIRROR the
// `contracts/settings` `memoryDefaultsSchema` describe-defaults exactly. `resolveCfg` layers a partial
// `AppSettings.memoryDefaults` over DEFAULTS (admin-set; an absent field falls back to the floor). PURE,
// deterministic — no clock, no I/O (these are VALUES/a function, not exported types, so `types-in-contract`
// does not apply).

import { DEFAULT_MEMORY_DEFAULTS } from "@orb/contracts/settings";
import type { MemoryConfig, ResolvedMemoryConfig } from "./types.ts";

/** The baked-in resolver floor — the core/Knowledge-Cluster.md §5 grounded defaults. ONE home: the values
 *  live in `@orb/contracts/settings` `DEFAULT_MEMORY_DEFAULTS` (so the admin surface reads the same floor it
 *  displays); this re-exports under the subsystem's `ResolvedMemoryConfig` type (every knob present). */
export const DEFAULTS: ResolvedMemoryConfig = DEFAULT_MEMORY_DEFAULTS;

/** Resolve a partial `memoryDefaults` over {@link DEFAULTS} (each absent/undefined knob → the floor). Pure +
 *  deterministic: identical input → identical output (no ambient state). */
export function resolveCfg(partial?: MemoryConfig | null): ResolvedMemoryConfig {
  return {
    blockSize: partial?.blockSize ?? DEFAULTS.blockSize,
    verbatimWindow: partial?.verbatimWindow ?? DEFAULTS.verbatimWindow,
    queryWindow: partial?.queryWindow ?? DEFAULTS.queryWindow,
    mode: partial?.mode ?? DEFAULTS.mode,
    fanOut: partial?.fanOut ?? DEFAULTS.fanOut,
    maxTier: partial?.maxTier ?? DEFAULTS.maxTier,
    retrieveK: partial?.retrieveK ?? DEFAULTS.retrieveK,
    rerankTo: partial?.rerankTo ?? DEFAULTS.rerankTo,
    minScore: partial?.minScore ?? DEFAULTS.minScore,
    keywordMatch: partial?.keywordMatch ?? DEFAULTS.keywordMatch,
    recencyBias: partial?.recencyBias ?? DEFAULTS.recencyBias,
  };
}
