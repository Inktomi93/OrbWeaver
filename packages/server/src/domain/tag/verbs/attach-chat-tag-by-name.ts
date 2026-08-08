// The internal resolve-or-create-by-name CHAT-tag attach — `attachCardTagByName`'s sibling one junction over,
// minted for R6 (the orb-native chat bundle carries its tag overlay by NAME, because tag ids are no more
// preserved across a box than chat ids are). Same two race-safe idempotent steps: resolve-or-create the
// owner's tag by name (try-insert, fall back to the existing row on conflict), then insert the junction.
//
// TWO DIFFERENCES FROM THE CARD SIBLING, both D30 rather than taste:
//   • no `status` — `chat_tags` has no proposed/accepted surface. A chat label is placed by the person who
//     wants it, so there is nothing to stage and nothing to review.
//   • the junction carries the TAGGER (`ownerId`) as part of its PK, so "already attached" means already
//     attached BY THIS USER; a co-member's identical label is a different row and is left alone.
//
// Not principal-gated — `ownerId` is the caller-resolved owner and the caller has already resolved authority
// on the chat (the bundle import minted it). A blank name is a no-op.

import { DomainOperationError } from "@orb/kit/errors";
import { normalizeTagName } from "@orb/kit/tag";
import type { AttachChatTagByNameParams } from "../contract/params.ts";
import type { TagContext, TagService } from "../contract/service.ts";
import { insertJunctionRow } from "../persistence/junctions.ts";
import { findTagIdByName, insertTagIfAbsent } from "../persistence/queries.ts";

export function createAttachChatTagByName(ctx: TagContext): TagService["attachChatTagByName"] {
  return async ({ ownerId, chatId, tagName, source = "manual" }: AttachChatTagByNameParams): Promise<boolean> => {
    const name = normalizeTagName(tagName);
    if (name === "") {
      return false;
    }
    const created = await insertTagIfAbsent({ db: ctx.db, ownerId, name, tagId: ctx.newTagId(), source });
    const tagId = created ?? (await findTagIdByName(ctx.db, ownerId, name));
    if (tagId === undefined) {
      // Unreachable: the INSERT conflicted, so an owned row folding to this name exists and the lookup
      // re-reads it. (Verbatim the card sibling's argument — one failure mode, one sentence.)
      throw new DomainOperationError("tag_resolve_failed", `resolve-or-create tag "${name}" found no row after a unique conflict`);
    }
    // `status` is inert on the chat arm (the junction has no such column) — passed only because the shared
    // dispatch's `AttachArgs` is one shape across five target types.
    await insertJunctionRow({ db: ctx.db, targetType: "chat", targetId: chatId, tagId, taggerId: ownerId, status: "accepted" });
    return true;
  };
}
