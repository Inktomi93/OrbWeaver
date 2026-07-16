// verbs: attachTag · detachTag · bulkAttachTag — the junction trio (one file: they share ownership +
// junction-dispatch mechanics). Every op: verify the tag is owned, gate the target via
// ensureTargetAccessible, then dispatch the junction write. A manual attach defaults status to accepted;
// import/corpus distillation pass pending to stage a suggestion.

import type { TagStatus } from "@orb/contracts/tag";
import { TagNotFoundError } from "../contract/errors";
import type { AttachTagParams, BulkAttachTagParams, DetachTagParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { bulkInsertJunctionRows, deleteJunctionRow, ensureTargetAccessible, insertJunctionRow } from "../persistence/junctions";
import { fetchOwnedTagIds, loadOwnedTag } from "../persistence/queries";

const DEFAULT_ATTACH_STATUS: TagStatus = "accepted";

type AttachTrio = Pick<TagService, "attachTag" | "bulkAttachTag" | "detachTag">;

export function createAttach(ctx: TagContext): AttachTrio {
  const attachTag: TagService["attachTag"] = async (params: AttachTagParams) => {
    const ownerId = params.principal.userId;
    const tag = await loadOwnedTag(ctx.db, params.tagId, ownerId);
    if (tag === undefined) {
      throw new TagNotFoundError(params.tagId);
    }
    await ensureTargetAccessible({
      db: ctx.db,
      principal: params.principal,
      requireParticipant: ctx.requireParticipant,
      targetType: params.targetType,
      targetId: params.targetId,
    });
    await insertJunctionRow({
      db: ctx.db,
      targetType: params.targetType,
      targetId: params.targetId,
      tagId: params.tagId,
      taggerId: ownerId,
      status: params.status ?? DEFAULT_ATTACH_STATUS,
    });
    await ctx.audit({
      actorUserId: ownerId,
      action: "tag.attach",
      entityType: "tag",
      entityId: params.tagId,
      metadata: {
        targetType: params.targetType,
        targetId: params.targetId,
        status: params.status ?? DEFAULT_ATTACH_STATUS,
      },
    });
    ctx.emitUserEvent(ownerId, { type: "tagsChanged", tagId: params.tagId });
  };

  const detachTag: TagService["detachTag"] = async (params: DetachTagParams) => {
    const ownerId = params.principal.userId;
    const tag = await loadOwnedTag(ctx.db, params.tagId, ownerId);
    if (tag === undefined) {
      throw new TagNotFoundError(params.tagId);
    }
    await ensureTargetAccessible({
      db: ctx.db,
      principal: params.principal,
      requireParticipant: ctx.requireParticipant,
      targetType: params.targetType,
      targetId: params.targetId,
    });
    await deleteJunctionRow({
      db: ctx.db,
      targetType: params.targetType,
      targetId: params.targetId,
      tagId: params.tagId,
      taggerId: ownerId,
    });
    await ctx.audit({
      actorUserId: ownerId,
      action: "tag.detach",
      entityType: "tag",
      entityId: params.tagId,
      metadata: { targetType: params.targetType, targetId: params.targetId },
    });
    ctx.emitUserEvent(ownerId, { type: "tagsChanged", tagId: params.tagId });
  };

  const bulkAttachTag: TagService["bulkAttachTag"] = async (params: BulkAttachTagParams) => {
    const ownerId = params.principal.userId;
    if (params.tagIds.length === 0) {
      return;
    }
    const owned = new Set(await fetchOwnedTagIds(ctx.db, ownerId, params.tagIds));
    const missing = params.tagIds.find((id) => !owned.has(id));
    if (missing !== undefined) {
      throw new TagNotFoundError(missing);
    }
    await ensureTargetAccessible({
      db: ctx.db,
      principal: params.principal,
      requireParticipant: ctx.requireParticipant,
      targetType: params.targetType,
      targetId: params.targetId,
    });
    await bulkInsertJunctionRows({
      db: ctx.db,
      targetType: params.targetType,
      targetId: params.targetId,
      tagIds: params.tagIds,
      taggerId: ownerId,
      status: params.status ?? DEFAULT_ATTACH_STATUS,
    });
    await ctx.audit({
      actorUserId: ownerId,
      action: "tag.bulkAttach",
      entityType: "tag",
      entityId: null,
      metadata: {
        targetType: params.targetType,
        targetId: params.targetId,
        tagIds: [...params.tagIds],
        status: params.status ?? DEFAULT_ATTACH_STATUS,
      },
    });
    ctx.emitUserEvent(ownerId, { type: "tagsChanged" });
  };

  return { attachTag, detachTag, bulkAttachTag };
}
