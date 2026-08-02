// verb: updateTag — owner-scoped partial patch. color/color2 are tri-state on the wire: null clears to the
// theme default, undefined leaves the column untouched. A rename into an existing name surfaces the
// (ownerId, name) unique violation, classified into a DomainConflictError.

import type { UpdateTagInput } from "@orb/contracts/tag";
import { isConstraintViolation } from "@orb/db/kit";
import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import { normalizeTagName } from "@orb/kit/tag";
import { TagNotFoundError } from "../contract/errors";
import type { UpdateTagParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { loadOwnedTag, toTagView, updateOwnedTag } from "../persistence/queries";

type TagPatch = Parameters<typeof updateOwnedTag>[3];

function buildPatch(input: UpdateTagInput): TagPatch {
  const patch: TagPatch = {};
  if (input.name !== undefined) {
    // A whitespace-only rename normalizes to "" (the wire min(1) passes it) — refuse, never an empty-name row.
    const name = normalizeTagName(input.name);
    if (name.length === 0) {
      throw new DomainOperationError("tag_name_empty", "a tag name cannot be empty/whitespace-only");
    }
    patch.name = name;
  }
  if (input.color !== undefined) {
    patch.color = input.color;
  }
  if (input.color2 !== undefined) {
    patch.color2 = input.color2;
  }
  if (input.source !== undefined) {
    patch.source = input.source;
  }
  if (input.folderType !== undefined) {
    patch.folderType = input.folderType;
  }
  if (input.isHiddenOnCard !== undefined) {
    patch.isHiddenOnCard = input.isHiddenOnCard;
  }
  return patch;
}

export function createUpdate(ctx: TagContext): TagService["updateTag"] {
  return async (params: UpdateTagParams) => {
    const ownerId = params.principal.userId;
    const existing = await loadOwnedTag(ctx.db, params.tagId, ownerId);
    if (existing === undefined) {
      throw new TagNotFoundError(params.tagId);
    }
    const patch = buildPatch(params.patch);
    if (Object.keys(patch).length === 0) {
      return toTagView(existing);
    }
    try {
      const updated = await updateOwnedTag(ctx.db, params.tagId, ownerId, patch);
      if (updated === undefined) {
        throw new TagNotFoundError(params.tagId);
      }
      ctx.emitUserEvent(ownerId, { type: "tagsChanged", tagId: params.tagId });
      return toTagView(updated);
    } catch (err) {
      if (isConstraintViolation(err)?.kind === "unique") {
        const dup = new DomainConflictError(`a tag named "${params.patch.name ?? ""}" already exists`);
        dup.cause = err;
        throw dup;
      }
      throw err;
    }
  };
}
