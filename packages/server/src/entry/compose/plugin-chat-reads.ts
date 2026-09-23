// The plugin membrane's chat canon READ, narrowed onto `PluginHostOps.chat.listMessages` (the compose-root
// canon-read precedent `automation-watcher.ts::getMessageFact` set). Extracted from the `createServices`
// closure for ONE reason: it is the SQL that decides which canon bytes reach an untrusted guest realm, and a
// security predicate buried in a 1500-line composition closure has no reachable test seam.
//
// THE FLOOR IS APPLIED IN THE `WHERE`, never as a post-filter. `floorSeq` is REQUIRED and is the viewer's own
// D16 canon floor, resolved by the caller through chat's `resolveViewerVisibility` op
// (`domain/plugin/substrate/bridge`). Filtering after `LIMIT` would silently shrink a clamped member's page;
// filtering in SQL means `limit` pages what that human may actually see. `NO_HISTORY_FLOOR` (0) is the
// unclamped case and `messages.seq` is 1-based, so the predicate is inert for the common (`full`) member and
// this read is byte-identical to the pre-clamp one for them.

import type { PluginCharacterView, PluginMessageView } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { characters, chatParticipants, messages, messageVariants } from "@orb/db";
import { stripHiddenSpans } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import { and, desc, eq, gte, isNull } from "drizzle-orm";

/** The per-message content cap crossing the realm boundary (the sandbox's 1 MiB whole-payload inbound cap is
 *  the coarse backstop; this is the per-row belt). */
const PLUGIN_MESSAGE_CONTENT_CAP = 16_384;
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
export async function loadPluginMessages(
  db: Db,
  chatId: ChatId,
  opts: { readonly limit?: number | undefined; readonly floorSeq: number; readonly readsHidden: boolean },
): Promise<readonly PluginMessageView[]> {
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
        content: body.length > PLUGIN_MESSAGE_CONTENT_CAP ? body.slice(0, PLUGIN_MESSAGE_CONTENT_CAP) : body,
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
