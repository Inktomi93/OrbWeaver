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

import type { PluginMessageView } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import { characters, messages, messageVariants } from "@orb/db";
import { stripHiddenSpans } from "@orb/kit/content";
import type { ChatId } from "@orb/kit/ids";
import { and, desc, eq, gte } from "drizzle-orm";

/** The per-message content cap crossing the realm boundary (the sandbox's 1 MiB whole-payload inbound cap is
 *  the coarse backstop; this is the per-row belt). */
const PLUGIN_MESSAGE_CONTENT_CAP = 16_384;
const PLUGIN_MESSAGE_DEFAULT_LIMIT = 20;
const PLUGIN_MESSAGE_MAX_LIMIT = 50;

/**
 * Recent canon projected to the REDUCED plugin view (plugin-design/01 §2): id/role/authorDisplayName/
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
