// The narrator-post op (rpg-design/02 §1.1 #2): persist ONE assistant-role narrator message through chat's
// canon-write path — recaps (06 §3), scene-merge summaries (07 §2), the server-minted `[check: …]` result
// line (12 §3), illustration posts (08 §2). Authored by the synthetic group character (D16 inv-9 — a real
// authoring identity, never a user id: `authorUserId` is only ever a principal that ACTED, the D19 rule; the
// group char is minted lazily if the room has none). `media` ride the body as embedded `![alt](asset:<id>)`
// refs (D51) with `message_assets` retaining rows (the asset-ref registry's GC anchor). Returns the new
// message + its VARIANT id (the minting op hands it back so a caller needs no second read). STANDALONE,
// principal-free (rpg gates authority): the `createGenerateImage` persist/emit dance, the
// `createExtractQuiet` compose-built shape.
//
// IT REFUSES A BLANK POST (D124 — the write-boundary enforcer). Every legitimate caller posts REAL content:
// a recap, a scene-merge summary, a `[check: …]` line, an illustration (media-only counts — the refs ARE the
// body), the restore notice. The three callers that used to post `""` were rpg minting an empty "state
// anchor" slot to key a hand-written snapshot; those are HAND ROWS now (`rpg_snapshots.variantId IS NULL`),
// and this refusal is what makes the content-less canon row — which leaked into export, digests, plugin
// reads, automation facts, counts, forks and every client cache — UNREPRESENTABLE rather than filtered.

import { batchMany } from "@orb/db/kit";
import type { ChatContext } from "../context";
import type { PostNarratorMessage, PostNarratorMessageDeps } from "../contract/context";
import { buildCommittedMessageView, insertCanonMessageStatements, insertMessageAssetStatements } from "../persistence/canon-write";
import { loadMaxMessageSeq } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { hostUserIdOf } from "../substrate/roster-host";

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
    const hostUserId = hostUserIdOf(roster);
    if (hostUserId === null) {
      throw new Error(`postNarratorMessage: chat ${chatId} has no host to author the narrator identity under`);
    }
    const group = await ctx.mintSyntheticGroupCharacter({ ownerId: hostUserId, chatId });

    // ONE body STRING: the narrator text + one markdown image ref per media asset (D51 — never stored blocks).
    const refs = mediaRefs.map((assetId) => `![${NARRATOR_MEDIA_ALT}](asset:${assetId})`).join("\n");
    const body = buildBody(content, refs);
    // THE WRITE-BOUNDARY REFUSAL (D124): a content-less canon row is not a message and must not exist. Checked
    // on the ASSEMBLED body, so a media-only post (blank text, real refs) is legal and only a genuinely empty
    // post is refused. A caller reaching here with nothing to say is a BUG in that caller, not user input —
    // so it throws rather than returning a soft result nobody would read.
    if (body.trim() === "") {
      throw new Error(`postNarratorMessage: refused a blank post to chat ${chatId} — a content-less canon row is not a message (D124)`);
    }

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
