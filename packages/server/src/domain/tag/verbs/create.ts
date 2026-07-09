// verb: createTag — mint a new owner-scoped tag. The name is CANONICALIZED through `normalizeTagName` (the one
// chokepoint: trim + whitespace-collapse, display casing kept) before insert, so a manual create dedupes
// identically to import/seeder. TOCTOU-safe: the `(ownerId, lower(name))` functional unique index is the race
// guard — a concurrent OR case-variant duplicate ("Female" vs "female") surfaces as a constraint violation on
// INSERT, classified into a `DomainConflictError` (never a phantom pre-SELECT). The id is the injected
// `newTagId` (determinism seam).

import { isConstraintViolation, tags } from "@orb/db";
import { DomainConflictError, DomainOperationError } from "@orb/kit/errors";
import { normalizeTagName } from "@orb/kit/tag";
import type { CreateTagParams } from "../contract/params";
import type { TagContext, TagService } from "../contract/service";
import { toTagView } from "../persistence/queries";

export function createCreate(ctx: TagContext): TagService["createTag"] {
  return async (params: CreateTagParams) => {
    const ownerId = params.principal.userId;
    const { input } = params;
    const name = normalizeTagName(input.name);
    if (name.length === 0) {
      // The wire min(1) passes a whitespace-only name; normalized it would be an empty-name row — refuse.
      throw new DomainOperationError(
        "tag_name_empty",
        "a tag name cannot be empty/whitespace-only",
      );
    }
    try {
      const inserted = await ctx.db
        .insert(tags)
        .values({
          id: ctx.newTagId(),
          ownerId,
          name,
          color: input.color ?? null,
          source: input.source ?? null,
        })
        .returning();
      const row = inserted[0];
      if (row === undefined) {
        throw new DomainOperationError("tag_insert_failed", "tag insert returned no row");
      }
      // Best-effort audit AFTER the insert landed (a refused/conflicted create writes no row).
      await ctx.audit({
        actorUserId: ownerId,
        action: "tag.create",
        entityType: "tag",
        entityId: row.id,
        metadata: { name },
      });
      ctx.emitUserEvent(ownerId, { type: "tagsChanged", tagId: row.id });
      return toTagView(row);
    } catch (err) {
      if (isConstraintViolation(err)?.kind === "unique") {
        const dup = new DomainConflictError(`a tag named "${name}" already exists`);
        dup.cause = err;
        throw dup;
      }
      throw err;
    }
  };
}
