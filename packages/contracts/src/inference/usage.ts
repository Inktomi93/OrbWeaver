// `ChatUsage` — the NORMALIZED per-turn accounting core every wire reduces to (§5.3c). What a wire cannot
// normalize (Anthropic's 5m/1h cache-creation split, the SDK's warm-spare flag, OpenRouter's BYOK bit) is
// provider-opaque provenance under `providerMetadata[<providerId>]`, never a shared column with a
// per-wire meaning. Three fields have NO wire source and are filled by the caller: `contextWindow` from the
// resolved capability, `maxOutputTokens` from the funnel's cap, `costUsd`/`costDetails` from the
// transport's `extractMetadata` or the `estimated` arm.
//
// `costProvenance` REUSES `TOKEN_PROVENANCES` (never a second tuple beside `measured`): `measured` = the
// wire reported a cost; `estimated` = catalog/declared pricing × tokens, AND a subscription's SDK-computed
// notional price (no invoice exists — a rollup must not sum it with a metered figure); `unrecorded` = neither.

import type { ModelId } from "@orb/kit/ids";
import type { TokenProvenance } from "../chat/messages.ts";

/** Per-phase upstream cost breakdown. */
export interface CostDetails {
  readonly totalUsd: number;
  readonly promptUsd: number;
  readonly completionUsd: number;
}

export interface ChatUsage {
  readonly model: ModelId;
  readonly tokensIn: number | null;
  readonly tokensOut: number | null;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly reasoningTokens: number | null;
  readonly contextWindow: number | null;
  readonly maxOutputTokens: number | null;
  readonly costUsd: number | null;
  readonly costDetails: CostDetails | null;
  readonly costProvenance: TokenProvenance;
}

/** The V4-shaped nested usage the Vercel SDK reports, re-spelled structurally so the fold has one input
 *  shape per hosted wire and no `@ai-sdk/provider` type crosses the contract. */
export interface NestedUsage {
  readonly inputTokens?: { readonly total?: number | undefined; readonly cacheRead?: number | undefined; readonly cacheWrite?: number | undefined } | undefined;
  readonly outputTokens?: { readonly total?: number | undefined; readonly reasoning?: number | undefined } | undefined;
}

/** nested → flat. `cacheRead`/`cacheWrite` default to 0 (a wire that reports no cache has none); the
 *  totals stay `null` when the wire reported nothing at all. */
export function foldNestedUsage(
  usage: NestedUsage | undefined,
  fill: { readonly model: ModelId; readonly contextWindow: number | null; readonly maxOutputTokens: number | null },
): Omit<ChatUsage, "costUsd" | "costDetails" | "costProvenance"> {
  return {
    model: fill.model,
    tokensIn: usage?.inputTokens?.total ?? null,
    tokensOut: usage?.outputTokens?.total ?? null,
    cacheReadTokens: usage?.inputTokens?.cacheRead ?? 0,
    cacheWriteTokens: usage?.inputTokens?.cacheWrite ?? 0,
    reasoningTokens: usage?.outputTokens?.reasoning ?? null,
    contextWindow: fill.contextWindow,
    maxOutputTokens: fill.maxOutputTokens,
  };
}
