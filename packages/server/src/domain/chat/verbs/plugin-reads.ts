// Canon reaches guests only after the SQL history floor and server-side hidden-content strip.

import type { PluginCharacterView, PluginChatReads, PluginMessageView } from "@orb/contracts/plugin";
import { PLUGIN_READ_CONTENT_MAX_CHARS } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { characters, chatParticipants, messages, messageVariants } from "@orb/db";
import { stripHiddenSpans } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import { and, desc, eq, gte, isNull } from "drizzle-orm";

const PLUGIN_MESSAGE_DEFAULT_LIMIT = 20;
const PLUGIN_MESSAGE_MAX_LIMIT = 50;

/**
 * Recent canon projected to the REDUCED plugin view: id/role/authorDisplayName/
 * characterId/seq/content only, oldest→newest, content capped — no economics/promptSnapshot.
 *
 * `opts.floorSeq` is the VIEWER's history floor: rows below it are pre-join for this human and are withheld
 * by the query itself. The caller must obtain it from chat's `resolveViewerVisibility` (a non-member never
 * reaches this function at all — the bridge short-circuits to `[]`).
 *
 * `opts.readsHidden` is the §3.6 / D106 hidden-content verdict from the SAME visibility resolve: `false` (a
 * member) STRIPS hidden-class spans (`<lie>`/`<ofilter>`) from each body BEFORE it crosses the realm boundary,
 * so an untrusted guest realm running as a non-host member never receives a GM-plane secret; `true` (the host
 * reveal plane) reads verbatim. Stripping here — not a post-filter — keeps the security predicate at the read.
 */
export async function loadPluginMessages(db: Db, chatId: ChatId, opts: Parameters<PluginChatReads["listMessages"]>[1]): Promise<readonly PluginMessageView[]> {
  const limit = Math.min(opts.limit ?? PLUGIN_MESSAGE_DEFAULT_LIMIT, PLUGIN_MESSAGE_MAX_LIMIT);
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      characterId: messages.characterId,
      authorName: characters.name,
      seq: messages.seq,
      content: messageVariants.content,
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .leftJoin(characters, eq(characters.id, messages.characterId))
    .where(and(eq(messages.chatId, chatId), gte(messages.seq, opts.floorSeq)))
    .orderBy(desc(messages.seq))
    .limit(limit);
  return rows
    .map((r) => {
      // §3.6 / D106: strip hidden-class spans for a member BEFORE the cap, so the truth never reaches the guest
      // realm (identity when nothing is hidden; the host reveal plane reads verbatim).
      const body = opts.readsHidden ? r.content : stripHiddenSpans(r.content).content;
      return {
        id: r.id,
        role: r.role,
        authorDisplayName: r.authorName ?? r.role,
        characterId: r.characterId,
        seq: r.seq,
        content: body.length > PLUGIN_READ_CONTENT_MAX_CHARS ? body.slice(0, PLUGIN_READ_CONTENT_MAX_CHARS) : body,
      };
    })
    .reverse();
}

/**
 * The invocation chat's PRESENT CHARACTER roster, projected to the reduced {@link PluginCharacterView}
 * (#788 F11 — the ST `context.characters` parity arm): id/name/avatar only, never a co-participant's full card.
 *
 * SCOPED TO THIS ROOM AND MEMBER-GATED UPSTREAM. This is a principal-free read of `chat_participants` for ONE
 * `chatId`, exactly the `loadPluginMessages` posture: the caller (`domain/plugin/substrate/bridge`) resolves the
 * installer's membership through chat's `resolveViewerVisibility` FIRST and short-circuits a non-member to `[]`,
 * so a non-member never reaches this function and a plugin can only read the roster of a room it is in. The read
 * itself carries no owner filter because a room's roster is the room's own state, member-visible — the same
 * membership verdict that admits `listMessages` admits this.
 *
 * PRESENT CHARACTER SEATS ONLY: `kind = 'character'` (human seats are participants, not characters — the ST
 * `getCharacters` surface is the character cast) and `left_seq IS NULL` (a departed seat is not present roster).
 * `avatarAssetId` crosses as inert text a guest may hand to an `image` node or `assets.read`.
 */
export async function loadPluginCharacters(db: Db, chatId: ChatId): Promise<readonly PluginCharacterView[]> {
  const rows = await db
    .select({
      characterId: chatParticipants.characterId,
      name: characters.name,
      avatarAssetId: characters.avatarAssetId,
    })
    .from(chatParticipants)
    .innerJoin(characters, eq(characters.id, chatParticipants.characterId))
    .where(and(eq(chatParticipants.chatId, chatId), eq(chatParticipants.kind, "character"), isNull(chatParticipants.leftSeq)))
    .orderBy(chatParticipants.joinSeq);
  return rows.map((r) => ({ id: r.characterId ?? "", name: r.name, avatarAssetId: r.avatarAssetId }));
}
