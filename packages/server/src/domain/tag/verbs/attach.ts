// verbs: attachTag · detachTag · bulkAttachTag — the junction trio (one file: they share the ownership +
// junction-dispatch mechanics; splitting scatters identical guards). Every op: (1) verify the tag is owned
// (TagNotFoundError), (2) gate the TARGET via `ensureTargetAccessible` (target-derived ownership for the four
// owned types; the injected `requireParticipant` membership gate for chat — D30), (3) dispatch the junction
// write through the registry. The `status` (proposed/accepted) is honored only for the character junction;
// a manual attach defaults `accepted` — import/corpus distillation pass `pending` to stage a suggestion, and
// re-attaching with `accepted` flips a pending row (the "Accept").

import type { TagStatus } from "@orb/contracts/tag";
import { TagNotFoundError } from "../contract/errors";
import type { AttachTagParams, BulkAttachTagParams, DetachTagParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import {
  bulkInsertJunctionRows,
  deleteJunctionRow,
  ensureTargetAccessible,
  insertJunctionRow,
} from "../persistence/junctions";
import { fetchOwnedTagIds, loadOwnedTag } from "../persistence/queries";

// A manual attach is a LIVE tag; the staging (`pending`) flavor is reached only by passing `status` explicitly.
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
    // Best-effort audit AFTER the junction write (a not-found/denied target threw above).
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
    // Best-effort audit AFTER the junction delete (see the attach note).
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
    // ONE ownership belt for all requested tags; any non-owned id is a not-found (no partial attach).
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
    // Best-effort audit — ONE row for the bulk op (no per-tag fan-out; the set rides metadata).
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
