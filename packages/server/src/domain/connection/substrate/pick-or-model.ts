// domain/connection/substrate/pick-or-model — the OpenRouter model-id dual guard (connection.md Esoteric
// §4/§5, invariant 7). Migrated from neo-tavern's `domain/chat/routing.ts pickOrModel`. PURE: the cached
// catalog is passed IN (the verb reads `getCachedOrModels(ctx.now())` and hands it here) so this stays
// deterministic + unit-testable — it never reaches the cache or a clock itself.
//
// Two sequential guards, both load-bearing:
//   (1) SHORTLIST guard — a curated Claude id is agent-sdk-only; on the OR path it gets a 400 (OR wants
//       `anthropic/claude-…`). Reject it to the OR default. `isChatModelId` is the discriminator.
//   (2) CATALOG guard — verify the id against the in-memory OR catalog IF we have one. On a COLD cache
//       (`cached === null`) the guard is SKIPPED (NOT a blanket reject) — a fresh boot before the snapshot
//       hydrates must not fail every id; the picker validated at selection time and a stale id surfaces a
//       real OR error. The cold-skip is deliberate; removing it breaks the boot sequence.

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { DEFAULT_OR_CHAT_MODEL_ID } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isChatModelId } from "../catalog/chat-models";

/**
 * Resolve the OpenRouter model id to send, healing to {@link DEFAULT_OR_CHAT_MODEL_ID} when the requested
 * id is null, a Claude-shortlist id (guard 1), or absent from a WARM catalog (guard 2). A cold catalog
 * (`null`) trusts the caller (guard 2 skipped).
 */
export function pickOrModel(
  model: string | null,
  cached: readonly ModelCatalogEntry[] | null,
): ModelId {
  if (model === null) {
    return DEFAULT_OR_CHAT_MODEL_ID;
  }
  // Guard (1): Claude shortlist ids belong to the agent-sdk runner, not OR.
  if (isChatModelId(model)) {
    return DEFAULT_OR_CHAT_MODEL_ID;
  }
  // Guard (2): verify against the cached OR catalog when warm; cold cache → trust the caller.
  if (cached !== null && !cached.some((entry) => entry.id === model)) {
    return DEFAULT_OR_CHAT_MODEL_ID;
  }
  return castId<ModelId>(model);
}
