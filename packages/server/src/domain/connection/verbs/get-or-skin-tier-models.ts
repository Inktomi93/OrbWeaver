// verb: getOrSkinTierModels — DERIVE the mode-2 (OR-Anthropic skin) tier→OpenRouter-slug map from the two
// live catalogs the connection domain holds (the agent-sdk daemon `alias → resolvedModel` map + the OR
// catalog id list). Replaces the hardcoded `OPENROUTER_TIER_MODELS` that used to live in the agent-sdk env
// firewall — the firewall now receives this on the request, so it holds ZERO model strings.
//
// Reads BOTH caches through the substrate seams (the catalog subsystem is substrate-mediated) with the
// injected clock; the pure `deriveOrSkinTierModels` does the transform + membership check + fallback chain.
// NEVER throws (a cold catalog degrades to the curated shortlist), so the caller (the chat compose seam)
// always gets a coherent trio for every agent-sdk turn. Sync under the hood — wrapped in a resolved promise
// for the async service surface.

import type { OrSkinTierModels } from "../contract/results";
import type { ConnectionContext, ConnectionService } from "../contract/service";
import { getCachedAgentSdkModels } from "../substrate/agent-sdk-model-cache";
import { getCachedOrModels } from "../substrate/or-model-cache";
import { deriveOrSkin } from "../substrate/tier-models";

export function createGetOrSkinTierModels(
  ctx: ConnectionContext,
): ConnectionService["getOrSkinTierModels"] {
  return (): Promise<OrSkinTierModels> => {
    const now = ctx.now();
    return Promise.resolve(deriveOrSkin(getCachedOrModels(now), getCachedAgentSdkModels(now)));
  };
}
