// domain/chat/memory/recall/bridge — memory's tier-indexing seam for outside consumers. The coverage math
// (`computeBridge`) and the tier-grid span live in `@orb/kit/recall`; this file only resolves the configured fanOut.
//
// Indexing (matches generate/digests.ts): a tier-k digest at blockIdx j covers tier-0 range
// [j·fanOutᵏ, (j+1)·fanOutᵏ − 1].

import { tier0RangeOf } from "@orb/kit/recall";
import { resolveCfg } from "../constants.ts";
import type { MemoryConfig } from "../types.ts";

/** The config-resolving front-door form of `tier0RangeOf` — memory's tier-indexing seam for OUTSIDE
 *  consumers (the discovery `msgMidAt` tier-k backfill injects this at the entry root, so the fanOut math
 *  keeps ONE home). `config` is the raw `AppSettings.memoryDefaults` partial; absent knobs resolve to
 *  the grounded floor exactly as the digest build resolves them. */
export function resolveTier0Range(
  config: MemoryConfig | null | undefined,
  tier: number,
  blockIdx: number,
): { readonly startIdx: number; readonly endIdx: number } {
  return tier0RangeOf(resolveCfg(config).fanOut, tier, blockIdx);
}
