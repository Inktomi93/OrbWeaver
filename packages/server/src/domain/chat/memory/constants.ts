// domain/chat/memory/constants — the baked-in memory tuning + the config resolver (chat.md Part I §memory
// `constants.ts`; the "memory DEFAULTS adoption" ledger decision). DEFAULTS adopt the NEW tuning at build —
// `blockSize 16 · verbatimWindow 30 · fanOut 8` (vs the steady clone's `8 · 8 · 4`) — a config value, not a
// code semantic. `resolveCfg` layers a partial `AppSettings.memoryDefaults` over DEFAULTS (admin-set; an
// absent field falls back to the floor). PURE, deterministic — no clock, no I/O (these are VALUES/a function,
// not exported types, so the `types-in-contract` gate does not apply).

import type { MemoryConfig, ResolvedMemoryConfig } from "./types";

/** The baked-in resolver floor. The three headline knobs adopt the new tuning (ledger); the rest mirror the
 *  `memoryDefaultsSchema` describe-defaults (mode `mixC`, fanOut 8, maxTier 3, retrieveK 8, rerankTo 3,
 *  minScore 0.25, keywordMatch on, recencyBias off, queryWindow 2). */
export const DEFAULTS: ResolvedMemoryConfig = {
  blockSize: 16,
  verbatimWindow: 30,
  queryWindow: 2,
  mode: "mixC",
  fanOut: 8,
  maxTier: 3,
  retrieveK: 8,
  rerankTo: 3,
  minScore: 0.25,
  keywordMatch: true,
  recencyBias: 0,
};

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
