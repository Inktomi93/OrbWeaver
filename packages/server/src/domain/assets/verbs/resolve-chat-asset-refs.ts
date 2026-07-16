// verb: resolveChatAssetRefs (#67 co-participant render) — the CHAT-SCOPED sibling of `resolveOwnedAssetRefs`.
// A group/multi-human chat member (not just the uploader) must render another present member's inline
// attachment. The gate is NOT owner-scope and NOT bare chat-membership: it is the STRUCTURAL `message_assets`
// reference in THIS chat + the asset owner is a PRESENT participant + the CALLER is a PRESENT participant —
// the SAME gate the model render path enforces (`entry/compose/resolve-image-ref.ts`). Because that
// cross-domain join spans the chat schema (`message_assets`/`messages`/`chat_participants`), it arrives as
// the injected `loadChatAssetRefs` op wired at the entry composition root (assets sideways-imports no chat —
// the `loadCoParticipantOwner` precedent), so this verb is a thin, fail-closed delegate: no op ⇒ nothing
// resolves; empty input ⇒ no query.

import type { AssetId, ChatId, UserId } from "@orb/kit/ids";
import type { AssetsContext } from "../context";
import type { AssetsService } from "../contract/service";
import type { AssetBlobRef } from "../contract/views";

export function createResolveChatAssetRefs(ctx: AssetsContext): AssetsService["resolveChatAssetRefs"] {
  return (callerId: UserId, chatId: ChatId, assetIds: readonly AssetId[]): Promise<readonly AssetBlobRef[]> => {
    if (assetIds.length === 0 || ctx.loadChatAssetRefs === undefined) {
      return Promise.resolve([]);
    }
    return Promise.resolve(ctx.loadChatAssetRefs(callerId, chatId, assetIds));
  };
}
