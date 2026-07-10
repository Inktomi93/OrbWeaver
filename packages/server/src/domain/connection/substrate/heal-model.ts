// domain/connection/substrate/heal-model — the agent-sdk model heal (the dual-guard seam; neo
// routing.ts:136-147). Migrated from neo-tavern's `resolveTurnRouting` agent-sdk arm.
// PURE: an agent-sdk (Claude) turn must carry a curated shortlist id; a stale/null/non-shortlist id heals.
// The OR path heals differently (`pick-or-model`); this is the agent-sdk twin.
//
// TIER-PRESERVING: a heal must never silently change the user's price/behavior tier (owner-reported bug —
// a stale `claude-sonnet-4-6` id was falling all the way to `DEFAULT_CHAT_MODEL_ID` = opus, silently
// upgrading a sonnet user to opus pricing/behavior). The chain below tries, in order: (1) already a valid
// shortlist id — pass through; (2) `getChatModel`'s 3-stage prefix/normalize match (OR-prefixed/dotted/dated
// variants of a CURRENT shortlist id); (3) `detectChatModelTier` — a stale/aliased id or bare family name
// still names a TIER, so heal within that tier to the current shortlist entry; (4) only a truly unrecognized
// id (or null) falls all the way to the system default.

import type { ChatModelId } from "@orb/contracts/connection";
import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import {
  chatModelForTier,
  detectChatModelTier,
  getChatModel,
  isChatModelId,
} from "../catalog/chat-models";

/** Resolve an agent-sdk chat model id, healing within the user's tier when possible (file header) and only
 *  falling to {@link DEFAULT_CHAT_MODEL_ID} for a truly unrecognized id or `null`. */
export function healToChatDefault(model: string | null): ChatModelId {
  if (model === null) {
    return DEFAULT_CHAT_MODEL_ID;
  }
  if (isChatModelId(model)) {
    return model;
  }
  const matched = getChatModel(model);
  if (matched !== undefined) {
    return matched.id;
  }
  const tier = detectChatModelTier(model);
  if (tier !== undefined) {
    return chatModelForTier(tier).id;
  }
  return DEFAULT_CHAT_MODEL_ID;
}
