// The narrator-post op: persist ONE assistant-role narrator message through chat's
// canon-write path — recaps, scene-merge summaries, the server-minted `[check: …]` result
// line, illustration posts. Authored by the synthetic group character (D16 inv-9 — a real
// authoring identity, never a user id: `authorUserId` is only ever a principal that ACTED, the D19 rule; the
// group char is minted lazily if the room has none). `media` ride the body as embedded `![alt](asset:<id>)`
// refs (D51) with `message_assets` retaining rows (the asset-ref registry's GC anchor). Returns the new
// message + its VARIANT id (the minting op hands it back so a caller needs no second read). Checkpoint restore
// may contribute ONE RPG-owned statement after those ids are minted; it rides this same pure-write batch so
// the visible restore marker and its hand snapshot have one commit. STANDALONE,
// principal-free (rpg gates authority): the `createGenerateImage` persist/emit dance, the
// `createExtractQuiet` compose-built shape.
//
// IT REFUSES A BLANK POST (D124 — the write-boundary enforcer). Every legitimate caller posts REAL content:
// a recap, a scene-merge summary, a `[check: …]` line, an illustration (media-only counts — the refs ARE the
// body), the restore notice. The three callers that used to post `""` were rpg minting an empty "state
// anchor" slot to key a hand-written snapshot; those are HAND ROWS now (`rpg_snapshots.variantId IS NULL`),
// and this refusal is what makes the content-less canon row — which leaked into export, digests, plugin
// reads, automation facts, counts, forks and every client cache — UNREPRESENTABLE rather than filtered.

import type { ChatContext } from "../context.ts";
import type { PostNarratorMessage, PostNarratorMessageDeps } from "../contract/context.ts";
import { buildCommittedMessageView, commitCanonAppend, insertCanonMessageStatements, insertMessageAssetStatements } from "../persistence/canon-write.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";
import { assistantTurnDelta } from "../substrate/stats-delta.ts";

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
  return async (chatId, content, media, options) => {
    const mediaRefs = media ?? [];
    // The group character is owned by the room HOST (the D19 funding/authority identity) — the same
    // owner every narrator turn mints under (`turn.ts` runAiRound).
    const participants = await loadParticipants(ctx.db, chatId);
    const hostUserId = hostUserIdOf(participants);
    if (hostUserId === null) {
      throw new Error(`postNarratorMessage: chat ${chatId} has no host to author the narrator identity under`);
    }

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

    // A narrator post is a committed canon row, so it CLAIMS (R0 F4(a)) -- before the write, per the
    // ordering invariant. This op is principal-free by design (automation/plugins drive it), so there
    // is no authority guard to sequence after: the caller was authorized at ITS own boundary.
    //
    // AFTER EVERY REFUSAL THAT CAN BE DECIDED WITHOUT WRITING, and that ordering is the point (#1463 item 6):
    // claiming is one-way — it publishes the husk into every member's library and replays the creation-time
    // economics — so a post that was never going to commit (no host to author under, nothing to say) must not
    // spend it. The invariant it must not break is the other side: the claim still precedes the WRITE, because
    // the replay counts the canon present at claim and a claim after the write would double-count this row.
    await deps.claimChat(chatId);
    const group = await ctx.mintSyntheticGroupCharacter({ ownerId: hostUserId, chatId });

    // The head allocation + its one expected collision ride the SHARED retry (`commitCanonAppend`): a
    // concurrent canon writer may have taken this seq, in which case the whole attempt — ids included — is
    // discarded and re-minted against the new head. Every id is minted INSIDE the attempt for that reason.
    const { view, messageId, variantId } = await commitCanonAppend(ctx.db, chatId, (seq) => {
      const now = ctx.now();
      const attemptMessageId = ctx.newMessageId();
      const params = {
        messageId: attemptMessageId,
        variantId: ctx.newMessageVariantId(),
        chatId,
        seq,
        role: "assistant" as const,
        // DECLARED purpose (the kind axis) — not inferred later from "assistant + the synthetic group char",
        // which is exactly the inference that evaporates when that character is deleted (its FK SET-NULLs) or
        // when the room's output dial flips. The canon `role` stays `assistant`, and so does the DELIVERED
        // role: the narrator→wire-`system` mapping that was briefly a SHAPE-time projection is owner-ruled out
        // (2026-08-18 — group narration is the assistant's own output voice).
        kind: "narrator" as const,
        authorUserId: null,
        characterId: group.characterId,
        personaId: null,
        now,
        variant: { content: body },
        // Origin — absent for rpg posts (byte-identical DB defaults 'human'/0); the automation
        // `generate_image` non-quiet post threads its firing rule's initiator + cascade depth so the posted
        // image's `messageCommitted` fact resolves at depth ≥ 1 and a non-opted re-fire is cascade-suppressed.
        ...(options !== undefined && "initiator" in options ? { initiator: options.initiator, automationDepth: options.automationDepth } : {}),
      };
      const assetRows = mediaRefs.map((assetId) => ({ id: ctx.newMessageAssetId(), messageId: attemptMessageId, assetId }));
      const statements = insertCanonMessageStatements(ctx.db, params);
      ctx.applyStatsDelta(statements, ctx.db, assistantTurnDelta({ ownerId: hostUserId, characterId: group.characterId, economics: { content: body }, now }));
      // An `/imagine` post is an ASSISTANT row with real `asset:` spans — stamped `illustration` so the
      // wire-history projection never rides it back as a model-emitted picture (§5.3b/§6.7).
      statements.push(...insertMessageAssetStatements(ctx.db, { rows: assetRows, origin: "illustration", now }));
      // The only caller is RPG checkpoint restore. Build AFTER ids exist, append LAST: a chat-side failure keeps
      // the RPG row absent, and an RPG-side failure rolls every preceding marker statement back.
      if (options !== undefined && "rpgRestoreStatement" in options) {
        statements.push(options.rpgRestoreStatement({ messageId: attemptMessageId, variantId: params.variantId }));
      }
      return { statements, result: { view: buildCommittedMessageView(params), messageId: attemptMessageId, variantId: params.variantId } };
    });

    await deps.emit({ type: "messageCommitted", chatId, messageId, view });
    // A new narrator message moved chat-list recency → fan `chatsChanged` (list-only) to present human members.
    await ctx.emitChatChanged(chatId);
    return { messageId, variantId };
  };
}
