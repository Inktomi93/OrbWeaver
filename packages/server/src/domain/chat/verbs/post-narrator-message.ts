// The narrator-post op (rpg-design/02 §1.1 #2): persist ONE assistant-role narrator message through chat's
// canon-write path — recaps (06 §3), scene-merge summaries (07 §2), the server-minted `[check: …]` result
// line (12 §3), illustration posts (08 §2). Authored by the synthetic group character (D16 inv-9 — a real
// authoring identity, never a user id: `authorUserId` is only ever a principal that ACTED, the D19 rule; the
// group char is minted lazily if the room has none). `media` ride the body as embedded `![alt](asset:<id>)`
// refs (D51) with `message_assets` retaining rows (the asset-ref registry's GC anchor). Returns the new
// message + its VARIANT id — rpg's checkpoint-restore couples a restored snapshot to it (`rpg_snapshots.
// variantId` UNIQUE), so the minting op hands it back (no second read). STANDALONE, principal-free (rpg gates
// authority): the `createGenerateImage` persist/emit dance, the `createExtractQuiet` compose-built shape.

import { batchMany } from "@orb/db/kit";
import type { ChatContext } from "../context";
import type { PostNarratorMessage, PostNarratorMessageDeps } from "../contract/context";
import { buildCommittedMessageView, insertCanonMessageStatements, insertMessageAssetStatements } from "../persistence/canon-write";
import { loadMaxMessageSeq } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";

/** The alt text stamped on each embedded narrator-media ref (one home — no scattered magic string). */
const NARRATOR_MEDIA_ALT = "illustration";

/** Compose the message body: the narrator text alone when there is no media, else the text (if any) followed
 *  by the media refs, media-only when the text is blank. */
function buildBody(content: string, refs: string): string {
  if (refs.length === 0) {
    return content;
  }
  const trimmed = content.trim();
  return trimmed.length > 0 ? `${trimmed}\n\n${refs}` : refs;
}

export function createPostNarratorMessage(ctx: ChatContext, deps: PostNarratorMessageDeps): PostNarratorMessage {
  return async (chatId, content, media, origin) => {
    const mediaRefs = media ?? [];
    // The group character is owned by the room HOST (the D19 funding/authority identity) — the same
    // owner every narrator turn mints under (`turn.ts` runAiRound).
    const roster = await loadRoster(ctx.db, chatId);
    const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
    if (hostUserId === null) {
      throw new Error(`postNarratorMessage: chat ${chatId} has no host to author the narrator identity under`);
    }
    const group = await ctx.mintSyntheticGroupCharacter({ ownerId: hostUserId, chatId });

    // ONE body STRING: the narrator text + one markdown image ref per media asset (D51 — never stored blocks).
    const refs = mediaRefs.map((assetId) => `![${NARRATOR_MEDIA_ALT}](asset:${assetId})`).join("\n");
    const body = buildBody(content, refs);

    const seq = await loadMaxMessageSeq(ctx.db, chatId);
    const now = ctx.now();
    const messageId = ctx.newMessageId();
    const params = {
      messageId,
      variantId: ctx.newMessageVariantId(),
      chatId,
      seq: seq + 1,
      role: "assistant" as const,
      authorUserId: null,
      characterId: group.characterId,
      personaId: null,
      now,
      variant: { content: body },
      // Origin (03 §4) — absent for rpg posts (byte-identical DB defaults 'human'/0); the automation
      // `generate_image` non-quiet post threads its firing rule's initiator + cascade depth so the posted
      // image's `messageCommitted` fact resolves at depth ≥ 1 and a non-opted re-fire is cascade-suppressed.
      ...(origin !== undefined ? { initiator: origin.initiator, automationDepth: origin.automationDepth } : {}),
    };
    const assetRows = mediaRefs.map((assetId) => ({ id: ctx.newMessageAssetId(), messageId, assetId }));
    await ctx.db.batch(batchMany([...insertCanonMessageStatements(ctx.db, params), ...insertMessageAssetStatements(ctx.db, { rows: assetRows, now })]));

    const view = buildCommittedMessageView(params);
    await deps.emit({ type: "messageCommitted", chatId, messageId, view });
    // A new narrator message moved chat-list recency → fan `chatsChanged` (list-only) to present human members.
    void ctx.emitChatChanged(chatId);
    return { messageId, variantId: params.variantId };
  };
}
