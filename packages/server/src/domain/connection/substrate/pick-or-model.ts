// domain/connection/substrate/pick-or-model — the OpenRouter model-id dual guard. Pure: the cached catalog
// is passed in, so this never reaches the cache or a clock itself.
//
// Two sequential guards: (1) a curated Claude shortlist id is agent-sdk-only, reject to the OR default; (2)
// verify against the in-memory OR catalog if warm — a cold cache (null) skips the guard so a fresh boot
// before the snapshot hydrates doesn't fail every id.

import type { ModelCatalogEntry } from "@orb/contracts/connection";
import { DEFAULT_OR_CHAT_MODEL_ID } from "@orb/contracts/connection";
import type { ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { isChatModelId } from "../catalog/chat-models.ts";

export function pickOrModel(model: string | null, cached: readonly ModelCatalogEntry[] | null): ModelId {
  if (model === null) {
    return DEFAULT_OR_CHAT_MODEL_ID;
  }
  if (isChatModelId(model)) {
    return DEFAULT_OR_CHAT_MODEL_ID;
  }
  if (cached !== null && !cached.some((entry) => entry.id === model)) {
    return DEFAULT_OR_CHAT_MODEL_ID;
  }
  return castId<ModelId>(model);
}
