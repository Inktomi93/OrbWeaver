// domain/connection/substrate/heal-model — the agent-sdk model heal (the dual-guard seam; neo
// routing.ts:136-147). Migrated from neo-tavern's `resolveTurnRouting` agent-sdk arm.
// PURE: an agent-sdk (Claude) turn must carry a curated shortlist id; a stale/null/non-shortlist id heals
// to the system default. The OR path heals differently (`pick-or-model`); this is the agent-sdk twin.

import type { ChatModelId } from "@orb/contracts/connection";
import { DEFAULT_CHAT_MODEL_ID } from "@orb/contracts/connection";
import { isChatModelId } from "../catalog/chat-models";

/** Resolve an agent-sdk chat model id, healing a null/non-shortlist id to {@link DEFAULT_CHAT_MODEL_ID}.
 *  A valid shortlist id passes through (narrowed to the brand by `isChatModelId`). */
export function healToChatDefault(model: string | null): ChatModelId {
  if (model !== null && isChatModelId(model)) {
    return model;
  }
  return DEFAULT_CHAT_MODEL_ID;
}
